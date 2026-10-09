# Storage growth investigation

Investigated `main` at `c74ea2444fd807e7328f7d8f317a7f68a235d70c` and the released `v1.0.6` source. Neither has an application-owned SQLite database or SQLite dependency. Rust history is an in-memory vector; frontend history is the `clipjar-storage` localStorage value. A large SQLite file may therefore belong to the operating system WebView. The exact file path, application version and live database measurements are still needed to establish the cause of the reported multi-GB files on Windows and macOS.

## Confirmed defects and fixes

- `MAX_STORAGE_SIZE_MB` was declared but never enforced. The 500 KiB decoded per-image threshold did not limit the aggregate JSON/base64 value. 100 near-limit images could approach 67 MiB of UTF-8 JSON (133 MiB when budgeted as UTF-16), well above typical localStorage quotas.
- Zustand persist attempts to save the entire snapshot after state updates, including transient selection/search changes. Identical snapshots now skip the underlying storage write. New history still changes the value and is written; this is not an incremental image storage solution.
- Persisted snapshots now have a 4 MiB UTF-16 JSON budget, including the Zustand envelope. Old ordinary image payloads are omitted before favorite image payloads. Retained text, notes and favorite status are preserved. Live image previews are unchanged, but omitted images will not survive an application restart. Exceptionally large text/metadata is rejected rather than silently deleting it; the previous saved value remains intact.
- Record-count/age retention now applies on hydration and when changing the history limit. Hydrated legacy snapshots are rewritten once using the bounded policy. Age cleanup honors `autoCleanup`. The existing overall 100-record cap remains.
- Filtering now sorts a copy rather than mutating store state.

These defects explain excessive logical payloads and write amplification. They do not prove which mechanism produced the user's multi-GB physical files, or guarantee that an existing physical database will shrink. The fix limits the value we write, not all WebView caches or database journal files.

## Read-only local diagnosis

With ClipJar fully exited, run (Python 3):

```sh
python scripts/inspect-storage.py "/absolute/path/to/the/large/file"
```

The script prints file sizes for the database and adjacent WAL/SHM/journal, page counts, reusable free-page bytes, journal mode and table names. For an `ItemTable` localStorage schema it also reports aggregate stored value bytes and entry count. It does not print clipboard text, change journal mode, checkpoint, delete, or vacuum anything.

- Large live value bytes: investigate retained content and image sizes.
- Large free-page bytes with small live content: previously allocated pages are retained for reuse.
- Large `-wal` relative to live content: investigate checkpoint behavior or long-lived readers.
- A non-SQLite file or a cache directory: inspect that actual storage format rather than treating it as an application SQLite database.

Do not run database maintenance on a live WebView-owned file. Choose a recovery procedure only after identifying its owner/schema and backing up the application data. The code fix does not compact previously bloated files automatically.

## Validation

Dependency-free storage policy regression tests (Node.js 22.6+ with TypeScript stripping):

```sh
node --experimental-strip-types tests/storagePolicy.test.ts
python -m unittest discover -s tests -p 'test_storage_inspection.py' -v
```

The SQLite tests reproduce WAL accumulation and retained free pages in temporary databases and verify that diagnostics leave database contents unchanged. These are simulations, not measurements of the user's files. Full frontend builds and desktop runtime verification are currently blocked by unavailable dependency downloads.
