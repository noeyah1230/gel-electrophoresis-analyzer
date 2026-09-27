import { invoke, isTauri } from "@tauri-apps/api/core";
import { Project, validateProject } from "./model";
export const native = isTauri();
const db = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("gel-notebook-preview", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("projects");
      r.result.createObjectStore("recovery");
      r.result.createObjectStore("settings");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
async function op<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode),
      r = fn(tx.objectStore(store));
    tx.oncomplete = () => {
      resolve(r.result);
      d.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      d.close();
    };
  });
}
export async function saveProject(p: Project): Promise<void> {
  if (native)
    return invoke("save_project", { id: p.id, json: JSON.stringify(p) });
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(["projects", "recovery"], "readwrite"),
      s = tx.objectStore("projects"),
      r = s.get(p.id);
    r.onsuccess = () => {
      if (r.result && r.result.revision !== p.revision)
        tx.objectStore("recovery").put(r.result, p.id);
      s.put(p, p.id);
    };
    tx.oncomplete = () => {
      d.close();
      resolve();
    };
    tx.onerror = () => {
      d.close();
      reject(tx.error);
    };
  });
}
export async function listProjects(): Promise<Project[]> {
  const all = native
    ? await invoke<string[]>("list_projects")
    : await op<Project[]>("projects", "readonly", (s) => s.getAll());
  return all
    .flatMap((v) => {
      try {
        return [validateProject(typeof v === "string" ? JSON.parse(v) : v)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function loadProject(id: string): Promise<Project> {
  if (native)
    return validateProject(
      JSON.parse(await invoke<string>("load_project", { id })),
    );
  return validateProject(await op("projects", "readonly", (s) => s.get(id)));
}
export async function recoverProject(id: string): Promise<Project> {
  if (native)
    return validateProject(
      JSON.parse(await invoke<string>("recover_project", { id })),
    );
  return validateProject(await op("recovery", "readonly", (s) => s.get(id)));
}
export async function deleteProject(id: string): Promise<void> {
  if (native) return invoke("delete_project", { id });
  await op("projects", "readwrite", (s) => s.delete(id));
  await op("recovery", "readwrite", (s) => s.delete(id));
}
export async function presets(): Promise<Record<string, number[]>> {
  if (native) return JSON.parse(await invoke<string>("read_presets"));
  return (await op("settings", "readonly", (s) => s.get("presets"))) || {};
}
export async function savePresets(
  value: Record<string, number[]>,
): Promise<void> {
  if (native) return invoke("write_presets", { json: JSON.stringify(value) });
  await op("settings", "readwrite", (s) => s.put(value, "presets"));
}
export async function exportFile(
  name: string,
  bytes: Uint8Array,
): Promise<string> {
  if (native) return invoke("export_file", { name, bytes: Array.from(bytes) });
  const blob = new Blob([new Uint8Array(bytes)]),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "Saved using browser downloads";
}
