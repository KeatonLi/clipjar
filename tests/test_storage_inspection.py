import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("inspect_storage", Path(__file__).resolve().parents[1] / "scripts/inspect-storage.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StorageInspectionTests(unittest.TestCase):
    def test_deleted_values_leave_reusable_pages_without_live_clipboard_data(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "storage.sqlite"
            with sqlite3.connect(path) as connection:
                connection.execute("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
                connection.execute("INSERT INTO ItemTable VALUES (?, ?)", ("clipjar-storage", b"A" * 1048576))
                connection.commit()
                connection.execute("DELETE FROM ItemTable")
            before = path.read_bytes()
            report = module.inspect(path)
            self.assertEqual(report["localstorage_value_bytes"], 0)
            self.assertGreater(report["reusable_free_bytes"], 1000000)
            self.assertEqual(path.read_bytes(), before)
            self.assertNotIn("clipjar-storage", str(report))

    def test_reports_wal_growth_separately_from_live_value_size(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "storage.sqlite"
            connection = sqlite3.connect(path)
            try:
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("PRAGMA wal_autocheckpoint=0")
                connection.execute("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
                for index in range(8):
                    connection.execute("INSERT OR REPLACE INTO ItemTable VALUES (?, ?)", ("clipjar-storage", bytes([index]) * 262144))
                    connection.commit()
                before = Path(str(path) + "-wal").stat().st_size
                report = module.inspect(path)
                self.assertEqual(report["localstorage_value_bytes"], 262144)
                self.assertGreater(report["files_bytes"]["-wal"], 2000000)
                self.assertEqual(Path(str(path) + "-wal").stat().st_size, before)
            finally:
                connection.close()

    def test_non_sqlite_file_is_identified_without_opening_a_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cache.bin"
            path.write_bytes(b"not a sqlite database")
            self.assertEqual(module.inspect(path)["format"], "not SQLite")


if __name__ == "__main__":
    unittest.main()
