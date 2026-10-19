use base64::{engine::general_purpose::STANDARD, Engine};
use clipjar_history::{Action, ClipboardValue, Collector, History, Settings};
use image::ImageEncoder;
use serde_json::json;
use std::fs;
const NOW: i64 = 1_800_000_000_000;
fn history() -> (tempfile::TempDir, History) {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    h.initialize(None, None, NOW).unwrap();
    (dir, h)
}
fn row(id: f64, content: &str, favorite: bool) -> serde_json::Value {
    json!({"id":id,"content":content,"contentType":"text","createdAt":NOW,"updatedAt":NOW,"isFavorite":favorite,"tags":[],"useWeight":0})
}
fn legacy(items: Vec<serde_json::Value>) -> String {
    json!({"state":{"items":items,"settings":Settings::default()},"version":0}).to_string()
}
fn png() -> Vec<u8> {
    let mut out = vec![];
    image::codecs::png::PngEncoder::new(&mut out)
        .write_image(&[255, 0, 0, 255], 1, 1, image::ExtendedColorType::Rgba8)
        .unwrap();
    out
}

#[test]
fn images_are_files_and_survive_restart_without_base64_snapshots() {
    let (dir, mut h) = history();
    h.capture_image(1, 1, &[255, 0, 0, 255], NOW).unwrap();
    let s = h.snapshot(NOW).unwrap();
    let item = &s.items[0];
    let id = item.id;
    assert!(!item.image_path.as_ref().unwrap().contains("base64"));
    assert!(std::path::Path::new(item.image_path.as_ref().unwrap()).is_file());
    drop(h);
    let h = History::open(dir.path()).unwrap();
    assert_eq!(h.image_pixels(id).unwrap().as_raw(), &[255, 0, 0, 255]);
    assert_eq!(h.snapshot(NOW).unwrap().items.len(), 1);
}
#[test]
fn migration_preserves_fractional_ids_notes_favorites_and_an_exact_backup() {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    let mut image = row(1.25, "image", true);
    image["contentType"] = json!("image");
    image["imagePath"] = json!(format!("data:image/png;base64,{}", STANDARD.encode(png())));
    image["note"] = json!("重要备注");
    let raw = legacy(vec![image]);
    let s = h
        .initialize(Some(&raw), Some("Control+Alt+V"), NOW)
        .unwrap();
    assert_eq!(
        fs::read_to_string(s.migration_backup.unwrap()).unwrap(),
        raw
    );
    assert_eq!(s.items[0].id, 1.25);
    assert!(s.items[0].is_favorite);
    assert_eq!(s.items[0].note.as_deref(), Some("重要备注"));
    assert_eq!(s.settings.global_shortcut, "Control+Alt+V");
    assert_eq!(h.image_pixels(1.25).unwrap().as_raw(), &[255, 0, 0, 255]);
    assert_eq!(
        h.initialize(
            Some("corrupt value ignored after successful migration"),
            None,
            NOW
        )
        .unwrap()
        .items
        .len(),
        1
    );
}
#[test]
fn corrupt_legacy_is_backed_up_and_can_be_retried_without_resetting_records() {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    assert!(h.initialize(Some("not JSON"), None, NOW).is_err());
    assert!(!h.initialized());
    let files = fs::read_dir(dir.path().join("backups"))
        .unwrap()
        .collect::<Vec<_>>();
    assert_eq!(files.len(), 1);
    assert_eq!(
        fs::read_to_string(files[0].as_ref().unwrap().path()).unwrap(),
        "not JSON"
    );
    assert_eq!(
        h.initialize(Some(&legacy(vec![row(1., "recovered", false)])), None, NOW)
            .unwrap()
            .items
            .len(),
        1
    );
}
#[test]
fn conflicting_legacy_ids_roll_back_the_entire_migration() {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    let raw = legacy(vec![row(1., "first", false), row(1., "different", false)]);
    assert!(h.initialize(Some(&raw), None, NOW).is_err());
    assert!(!h.initialized());
    assert!(h.snapshot(NOW).unwrap().items.is_empty());
    assert_eq!(
        h.initialize(
            Some(&legacy(vec![
                row(1., "first", false),
                row(2., "different", false)
            ])),
            None,
            NOW
        )
        .unwrap()
        .items
        .len(),
        2
    );
}
#[test]
fn missing_legacy_images_with_identical_labels_are_not_falsely_merged() {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    let mut a = row(1., "[图片 800x600]", true);
    a["contentType"] = json!("image");
    let mut b = a.clone();
    b["id"] = json!(2.);
    assert_eq!(
        h.initialize(Some(&legacy(vec![a, b])), None, NOW)
            .unwrap()
            .items
            .len(),
        2
    );
}
#[test]
fn repeated_copy_moves_existing_record_and_preserves_metadata() {
    let (_dir, mut h) = history();
    h.capture_text("same text", NOW).unwrap();
    let id = h.snapshot(NOW).unwrap().items[0].id;
    h.act(Action::Favorite { id }, NOW + 1).unwrap();
    h.act(
        Action::Note {
            id,
            note: "favorite note".into(),
        },
        NOW + 2,
    )
    .unwrap();
    h.capture_text("other", NOW + 3).unwrap();
    h.capture_text("same text", NOW + 4).unwrap();
    let s = h.snapshot(NOW + 4).unwrap();
    assert_eq!(s.items.len(), 2);
    assert_eq!(s.items[0].id, id);
    assert!(s.items[0].is_favorite);
    assert_eq!(s.items[0].note.as_deref(), Some("favorite note"));
    assert_eq!(s.items[0].created_at, NOW + 4);
}
#[test]
fn same_size_images_are_distinguished_by_pixels() {
    let (_dir, mut h) = history();
    h.capture_image(1, 1, &[1, 0, 0, 255], NOW).unwrap();
    h.capture_image(1, 1, &[2, 0, 0, 255], NOW + 1).unwrap();
    h.capture_image(1, 1, &[1, 0, 0, 255], NOW + 2).unwrap();
    assert_eq!(h.snapshot(NOW + 2).unwrap().items.len(), 2);
}
#[test]
fn delete_and_undo_survive_process_restart() {
    let (dir, mut h) = history();
    h.capture_text("keep me", NOW).unwrap();
    let id = h.snapshot(NOW).unwrap().items[0].id;
    let s = h.act(Action::Delete { id }, NOW + 1).unwrap();
    assert!(s.items.is_empty());
    let token = s.undo.unwrap().token;
    drop(h);
    let mut h = History::open(dir.path()).unwrap();
    assert_eq!(
        h.act(Action::Undo { token }, NOW + 100).unwrap().items[0].id,
        id
    );
}
#[test]
fn expired_delete_reclaims_image_files_but_never_unrelated_files() {
    let (dir, mut h) = history();
    h.capture_image(1, 1, &[1, 0, 0, 255], NOW).unwrap();
    let item = h.snapshot(NOW).unwrap().items.remove(0);
    let path = item.image_path.unwrap();
    h.act(Action::Delete { id: item.id }, NOW).unwrap();
    assert!(std::path::Path::new(&path).exists());
    let unrelated = dir
        .path()
        .join("images")
        .join(format!("{}.png", "🙂".repeat(16)));
    fs::write(&unrelated, b"unrelated").unwrap();
    h.collect_garbage(NOW + 10001).unwrap();
    assert!(!std::path::Path::new(&path).exists());
    assert!(unrelated.exists());
}
#[test]
fn undo_does_not_overwrite_a_record_recopied_after_deletion() {
    let (_dir, mut h) = history();
    h.capture_text("hello", NOW).unwrap();
    let id = h.snapshot(NOW).unwrap().items[0].id;
    let token = h
        .act(Action::Delete { id }, NOW + 1)
        .unwrap()
        .undo
        .unwrap()
        .token;
    h.capture_text("hello", NOW + 2).unwrap();
    let s = h.act(Action::Undo { token }, NOW + 3).unwrap();
    assert_eq!(s.items.len(), 1);
    assert_eq!(s.items[0].created_at, NOW + 2);
}
#[test]
fn ordinary_clear_preserves_favorites_and_full_clear_also_removes_backups() {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    h.initialize(
        Some(&legacy(vec![
            row(1., "favorite", true),
            row(2., "ordinary", false),
        ])),
        None,
        NOW,
    )
    .unwrap();
    assert_eq!(
        h.act(
            Action::Clear {
                include_favorites: false
            },
            NOW + 1
        )
        .unwrap()
        .items
        .len(),
        1
    );
    assert_eq!(fs::read_dir(dir.path().join("backups")).unwrap().count(), 1);
    let s = h
        .act(
            Action::Clear {
                include_favorites: true,
            },
            NOW + 2,
        )
        .unwrap();
    assert!(s.items.is_empty());
    assert!(s.migration_backup.is_none());
    assert_eq!(fs::read_dir(dir.path().join("backups")).unwrap().count(), 0);
}
#[test]
fn favorite_count_is_unbounded_and_increasing_history_limit_does_not_reapply_old_limit() {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    let rows = (0..160)
        .map(|i| row(i as f64, &format!("row {i}"), i < 120))
        .collect();
    h.initialize(Some(&legacy(rows)), None, NOW).unwrap();
    let mut settings = Settings::default();
    settings.max_history_items = 20;
    assert_eq!(
        h.act(
            Action::Settings {
                settings: settings.clone()
            },
            NOW
        )
        .unwrap()
        .items
        .len(),
        140
    );
    settings.max_history_items = 100;
    for i in 0..80 {
        h.capture_text(&format!("new {i}"), NOW + i).unwrap();
    }
    let s = h.act(Action::Settings { settings }, NOW + 100).unwrap();
    assert_eq!(s.items.iter().filter(|i| i.is_favorite).count(), 120);
}
#[test]
fn manual_pause_is_persisted_and_blocks_text_and_image_writes() {
    let (dir, mut h) = history();
    h.act(Action::Pause { minutes: None }, NOW).unwrap();
    drop(h);
    let mut h = History::open(dir.path()).unwrap();
    assert!(h.paused(NOW + 1000000).unwrap());
    h.capture_text("secret", NOW + 1).unwrap();
    h.capture_image(1, 1, &[0, 0, 0, 255], NOW + 1).unwrap();
    assert!(h.snapshot(NOW).unwrap().items.is_empty());
    assert_eq!(fs::read_dir(dir.path().join("images")).unwrap().count(), 0);
    h.act(Action::Resume, NOW + 2).unwrap();
    h.capture_text("public", NOW + 3).unwrap();
    assert_eq!(h.snapshot(NOW + 3).unwrap().items.len(), 1);
}
#[test]
fn timed_pause_expires_at_the_requested_time() {
    let (_dir, mut h) = history();
    h.act(Action::Pause { minutes: Some(15) }, NOW).unwrap();
    assert!(h.paused(NOW + 899999).unwrap());
    assert!(!h.paused(NOW + 900000).unwrap());
}
#[test]
fn collector_never_backfills_sensitive_clipboard_on_resume() {
    let (_dir, mut h) = history();
    let mut c = Collector::default();
    assert!(c
        .observe(&mut h, ClipboardValue::Text("before".into()), NOW)
        .unwrap());
    h.act(Action::Pause { minutes: None }, NOW + 1).unwrap();
    c.suspend();
    assert!(!c.enabled(&h, NOW + 2).unwrap());
    h.act(Action::Resume, NOW + 3).unwrap();
    assert!(!c
        .observe(&mut h, ClipboardValue::Text("secret".into()), NOW + 4)
        .unwrap());
    assert!(c
        .observe(&mut h, ClipboardValue::Text("after".into()), NOW + 5)
        .unwrap());
    assert!(!h
        .snapshot(NOW + 5)
        .unwrap()
        .items
        .iter()
        .any(|i| i.content == "secret"));
}
#[test]
fn unchanged_clipboard_does_not_rewrite_database_every_poll() {
    let (_dir, mut h) = history();
    let mut c = Collector::default();
    c.observe(&mut h, ClipboardValue::Text("A".into()), NOW)
        .unwrap();
    let revision = h.snapshot(NOW).unwrap().revision;
    assert!(!c
        .observe(&mut h, ClipboardValue::Text("A".into()), NOW + 1)
        .unwrap());
    assert_eq!(h.snapshot(NOW).unwrap().revision, revision);
    c.observe(&mut h, ClipboardValue::Empty, NOW + 2).unwrap();
    assert!(c
        .observe(&mut h, ClipboardValue::Text("A".into()), NOW + 3)
        .unwrap());
    assert_eq!(h.snapshot(NOW + 3).unwrap().items.len(), 1);
}
#[test]
fn invalid_images_and_oversize_text_do_not_truncate_or_replace_existing_records() {
    let (_dir, mut h) = history();
    h.capture_text("good", NOW).unwrap();
    assert!(h.capture_image(10, 10, &[0, 0, 0, 0], NOW).is_err());
    assert!(h.capture_text(&"x".repeat(1024 * 1024 + 1), NOW).is_err());
    assert_eq!(h.snapshot(NOW).unwrap().items[0].content, "good");
}
#[test]
fn ids_remain_unique_during_same_millisecond_and_clock_regression() {
    let (_dir, mut h) = history();
    h.capture_text("A", NOW).unwrap();
    h.capture_text("B", NOW).unwrap();
    h.capture_text("C", NOW - 1).unwrap();
    let mut ids = h
        .snapshot(NOW)
        .unwrap()
        .items
        .iter()
        .map(|i| i.id as u64)
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), 3);
}
#[test]
fn raising_limit_during_migration_does_not_discard_records_using_the_previous_limit() {
    let dir = tempfile::tempdir().unwrap();
    let mut h = History::open(dir.path()).unwrap();
    let rows = (0..200)
        .map(|i| row(i as f64, &format!("legacy {i}"), false))
        .collect();
    h.initialize(Some(&legacy(rows)), None, NOW).unwrap();
    let mut settings = Settings::default();
    settings.max_history_items = 500;
    assert_eq!(
        h.act(Action::Settings { settings }, NOW)
            .unwrap()
            .items
            .len(),
        200
    );
}
