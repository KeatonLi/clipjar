#!/usr/bin/env python3
"""Inspect a ClipJar/WebView SQLite file without printing clipboard contents or modifying it."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3


def inspect(path):
    path = path.expanduser().resolve(strict=True)
    report = {"path": str(path), "files_bytes": {}}
    for suffix in ("", "-wal", "-shm", "-journal"):
        file = Path(str(path) + suffix)
        if file.is_file():
            report["files_bytes"][suffix or "database"] = file.stat().st_size
    with path.open("rb") as file:
        if file.read(16) != b"SQLite format 3\x00":
            report["format"] = "not SQLite"
            return report
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)) as connection:
        connection.execute("PRAGMA query_only=ON")
        page_size = connection.execute("PRAGMA page_size").fetchone()[0]
        page_count = connection.execute("PRAGMA page_count").fetchone()[0]
        free_pages = connection.execute("PRAGMA freelist_count").fetchone()[0]
        report.update({"format": "SQLite", "journal_mode": connection.execute("PRAGMA journal_mode").fetchone()[0], "page_size": page_size, "page_count": page_count, "free_pages": free_pages, "allocated_bytes": page_count * page_size, "reusable_free_bytes": free_pages * page_size})
        tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_schema WHERE type='table'")]
        report["tables"] = tables
        # WebKit/legacy Chromium localStorage databases can expose an ItemTable.
        if "ItemTable" in tables:
            columns = {row[1] for row in connection.execute('PRAGMA table_info("ItemTable")')}
            if {"key", "value"} <= columns:
                report["localstorage_value_bytes"] = connection.execute('SELECT coalesce(sum(length(CAST(value AS BLOB))), 0) FROM "ItemTable"').fetchone()[0]
                report["localstorage_entry_count"] = connection.execute('SELECT count(*) FROM "ItemTable"').fetchone()[0]
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path, help="Path to the large database file")
    arguments = parser.parse_args()
    try:
        print(json.dumps(inspect(arguments.database), indent=2, ensure_ascii=False))
    except (OSError, sqlite3.Error) as error:
        parser.exit(1, f"Cannot inspect storage: {error}\n")
