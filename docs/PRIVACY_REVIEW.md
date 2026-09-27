# Privacy and publication review

Review date: 2026-09-27. Scope: supplied workspace, candidate source/assets, application data flow, and local Git object database. This is a source-publication review, not scientific validation or a complete security audit.

## Findings and handling

- No real gel dataset, research document, patient/collaborator record, university branding, or credential was identified in the candidate source files. Demo lane labels and image patterns are generated in code.
- The old README contained machine-specific temporary build-tool paths. Those setup instructions were replaced with portable prerequisites.
- Existing native executables and build artifacts contain machine-specific build paths. `release/`, `dist/`, `src-tauri/target/`, generated schemas, and installed dependencies are excluded. No existing binary is a public release asset.
- Original icon files form one app-mark family. They contain no laboratory images; authorship/release rights remain part of the pending ownership review.
- `.gitignore` excludes environment files, credential/key formats, app records, common research folders, databases, experiment image/data formats, archives, IDE settings, caches, and temporary files. Only named synthetic screenshots and app-icon PNGs are allowed through image exclusions.
- The repository initially had **zero commits, no refs/remotes, and no reflog history**. Its object database contained 17 unreachable blobs and one empty tree. One old README blob retained temporary toolchain paths. Unreachable objects are not sent by an ordinary branch push; do not upload or share the `.git` directory itself. No old history is required for the first public commit.
- Dependency copyright-holder names and public registry/source URLs are third-party attribution, not collaborator data. The test fixture `/secret/sample.png` is a fabricated path used to verify CSV path omission.

## Application data flow

The frontend reads selected files with FileReader, decodes them into a canvas, computes brightness profiles/peaks locally, and stores projects through either IndexedDB or the native IPC bridge. Rust commands write to the application's local data directory and use an explicit native save dialog for exports. No upload, analytics, remote processing, account, HTTP plugin, or update integration was found. Production CSP limits connections to the internal Tauri bridge.

Saved project JSON embeds original image bytes, a filename, notes, labels, and a fingerprint. The native app also saves an original image and a recovery record. Original bytes may retain metadata. CSV omits image paths and embedded image metadata but still contains entered labels/notes; PNG visibly contains the gel and annotations. **Neither exports nor saved projects are automatically safe to publish.**

The code's local-processing design does not prove that every OS helper or dependency never attempts a connection. Native network observation, fresh offline installation, and full failure-path checks remain pending. Backups and separately copied exports are outside app control.

## Repeatable publication check

Run `python3 scripts/check-publication.py` to inspect candidate filenames/content and list the proposed upload set. It reports potential patterns without printing matched secrets. Run with `--write-manifest` to refresh `docs/PUBLICATION_FILES.txt` after changes, then review that list. The check includes all committed objects when history exists and reports unreachable-object findings separately. It is a heuristic screen, not a guarantee; review text, image pixels, metadata, and ownership as well.

Never use `git add -f` on excluded research data. Do not attach native builds or a workspace archive as release assets. Future changes require a fresh review; this record applies only to the inspected source snapshot.
