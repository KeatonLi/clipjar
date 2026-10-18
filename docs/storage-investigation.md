# Storage growth investigation

The earlier investigation compared `main` at `c74ea2444fd807e7328f7d8f317a7f68a235d70c` and the released `v1.0.6` source. Neither contained an application-owned SQLite database or SQLite dependency: Rust kept an in-memory vector, while frontend history lived in the `clipjar-storage` localStorage value.

The reported multi-GB files occurred on Windows and macOS, but the original files, paths and measurements are unavailable. A large SQLite file could have belonged to WebView storage; this is a hypothesis, not an established cause. The defects below explain excessive logical payloads and writes, not the exact historical physical-file growth.

## Earlier defects and containment

- The declared aggregate storage limit was not enforced. The decoded per-image threshold did not constrain the combined JSON/base64 payload.
- Zustand persistence could rewrite the full snapshot after transient state updates. Identical snapshots were subsequently filtered before writing.
- The first containment patch limited browser snapshots to 4 MiB of UTF-16 JSON. It omitted old image payloads when necessary, including favorite images after ordinary images. Omitted payloads could not survive a restart.
- Retention was applied during hydration and settings changes. At that stage, an overall 100-record cap still existed.

These describe the earlier implementation. The current native architecture replaces that storage path rather than continuing to depend on image omission.

## Current native storage

Desktop history now uses `<app_data_dir>/history/history.json` and PNG files under `history/images`. There is no application SQLite database. The Rust worker polls every 700 ms, including when the window is hidden, and serializes capture, copy-back and mutations through one history manager.

The committed history has a 64 MiB image budget and a separate 4 MiB metadata budget. Count/age retention and capacity eviction remove ordinary history first. Favorites and snippets are never automatically deleted to fit a new write; if protected content exhausts the budget, the write fails visibly and leaves the previous committed state intact. Temporary-file writes and atomic manifest replacement precede removal of unreferenced images.

The first successful bootstrap imports legacy content and commits a migration marker. The frontend only removes legacy history payloads after that confirmation. Failed imports retain the original localStorage value. Native snapshots and images are not persisted back into localStorage; browser-only preview mode still uses a bounded localStorage snapshot.

The budgets do not bound WebView caches, all files in the application directory, or temporary write peaks. This implementation does not compact old WebView-owned databases. See [native history](native-history.md) for limits, paths and migration behavior.

## Read-only local diagnosis

If growth recurs, identify the actual file and fully exit ClipJar before running:

```sh
python scripts/inspect-storage.py "/absolute/path/to/the/large/file"
```

The script reports database and adjacent WAL/SHM/journal sizes, page counts, reusable free-page bytes, journal mode and table names. For an `ItemTable` localStorage schema it reports aggregate value bytes and entry count. It does not print clipboard contents or change the database.

- Large live value bytes point toward retained content and image payloads.
- Large free-page bytes with small live content indicate previously allocated pages retained for reuse.
- A large `-wal` calls for investigation of checkpoint behavior or long-lived readers.
- A non-SQLite file or cache directory needs inspection using its actual storage format.

Identify the owner/schema and back up the data before choosing a recovery procedure. Do not run maintenance on an active WebView-owned database.

## Validation and remaining evidence

```sh
node --experimental-strip-types --test "tests/*.test.ts"
python -m unittest discover -s tests -p "test_*.py" -v
cargo test --manifest-path tests/native-history/Cargo.toml
npm run tauri build -- --no-bundle
```

Python tests reproduce WAL accumulation and retained free pages in temporary databases and verify read-only diagnosis. Native tests use the production module to exercise image round trips, retention, protected-content budgets, migration, atomic metadata replacement and copy suppression. These tests are not measurements of the missing user files or proof of a desktop runtime result.

Checks performs compilation and tests on Windows/macOS and browser smoke checks on Ubuntu. Platform trial sessions should still verify hidden-window capture, real image pasting, reopening persisted history, pause/resume and legacy upgrade. Until an actual large-file sample is inspected, the historical GB-scale root cause remains unconfirmed.
