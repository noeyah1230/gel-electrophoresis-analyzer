#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;
struct StorageLock(Mutex<()>);
fn local_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Local storage unavailable")?;
    fs::create_dir_all(&path).map_err(|_| "Could not create local storage")?;
    Ok(path)
}
fn project_dir(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Invalid project identifier".into());
    }
    Ok(local_root(app)?.join("Projects").join(id))
}
fn valid_json(json: &str, id: &str) -> Result<Value, String> {
    let v: Value = serde_json::from_str(json).map_err(|_| "Invalid project JSON")?;
    if v["schemaVersion"] != 1 || v["id"] != id || !v["lanes"].is_array() || !v["revision"].is_u64()
    {
        return Err("Unsupported project record".into());
    }
    Ok(v)
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "Clock unavailable")?
        .as_nanos();
    let temp = path.with_extension(format!("gel-{}-{nonce}.pending", std::process::id()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "Could not create temporary save")?;
        file.write_all(bytes).map_err(|_| "Could not write save")?;
        file.sync_all().map_err(|_| "Could not sync save")?;
        fs::rename(&temp, path).map_err(|_| "Could not commit save")?;
        if let Some(parent) = path.parent() {
            if let Ok(dir) = File::open(parent) {
                let _ = dir.sync_all();
            }
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}
fn usable(path: &Path, id: &str) -> Option<String> {
    let s = fs::read_to_string(path).ok()?;
    valid_json(&s, id).ok()?;
    Some(s)
}
#[tauri::command]
fn save_project(
    app: tauri::AppHandle,
    state: tauri::State<StorageLock>,
    id: String,
    json: String,
) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "Storage busy")?;
    if json.len() > 65 * 1024 * 1024 {
        return Err("Project too large".into());
    }
    let value = valid_json(&json, &id)?;
    let dir = project_dir(&app, &id)?;
    fs::create_dir_all(&dir).map_err(|_| "Could not create project folder")?;
    let data = value["image"]["dataUrl"].as_str().ok_or("Missing image")?;
    let (header, encoded) = data.split_once(',').ok_or("Invalid image")?;
    let extension = match header {
        "data:image/png;base64" => "png",
        "data:image/jpeg;base64" => "jpg",
        _ => return Err("Unsupported image".into()),
    };
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid image encoding")?;
    let hash = format!("{:x}", Sha256::digest(&bytes));
    if value["image"]["fingerprint"].as_str() != Some(hash.as_str()) {
        return Err("Original image fingerprint mismatch".into());
    }
    let original = dir.join(format!("original.{extension}"));
    if original.exists() {
        let old = fs::read(&original).map_err(|_| "Original unreadable")?;
        if old != bytes {
            return Err("Original image cannot be replaced".into());
        }
    } else {
        atomic_write(&original, &bytes)?;
    }
    let main = dir.join("project.json");
    if let Some(old) = usable(&main, &id) {
        let previous: Value =
            serde_json::from_str(&old).map_err(|_| "Invalid previous revision")?;
        if previous["revision"] != value["revision"] {
            atomic_write(&dir.join("recovery.json"), old.as_bytes())?;
        }
    }
    atomic_write(&main, json.as_bytes())
}
#[tauri::command]
fn load_project(
    app: tauri::AppHandle,
    state: tauri::State<StorageLock>,
    id: String,
) -> Result<String, String> {
    let _guard = state.0.lock().map_err(|_| "Storage busy")?;
    let dir = project_dir(&app, &id)?;
    usable(&dir.join("project.json"), &id)
        .or_else(|| usable(&dir.join("recovery.json"), &id))
        .ok_or("No usable project or recovery copy".into())
}
#[tauri::command]
fn recover_project(
    app: tauri::AppHandle,
    state: tauri::State<StorageLock>,
    id: String,
) -> Result<String, String> {
    let _guard = state.0.lock().map_err(|_| "Storage busy")?;
    usable(&project_dir(&app, &id)?.join("recovery.json"), &id)
        .ok_or("No usable recovery copy".into())
}
#[tauri::command]
fn list_projects(
    app: tauri::AppHandle,
    state: tauri::State<StorageLock>,
) -> Result<Vec<String>, String> {
    let _guard = state.0.lock().map_err(|_| "Storage busy")?;
    let root = local_root(&app)?.join("Projects");
    fs::create_dir_all(&root).map_err(|_| "Storage unavailable")?;
    let entries = fs::read_dir(root).map_err(|_| "Could not list projects")?;
    let mut records = Vec::new();
    for e in entries.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let id = e.file_name().to_string_lossy().to_string();
        if let Some(v) = usable(&e.path().join("project.json"), &id)
            .or_else(|| usable(&e.path().join("recovery.json"), &id))
        {
            records.push(v);
        }
    }
    Ok(records)
}
#[tauri::command]
fn delete_project(
    app: tauri::AppHandle,
    state: tauri::State<StorageLock>,
    id: String,
) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "Storage busy")?;
    let dir = project_dir(&app, &id)?;
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|_| "Could not delete local project")?;
    }
    Ok(())
}
#[tauri::command]
fn read_presets(app: tauri::AppHandle) -> Result<String, String> {
    let p = local_root(&app)?.join("ladder-presets.json");
    if p.exists() {
        fs::read_to_string(p).map_err(|_| "Could not read presets".into())
    } else {
        Ok("{}".into())
    }
}
#[tauri::command]
fn write_presets(
    app: tauri::AppHandle,
    state: tauri::State<StorageLock>,
    json: String,
) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "Storage busy")?;
    let v: Value = serde_json::from_str(&json).map_err(|_| "Invalid presets")?;
    if json.len() > 1024 * 1024 || !v.is_object() {
        return Err("Invalid presets".into());
    }
    atomic_write(
        &local_root(&app)?.join("ladder-presets.json"),
        json.as_bytes(),
    )
}
#[tauri::command]
async fn export_file(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.len() > 100 * 1024 * 1024
        || name.contains('/')
        || name.contains('\\')
        || (!name.ends_with(".png") && !name.ends_with(".csv"))
    {
        return Err("Invalid export".into());
    }
    let dir = local_root(&app)?.join("Exports");
    fs::create_dir_all(&dir).map_err(|_| "Could not create export folder")?;
    let ext = if name.ends_with(".png") { "png" } else { "csv" };
    let file = rfd::AsyncFileDialog::new()
        .set_directory(&dir)
        .set_file_name(&name)
        .add_filter("Export", &[ext])
        .save_file()
        .await;
    if let Some(file) = file {
        atomic_write(file.path(), &bytes)?;
        Ok("Export saved locally".into())
    } else {
        Ok("Export canceled".into())
    }
}
fn main() {
    tauri::Builder::default()
        .manage(StorageLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            save_project,
            load_project,
            recover_project,
            list_projects,
            delete_project,
            read_presets,
            write_presets,
            export_file
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Gel Notebook");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_replace_preserves_complete_contents() {
        let dir = std::env::temp_dir().join(format!("gel-save-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("project.json");
        fs::write(dir.join("project.pending"), b"unrelated file").unwrap();
        atomic_write(&file, b"original").unwrap();
        atomic_write(&file, b"replacement").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"replacement");
        assert_eq!(
            fs::read(dir.join("project.pending")).unwrap(),
            b"unrelated file"
        );
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_wrong_identity_and_schema() {
        assert!(valid_json(
            r#"{"schemaVersion":1,"id":"a","revision":1,"lanes":[]}"#,
            "a"
        )
        .is_ok());
        assert!(valid_json(
            r#"{"schemaVersion":1,"id":"a","revision":1,"lanes":[]}"#,
            "b"
        )
        .is_err());
        assert!(valid_json(
            r#"{"schemaVersion":2,"id":"a","revision":1,"lanes":[]}"#,
            "a"
        )
        .is_err());
    }
}
