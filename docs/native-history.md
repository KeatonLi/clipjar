# Native clipboard history

## Ownership and capture

The Rust process owns desktop history. A background thread checks the OS clipboard every 700 ms, independently of React rendering and window visibility. It prefers a real image over accompanying fallback text, fingerprints text or RGBA pixels with SHA-256, and shares the manager mutex with mutations and copy-back to prevent self-capture races.

The frontend subscribes to snapshots and uses revision numbers to ignore stale responses. Transient search and selection do not persist native history. A single-instance plugin prevents a second running process from writing the same history.

Polling can miss content overwritten between checks. OS clipboard access and window focus still need testing on each supported platform.

## Files and budgets

Files live under the Tauri application data directory:

```text
history/
  history.json
  images/
    <record-id>.png
```

Typical roots are `%APPDATA%\com.clipjar.desktop\history` on Windows and `~/Library/Application Support/com.clipjar.desktop/history` on macOS. There is no application-owned SQLite database.

| Limit | Behavior |
|-------|----------|
| Ordinary history | 10–500 records, default 100; optional age cleanup, default 30 days |
| Protected content | Favorites and snippets are excluded from automatic count/age/capacity eviction |
| Images | 64 MiB retained PNG budget; 16 MiB per encoded image; at most 64 MiB decoded RGBA per image |
| Metadata | 4 MiB serialized JSON manifest, including settings and records |
| Captured text | At most 1 MiB per record; oversized text produces an error rather than truncation |
| Snippets | Name up to 80 characters; content up to 10,000 characters |

When a new record exceeds capacity, the manager may evict ordinary history. If protected records leave insufficient room, it rejects the new write while preserving the previous state. Protected content is not unlimited; users can delete it explicitly.

Image assets are written before the manifest. Temporary files and atomic replacement commit the new manifest before unreferenced images are removed. Failed writes preserve the previous manifest and in-memory history. Failed asset cleanup is reported, and remaining managed files count toward storage usage. Temporary copies can exceed the retained-data budget during a write; WebView caches and unrelated files are outside that budget.

## Legacy migration

On first bootstrap, the frontend reads old Zustand/localStorage records and separate legacy preferences. Import preserves retained content, timestamps, favorite status, notes and PNG/JPEG images, while replacing old fractional IDs with integer IDs. Ordinary records follow configured count and age retention; favorites and snippets remain protected.

The migration marker is committed together with native history. Only after success does the frontend replace the old envelope with settings-only data and remove separate old history/shortcut keys. Invalid content or failed writes leave the original storage in place. The durable marker prevents repeat imports on later starts.

Migration does not restore images already omitted by the earlier localStorage budget policy, nor compact WebView databases that previously grew.

## Copy and pause

Copying a text record writes its exact content to the OS clipboard. Images are decoded from stored PNG and written through Tauri's native clipboard image API. The manager suppresses the copy-back sample and updates usage in the same serialized path. A failed optional usage save is reported as a warning after a successful copy.

Pause stops capture for 15 or 60 minutes, with manual early resume. Content left over from the pause is not imported on resume. Pause state is process-local; restarting the app resumes capture. Clipboard records copied from ClipJar remain usable while capture is paused.

## Verification

Run `cargo test --manifest-path tests/native-history/Cargo.toml` to test the production storage module without Tauri/WebView system libraries. Frontend model, migration and shortcut tests use Node.js 24; read-only storage diagnostics use Python 3.

Checks also runs the real TypeScript/Tauri executable build on Windows/macOS, alongside an Ubuntu browser smoke test with screenshots. Its desktop artifacts are trial binaries, not installers or releases. Compilation and storage tests do not prove hidden-window capture, OS image pasting or focus behavior; verify those in desktop trial sessions, including reopening imported history and pausing/resuming capture.
