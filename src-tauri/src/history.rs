//! The native process owns durable history. Images never enter WebView storage.
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder, ImageReader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Cursor, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

pub const IMAGE_BUDGET: u64 = 64 * 1024 * 1024;
pub const METADATA_BUDGET: usize = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 16 * 1024 * 1024;
const MAX_RGBA_BYTES: usize = 64 * 1024 * 1024;
const MAX_TEXT_BYTES: usize = 1024 * 1024;
const DAY: i64 = 86_400_000;

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    pub content_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_favorite: bool,
    pub is_snippet: bool,
    pub use_weight: u64,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,
    pub has_image: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_height: Option<u32>,
}

impl Default for ClipboardItem {
    fn default() -> Self {
        Self {
            id: 0,
            content: String::new(),
            content_type: "text".into(),
            title: None,
            created_at: 0,
            updated_at: 0,
            is_favorite: false,
            is_snippet: false,
            use_weight: 0,
            tags: Vec::new(),
            note: None,
            source_app: None,
            has_image: false,
            image_width: None,
            image_height: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub max_history_items: usize,
    pub auto_cleanup: bool,
    pub cleanup_days: u32,
    pub global_shortcut: String,
    pub start_at_login: bool,
    pub show_preview: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            max_history_items: 100,
            auto_cleanup: true,
            cleanup_days: 30,
            global_shortcut: "CommandOrControl+Shift+V".into(),
            start_at_login: false,
            show_preview: true,
        }
    }
}

impl Settings {
    fn validate(&self) -> Result<(), String> {
        if !(10..=500).contains(&self.max_history_items) {
            return Err("历史记录上限应为 10–500 条".into());
        }
        if !(1..=3650).contains(&self.cleanup_days) {
            return Err("清理天数应为 1–3650 天".into());
        }
        if self.global_shortcut.len() > 200 {
            return Err("快捷键设置过长".into());
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub max_history_items: Option<usize>,
    pub auto_cleanup: Option<bool>,
    pub cleanup_days: Option<u32>,
    pub global_shortcut: Option<String>,
    pub start_at_login: Option<bool>,
    pub show_preview: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ItemPatch {
    pub title: Option<String>,
    pub content: Option<String>,
    pub content_type: Option<String>,
    pub note: Option<String>,
    pub is_snippet: Option<bool>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    #[serde(flatten)]
    item: ClipboardItem,
    fingerprint: String,
    image_file: Option<String>,
    image_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskState {
    version: u8,
    #[serde(default)]
    migration_complete: bool,
    settings: Settings,
    items: Vec<Record>,
}

impl Default for DiskState {
    fn default() -> Self {
        Self { version: 1, migration_complete: false, settings: Settings::default(), items: Vec::new() }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub item_count: usize,
    pub ordinary_count: usize,
    pub snippet_count: usize,
    pub favorite_count: usize,
    pub image_count: usize,
    pub image_bytes: u64,
    pub metadata_bytes: usize,
    pub total_bytes: u64,
    pub budget_bytes: u64,
    pub metadata_budget_bytes: usize,
    pub is_paused: bool,
    pub paused_until: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub items: Vec<ClipboardItem>,
    pub settings: Settings,
    pub stats: StorageStats,
    pub migration_complete: bool,
    pub revision: u64,
}

pub struct HistoryManager {
    root: PathBuf,
    disk: DiskState,
    next_id: i64,
    pub last_fingerprint: Option<String>,
    pub last_error: Option<String>,
    paused_until: Option<i64>,
    revision: AtomicU64,
    skip_resume_sample: bool,
    cleanup_error: Option<String>,
}

fn protected(record: &Record) -> bool {
    record.item.is_favorite || record.item.is_snippet
}

fn safe_image_name(id: i64, name: &str) -> bool {
    id > 0 && name == format!("{id}.png")
}

fn managed_image_name(name: &str) -> bool {
    name.strip_suffix(".png").and_then(|s| s.parse::<i64>().ok()).is_some_and(|id| safe_image_name(id, name))
}

pub fn text_fingerprint(text: &str) -> String {
    let mut hash = Sha256::new();
    hash.update(b"text\0");
    hash.update(text.as_bytes());
    format!("{:x}", hash.finalize())
}

pub fn image_fingerprint(width: u32, height: u32, rgba: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(b"image\0");
    hash.update(width.to_le_bytes());
    hash.update(height.to_le_bytes());
    hash.update(rgba);
    format!("{:x}", hash.finalize())
}

fn encode_image(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let expected = (width as u64).checked_mul(height as u64).and_then(|n| n.checked_mul(4));
    if width == 0 || height == 0 || expected != Some(rgba.len() as u64) || rgba.len() > MAX_RGBA_BYTES {
        return Err("图片尺寸或像素数据超过限制（最大 64 MiB RGBA）".into());
    }
    let mut png = Vec::new();
    PngEncoder::new(&mut png).write_image(rgba, width, height, ExtendedColorType::Rgba8).map_err(|e| e.to_string())?;
    if png.len() > MAX_IMAGE_BYTES {
        return Err("单张图片超过 16 MiB，未保存；原有收藏和片段已保留".into());
    }
    Ok(png)
}

pub fn decode_image(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), String> {
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("图片文件超过 16 MiB 限制".into());
    }
    let mut reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16_384);
    limits.max_image_height = Some(16_384);
    limits.max_alloc = Some(MAX_RGBA_BYTES as u64);
    reader.limits(limits);
    let image = reader.decode().map_err(|e| e.to_string())?.into_rgba8();
    let (width, height) = image.dimensions();
    let rgba = image.into_raw();
    if rgba.len() > MAX_RGBA_BYTES {
        return Err("图片解码后超过 64 MiB 限制".into());
    }
    Ok((width, height, rgba))
}

pub fn detect_content_type(content: &str) -> &'static str {
    let trimmed = content.trim();
    if !trimmed.contains(char::is_whitespace) && (trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return "link";
    }
    if trimmed.starts_with("```") || content.contains('\n') && ["function ", "const ", "import ", "def ", "fn ", "class ", "SELECT ", "console."].iter().any(|marker| content.contains(marker)) {
        return "code";
    }
    "text"
}

fn validate_item(item: &ClipboardItem) -> Result<(), String> {
    if !["text", "image", "file", "code", "link"].contains(&item.content_type.as_str()) {
        return Err("不支持的内容类型".into());
    }
    if item.content.len() > MAX_TEXT_BYTES {
        return Err("单条文字超过 1 MiB，未保存".into());
    }
    if item.is_snippet && (item.content.trim().is_empty() || item.content.chars().count() > 10_000 || item.content_type == "image") {
        return Err("片段内容不能为空，最多 10,000 个字符；图片请使用收藏".into());
    }
    if item.title.as_ref().is_some_and(|title| title.chars().count() > 80) || item.is_snippet && item.title.as_ref().is_none_or(|title| title.trim().is_empty()) {
        return Err("片段名称不能为空，最多 80 个字符".into());
    }
    if item.note.as_ref().is_some_and(|note| note.chars().count() > 10_000) || item.tags.len() > 32 || item.tags.iter().any(|tag| tag.chars().count() > 64) {
        return Err("备注或标签超过长度限制".into());
    }
    Ok(())
}

fn retain(disk: &mut DiskState, current_time: i64) {
    disk.items.sort_by(|a, b| b.item.created_at.cmp(&a.item.created_at).then_with(|| b.item.id.cmp(&a.item.id)));
    let cutoff = current_time.saturating_sub(disk.settings.cleanup_days as i64 * DAY);
    let mut ordinary = 0;
    disk.items.retain(|record| {
        if protected(record) { return true; }
        if disk.settings.auto_cleanup && record.item.created_at < cutoff { return false; }
        ordinary += 1;
        ordinary <= disk.settings.max_history_items
    });
}

fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(not(windows))]
    { fs::rename(source, destination).map_err(|e| e.to_string()) }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        extern "system" { fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32; }
        let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let destination: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
        // REPLACE_EXISTING | WRITE_THROUGH. The old file survives if replacement fails.
        if unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0x1 | 0x8) } == 0 {
            Err(std::io::Error::last_os_error().to_string())
        } else { Ok(()) }
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("next");
    let result = (|| {
        let mut file = OpenOptions::new().create(true).truncate(true).write(true).open(&temp).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        replace_file(&temp, path)?;
        #[cfg(unix)]
        // Replacement is already committed. A directory fsync failure must not
        // trigger rollback of assets now referenced by the new manifest.
        if let Some(parent) = path.parent() { let _ = File::open(parent).and_then(|f| f.sync_all()); }
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(temp); }
    result
}

impl HistoryManager {
    pub fn open(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("images")).map_err(|e| e.to_string())?;
        let path = root.join("history.json");
        let disk = if path.exists() {
            if fs::metadata(&path).map_err(|e| e.to_string())?.len() > METADATA_BUDGET as u64 {
                return Err("历史文件超过 4 MiB，已停止加载以保护数据".into());
            }
            let disk: DiskState = serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?).map_err(|e| format!("历史文件无法读取，原文件已保留：{e}"))?;
            if disk.version != 1 { return Err("历史文件版本不受支持，原文件已保留".into()); }
            disk.settings.validate()?;
            disk
        } else { DiskState::default() };
        let next_id = disk.items.iter().map(|r| r.item.id).max().unwrap_or(0).max(now());
        let mut manager = Self { root, disk, next_id, last_fingerprint: None, last_error: None, paused_until: None, revision: AtomicU64::new(1), skip_resume_sample: false, cleanup_error: None };
        let mut candidate = manager.disk.clone();
        for record in &mut candidate.items {
            validate_item(&record.item)?;
            if let Some(file) = &record.image_file {
                if !safe_image_name(record.item.id, file) { return Err("历史图片文件名无效，原文件已保留".into()); }
                match fs::metadata(manager.root.join("images").join(file)) {
                    Ok(metadata) if metadata.len() <= MAX_IMAGE_BYTES as u64 => { record.image_bytes = metadata.len(); record.item.has_image = true; }
                    _ => { record.item.has_image = false; record.image_bytes = 0; record.image_file = None; manager.last_error = Some("部分历史图片文件丢失或超限，文字和备注已保留".into()); }
                }
            } else { record.item.has_image = false; record.image_bytes = 0; }
        }
        // Apply configured count/age retention on launch, without ever pruning protected entries.
        manager.commit(candidate, Vec::new(), &[], true)?;
        Ok(manager)
    }

    fn id(&mut self) -> i64 { self.next_id = now().max(self.next_id.saturating_add(1)); self.next_id }

    pub fn ready(&self) -> bool { self.disk.migration_complete }

    pub fn is_paused(&self) -> bool { self.paused_until.is_some_and(|until| until > now()) }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot { items: self.disk.items.iter().map(|r| r.item.clone()).collect(), settings: self.disk.settings.clone(), stats: self.stats(), migration_complete: self.disk.migration_complete, revision: self.revision.fetch_add(1, Ordering::Relaxed) }
    }

    pub fn stats(&self) -> StorageStats {
        let image_bytes = self.asset_bytes(None);
        let metadata_bytes = serde_json::to_vec(&self.disk).map_or(0, |s| s.len());
        StorageStats {
            item_count: self.disk.items.len(), ordinary_count: self.disk.items.iter().filter(|r| !protected(r)).count(),
            snippet_count: self.disk.items.iter().filter(|r| r.item.is_snippet).count(), favorite_count: self.disk.items.iter().filter(|r| r.item.is_favorite).count(),
            image_count: self.disk.items.iter().filter(|r| r.item.has_image).count(), image_bytes, metadata_bytes,
            total_bytes: image_bytes + metadata_bytes as u64, budget_bytes: IMAGE_BUDGET + METADATA_BUDGET as u64,
            metadata_budget_bytes: METADATA_BUDGET, is_paused: self.is_paused(), paused_until: self.paused_until.filter(|until| *until > now()), last_error: self.last_error.clone().or_else(|| self.cleanup_error.clone()),
        }
    }

    /// Persist assets before the manifest, then remove unreferenced assets. Failed mutations
    /// leave both the in-memory history and existing manifest untouched.
    fn commit(&mut self, mut candidate: DiskState, images: Vec<(String, Vec<u8>)>, required_ids: &[i64], evict_ordinary: bool) -> Result<(), String> {
        self.prune_files();
        let current_names: HashSet<&str> = self.disk.items.iter().filter_map(|r| r.image_file.as_deref()).collect();
        let orphan_bytes = self.asset_bytes(Some(&current_names));
        retain(&mut candidate, now());
        let bytes = loop {
            let bytes = serde_json::to_vec(&candidate).map_err(|e| e.to_string())?;
            let image_bytes = candidate.items.iter().map(|r| r.image_bytes).sum::<u64>().saturating_add(orphan_bytes);
            if image_bytes <= IMAGE_BUDGET && bytes.len() <= METADATA_BUDGET { break bytes; }
            let victim = evict_ordinary.then(|| candidate.items.iter().rposition(|r| !protected(r) && !required_ids.contains(&r.item.id))).flatten();
            if let Some(victim) = victim { candidate.items.remove(victim); }
            else { return Err("存储空间已满（图片 64 MiB / 文字 4 MiB），请删除一些内容后重试；收藏和片段已保留".into()); }
        };
        if required_ids.iter().any(|id| !candidate.items.iter().any(|r| r.item.id == *id)) {
            return Err("这条记录超过保留范围，未写入历史".into());
        }
        let references: HashSet<&str> = candidate.items.iter().filter_map(|r| r.image_file.as_deref()).collect();
        let mut written = Vec::new();
        for (name, data) in images {
            if references.contains(name.as_str()) {
                let path = self.root.join("images").join(&name);
                if let Err(error) = atomic_write(&path, &data) {
                    for file in written { let _ = fs::remove_file(file); }
                    return Err(error);
                }
                written.push(path);
            }
        }
        let current_bytes = serde_json::to_vec(&self.disk).map_err(|e| e.to_string())?;
        if bytes != current_bytes || !self.root.join("history.json").exists() {
            if let Err(error) = atomic_write(&self.root.join("history.json"), &bytes) {
                for file in written { let _ = fs::remove_file(file); }
                return Err(error);
            }
        }
        self.disk = candidate;
        self.prune_files();
        Ok(())
    }

    fn asset_bytes(&self, excluding: Option<&HashSet<&str>>) -> u64 {
        fs::read_dir(self.root.join("images")).ok().into_iter().flatten().flatten().filter_map(|entry| {
            let name = entry.file_name(); let name = name.to_str()?;
            let managed = managed_image_name(name) || name.strip_suffix(".next").and_then(|s| s.parse::<i64>().ok()).is_some();
            if !managed || excluding.is_some_and(|names| names.contains(name)) { return None; }
            entry.metadata().ok().map(|metadata| metadata.len())
        }).sum()
    }

    fn prune_files(&mut self) {
        let mut failed = false;
        let names: HashSet<&str> = self.disk.items.iter().filter_map(|r| r.image_file.as_deref()).collect();
        if let Ok(entries) = fs::read_dir(self.root.join("images")) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                if let Some(name) = name.to_str() {
                    if (managed_image_name(name) && !names.contains(name)) || name.strip_suffix(".next").and_then(|s| s.parse::<i64>().ok()).is_some() {
                        failed |= fs::remove_file(entry.path()).is_err();
                    }
                }
            }
        }
        let _ = fs::remove_file(self.root.join("history.next"));
        self.cleanup_error = failed.then(|| "部分旧图片文件暂时无法删除，空间已计入占用；稍后会重试清理".into());
    }

    pub fn bootstrap(&mut self, legacy_items: Vec<serde_json::Value>, legacy_settings: Option<Settings>) -> Result<Snapshot, String> {
        if self.disk.migration_complete { return Ok(self.snapshot()); }
        let mut candidate = self.disk.clone();
        if let Some(mut settings) = legacy_settings {
            // Previous frontends could store values outside today's supported range.
            settings.max_history_items = settings.max_history_items.clamp(10, 500);
            settings.cleanup_days = settings.cleanup_days.clamp(1, 3650);
            settings.validate()?;
            candidate.settings = settings;
        }
        let mut decoded = Vec::new();
        for mut value in legacy_items {
            let object = value.as_object_mut().ok_or("旧记录格式无效，原存储已保留")?;
            // Old IDs used Date.now() + Math.random(). Rekey before integer decoding.
            object.insert("id".into(), serde_json::json!(self.id()));
            let image = object.remove("imagePath").and_then(|value| value.as_str().map(str::to_owned));
            let mut item: ClipboardItem = serde_json::from_value(value).map_err(|e| format!("旧记录无法迁移，原存储已保留：{e}"))?;
            if item.created_at <= 0 { item.created_at = now(); }
            if item.updated_at <= 0 { item.updated_at = item.created_at; }
            validate_item(&item)?;
            let fingerprint = text_fingerprint(&item.content);
            candidate.items.push(Record { item: item.clone(), fingerprint, image_file: None, image_bytes: 0 });
            if let Some(data_url) = image { decoded.push((item.id, data_url)); }
        }
        retain(&mut candidate, now());
        let mut images = Vec::new();
        for (id, data_url) in decoded {
            let Some(record) = candidate.items.iter_mut().find(|r| r.item.id == id) else { continue; };
            let encoded = data_url.strip_prefix("data:image/png;base64,").or_else(|| data_url.strip_prefix("data:image/jpeg;base64,")).ok_or("旧图片格式不支持，原存储已保留")?;
            if encoded.len() > MAX_IMAGE_BYTES * 4 / 3 + 4 { return Err("旧图片超过迁移限制，原存储已保留".into()); }
            let bytes = STANDARD.decode(encoded).map_err(|e| format!("旧图片无法迁移：{e}"))?;
            let (width, height, rgba) = decode_image(&bytes)?;
            let png = encode_image(width, height, &rgba)?;
            let name = format!("{id}.png");
            record.fingerprint = image_fingerprint(width, height, &rgba);
            record.image_file = Some(name.clone()); record.image_bytes = png.len() as u64;
            record.item.has_image = true; record.item.image_width = Some(width); record.item.image_height = Some(height); record.item.content_type = "image".into();
            images.push((name, png));
        }
        candidate.migration_complete = true;
        // Import is all-or-nothing after configured count/age retention, including images.
        self.commit(candidate, images, &[], false)?;
        self.last_error = None;
        Ok(self.snapshot())
    }

    pub fn add_text(&mut self, content: String, content_type: Option<String>) -> Result<Option<ClipboardItem>, String> {
        if content.trim().is_empty() { return Ok(None); }
        let fingerprint = text_fingerprint(&content);
        if self.last_fingerprint.as_ref() == Some(&fingerprint) { return Ok(None); }
        let id = self.id();
        let item = ClipboardItem { id, content_type: content_type.unwrap_or_else(|| detect_content_type(&content).into()), content, created_at: now(), updated_at: now(), ..ClipboardItem::default() };
        validate_item(&item)?;
        let mut candidate = self.disk.clone();
        candidate.items.insert(0, Record { item: item.clone(), fingerprint: fingerprint.clone(), image_file: None, image_bytes: 0 });
        self.commit(candidate, Vec::new(), &[id], true)?;
        self.last_fingerprint = Some(fingerprint); self.last_error = None;
        Ok(Some(item))
    }

    pub fn add_image(&mut self, width: u32, height: u32, rgba: &[u8]) -> Result<Option<ClipboardItem>, String> {
        let fingerprint = image_fingerprint(width, height, rgba);
        if self.last_fingerprint.as_ref() == Some(&fingerprint) { return Ok(None); }
        let png = encode_image(width, height, rgba)?;
        let id = self.id();
        let name = format!("{id}.png");
        let item = ClipboardItem { id, content: format!("[图片 {width} × {height}]"), content_type: "image".into(), created_at: now(), updated_at: now(), has_image: true, image_width: Some(width), image_height: Some(height), ..ClipboardItem::default() };
        let mut candidate = self.disk.clone();
        candidate.items.insert(0, Record { item: item.clone(), fingerprint: fingerprint.clone(), image_file: Some(name.clone()), image_bytes: png.len() as u64 });
        self.commit(candidate, vec![(name, png)], &[id], true)?;
        self.last_fingerprint = Some(fingerprint); self.last_error = None;
        Ok(Some(item))
    }

    pub fn create_snippet(&mut self, title: String, content: String, content_type: Option<String>, note: Option<String>) -> Result<ClipboardItem, String> {
        let id = self.id();
        let item = ClipboardItem { id, title: Some(title.trim().into()), content_type: content_type.unwrap_or_else(|| detect_content_type(&content).into()), content, note, is_snippet: true, created_at: now(), updated_at: now(), ..ClipboardItem::default() };
        validate_item(&item)?;
        let mut candidate = self.disk.clone();
        candidate.items.insert(0, Record { fingerprint: text_fingerprint(&item.content), item: item.clone(), image_file: None, image_bytes: 0 });
        self.commit(candidate, Vec::new(), &[id], true)?;
        self.last_error = None;
        Ok(item)
    }

    pub fn update(&mut self, id: i64, patch: ItemPatch) -> Result<ClipboardItem, String> {
        let mut candidate = self.disk.clone();
        let record = candidate.items.iter_mut().find(|r| r.item.id == id).ok_or("项目不存在")?;
        if record.item.has_image && (patch.content.is_some() || patch.content_type.is_some() || patch.is_snippet == Some(true)) { return Err("图片内容不能改为文字片段；可修改备注或收藏".into()); }
        if let Some(title) = patch.title { record.item.title = Some(title.trim().into()); }
        if let Some(content) = patch.content { record.item.content = content; record.fingerprint = text_fingerprint(&record.item.content); }
        if let Some(content_type) = patch.content_type { record.item.content_type = content_type; }
        if let Some(note) = patch.note { record.item.note = if note.is_empty() { None } else { Some(note) }; }
        if let Some(tags) = patch.tags { record.item.tags = tags; }
        if let Some(is_snippet) = patch.is_snippet { record.item.is_snippet = is_snippet; }
        record.item.updated_at = now();
        validate_item(&record.item)?;
        let item = record.item.clone();
        self.commit(candidate, Vec::new(), &[id], true)?;
        self.last_error = None;
        Ok(item)
    }

    pub fn delete(&mut self, id: i64) -> Result<(), String> {
        let mut candidate = self.disk.clone();
        let count = candidate.items.len();
        candidate.items.retain(|r| r.item.id != id);
        if count == candidate.items.len() { return Err("项目不存在".into()); }
        self.commit(candidate, Vec::new(), &[], true)?;
        self.last_error = None;
        Ok(())
    }

    pub fn toggle_favorite(&mut self, id: i64) -> Result<bool, String> {
        let mut candidate = self.disk.clone();
        let record = candidate.items.iter_mut().find(|r| r.item.id == id).ok_or("项目不存在")?;
        record.item.is_favorite = !record.item.is_favorite;
        record.item.updated_at = now();
        let favorite = record.item.is_favorite;
        self.commit(candidate, Vec::new(), if favorite { std::slice::from_ref(&id) } else { &[] }, true)?;
        self.last_error = None;
        Ok(favorite)
    }

    pub fn update_settings(&mut self, patch: SettingsPatch) -> Result<(), String> {
        let mut candidate = self.disk.clone();
        let settings = &mut candidate.settings;
        if let Some(value) = patch.max_history_items { settings.max_history_items = value; }
        if let Some(value) = patch.auto_cleanup { settings.auto_cleanup = value; }
        if let Some(value) = patch.cleanup_days { settings.cleanup_days = value; }
        if let Some(value) = patch.global_shortcut { settings.global_shortcut = value; }
        if let Some(value) = patch.start_at_login { settings.start_at_login = value; }
        if let Some(value) = patch.show_preview { settings.show_preview = value; }
        settings.validate()?;
        self.commit(candidate, Vec::new(), &[], true)?;
        self.last_error = None;
        Ok(())
    }

    pub fn clear(&mut self, include_protected: bool) -> Result<(), String> {
        let mut candidate = self.disk.clone();
        candidate.items.retain(|r| !include_protected && protected(r));
        self.commit(candidate, Vec::new(), &[], true)?;
        self.last_error = None;
        Ok(())
    }

    pub fn cleanup(&mut self) -> Result<bool, String> {
        let previous = self.disk.items.len();
        self.commit(self.disk.clone(), Vec::new(), &[], true)?;
        Ok(previous != self.disk.items.len())
    }

    pub fn pause(&mut self, duration_minutes: u32) -> Result<(), String> {
        if duration_minutes > 1440 { return Err("暂停时间最多为 24 小时".into()); }
        self.paused_until = (duration_minutes > 0).then(|| now() + duration_minutes as i64 * 60_000);
        if duration_minutes > 0 { self.skip_resume_sample = true; }
        Ok(())
    }

    /// Content copied while paused stays excluded when capture resumes.
    pub fn ignore_resume_sample(&mut self, fingerprint: &str) -> bool {
        if !self.skip_resume_sample { return false; }
        self.skip_resume_sample = false;
        self.last_fingerprint = Some(fingerprint.into());
        true
    }

    pub fn item_for_copy(&self, id: i64) -> Result<(ClipboardItem, String, Option<Vec<u8>>), String> {
        let record = self.disk.items.iter().find(|r| r.item.id == id).ok_or("项目不存在")?;
        if record.item.content_type == "image" && !record.item.has_image { return Err("这条历史图片的原文件已缺失，无法复制".into()); }
        let image = if let Some(name) = &record.image_file {
            if !safe_image_name(id, name) { return Err("图片文件名无效".into()); }
            let path = self.root.join("images").join(name);
            if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_IMAGE_BYTES as u64 { return Err("图片文件超过限制".into()); }
            Some(fs::read(path).map_err(|e| e.to_string())?)
        } else { None };
        Ok((record.item.clone(), record.fingerprint.clone(), image))
    }

    pub fn image_data(&self, id: i64) -> Result<String, String> {
        let (_, _, image) = self.item_for_copy(id)?;
        image.map(|bytes| format!("data:image/png;base64,{}", STANDARD.encode(bytes))).ok_or_else(|| "该记录没有图片".into())
    }

    pub fn image_thumbnail(&self, id: i64) -> Result<String, String> {
        let (_, _, image) = self.item_for_copy(id)?;
        let bytes = image.ok_or("该记录没有图片")?;
        let (width, height, rgba) = decode_image(&bytes)?;
        let original = image::RgbaImage::from_raw(width, height, rgba).ok_or("图片像素数据无效")?;
        // Preserve aspect ratio and alpha; small images stay at their original size.
        let thumbnail = if width > 160 || height > 160 {
            image::DynamicImage::ImageRgba8(original).thumbnail(160, 160).into_rgba8()
        } else { original };
        let png = encode_image(thumbnail.width(), thumbnail.height(), thumbnail.as_raw())?;
        Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
    }

    pub fn record_copy(&mut self, id: i64, fingerprint: String) -> Result<(), String> {
        // Set this even when saving the usage counter fails, to prevent self-recapture.
        self.last_fingerprint = Some(fingerprint);
        let mut candidate = self.disk.clone();
        let record = candidate.items.iter_mut().find(|r| r.item.id == id).ok_or("项目不存在")?;
        record.item.use_weight = record.item.use_weight.saturating_add(1);
        self.commit(candidate, Vec::new(), &[], true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_ID: AtomicU64 = AtomicU64::new(0);
    struct TestDir(PathBuf);
    impl TestDir {
        fn new() -> Self { Self(std::env::temp_dir().join(format!("clipjar-history-test-{}-{}", std::process::id(), TEST_ID.fetch_add(1, Ordering::Relaxed)))) }
        fn manager(&self) -> HistoryManager { HistoryManager::open(self.0.clone()).unwrap() }
    }
    impl Drop for TestDir { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }

    #[test]
    fn full_content_fingerprints_distinguish_shared_prefixes_and_equal_size_images() {
        let prefix = "长".repeat(150);
        assert_ne!(text_fingerprint(&format!("{prefix}A")), text_fingerprint(&format!("{prefix}B")));
        assert_ne!(image_fingerprint(1, 1, &[1, 2, 3, 255]), image_fingerprint(1, 1, &[4, 5, 6, 255]));
    }

    #[test]
    fn image_round_trip_survives_restart_and_delete_removes_asset() {
        let dir = TestDir::new();
        let mut manager = dir.manager();
        manager.bootstrap(Vec::new(), None).unwrap();
        let pixels = [12, 34, 56, 255, 78, 90, 12, 123];
        let item = manager.add_image(2, 1, &pixels).unwrap().unwrap();
        drop(manager);
        let mut manager = dir.manager();
        let (_, _, png) = manager.item_for_copy(item.id).unwrap();
        assert_eq!(decode_image(&png.unwrap()).unwrap(), (2, 1, pixels.to_vec()));
        manager.delete(item.id).unwrap();
        assert_eq!(fs::read_dir(dir.0.join("images")).unwrap().count(), 0);
    }

    #[test]
    fn thumbnails_preserve_aspect_ratio_alpha_and_full_image_data() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        let rgba = [12, 34, 56, 123].repeat(320 * 80);
        let item = manager.add_image(320, 80, &rgba).unwrap().unwrap();
        let thumbnail = manager.image_thumbnail(item.id).unwrap();
        let thumbnail_png = STANDARD.decode(thumbnail.strip_prefix("data:image/png;base64,").unwrap()).unwrap();
        let (width, height, pixels) = decode_image(&thumbnail_png).unwrap();
        assert_eq!((width, height), (160, 40));
        assert!(pixels.chunks_exact(4).all(|pixel| pixel == [12, 34, 56, 123]));
        let full = manager.image_data(item.id).unwrap();
        let full_png = STANDARD.decode(full.strip_prefix("data:image/png;base64,").unwrap()).unwrap();
        assert_eq!(decode_image(&full_png).unwrap(), (320, 80, rgba));
    }

    #[test]
    fn small_thumbnails_are_not_upscaled_and_portraits_fit_160_pixels() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        for (width, height, expected) in [(2, 1, (2, 1)), (80, 320, (40, 160))] {
            let rgba = [1, 2, 3, 255].repeat(width as usize * height as usize);
            let item = manager.add_image(width, height, &rgba).unwrap().unwrap();
            let source = manager.image_thumbnail(item.id).unwrap();
            let png = STANDARD.decode(source.strip_prefix("data:image/png;base64,").unwrap()).unwrap();
            let (width, height, _) = decode_image(&png).unwrap();
            assert_eq!((width, height), expected);
        }
        assert!(manager.image_thumbnail(-1).is_err());
        assert_eq!(Settings::default().global_shortcut, "CommandOrControl+Shift+V");
    }

    #[test]
    fn ordinary_retention_allows_500_without_dropping_favorites_or_snippets() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        manager.update_settings(SettingsPatch { max_history_items: Some(500), auto_cleanup: Some(false), ..SettingsPatch::default() }).unwrap();
        for index in 0..501 { manager.add_text(format!("record {index}"), None).unwrap(); }
        let first = manager.snapshot().items.last().unwrap().id;
        manager.toggle_favorite(first).unwrap();
        let snippet = manager.create_snippet("地址".into(), "原始内容\n  末尾".into(), None, None).unwrap();
        manager.add_text("latest".into(), None).unwrap();
        assert_eq!(manager.stats().ordinary_count, 500);
        assert_eq!(manager.stats().item_count, 502);
        manager.update_settings(SettingsPatch { max_history_items: Some(10), ..SettingsPatch::default() }).unwrap();
        assert_eq!(manager.stats().ordinary_count, 10);
        assert!(manager.snapshot().items.iter().any(|item| item.id == first));
        assert!(manager.snapshot().items.iter().any(|item| item.id == snippet.id));
    }

    #[test]
    fn age_cleanup_honors_setting_and_protects_saved_content() {
        let mut disk = DiskState::default();
        let old = now() - 60 * DAY;
        for id in 1..=3 { disk.items.push(Record { item: ClipboardItem { id, created_at: old, is_favorite: id == 2, is_snippet: id == 3, ..ClipboardItem::default() }, fingerprint: String::new(), image_file: None, image_bytes: 0 }); }
        disk.settings.auto_cleanup = false; retain(&mut disk, now()); assert_eq!(disk.items.len(), 3);
        disk.settings.auto_cleanup = true; retain(&mut disk, now()); assert_eq!(disk.items.len(), 2);
    }

    #[test]
    fn legacy_fractional_ids_and_jpeg_png_assets_import_once() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        let png = encode_image(1, 1, &[1, 2, 3, 255]).unwrap();
        let legacy = serde_json::json!({ "id": 123.456, "content": "[图片]", "contentType": "image", "createdAt": now(), "imagePath": format!("data:image/png;base64,{}", STANDARD.encode(png)), "isFavorite": true });
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new(&mut jpeg).encode(&[11, 22, 33], 1, 1, ExtendedColorType::Rgb8).unwrap();
        let jpeg_legacy = serde_json::json!({ "id": 123.789, "content": "JPEG", "contentType": "image", "createdAt": now(), "imagePath": format!("data:image/jpeg;base64,{}", STANDARD.encode(jpeg)) });
        let snapshot = manager.bootstrap(vec![legacy.clone(), jpeg_legacy], None).unwrap();
        assert!(snapshot.migration_complete); assert!(snapshot.items.iter().all(|item| item.has_image && item.id > 123));
        assert_eq!(manager.bootstrap(vec![legacy], None).unwrap().items.len(), 2);
    }

    #[test]
    fn failed_migration_keeps_marker_and_previous_manifest_unchanged() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        let before = fs::read(dir.0.join("history.json")).unwrap();
        let legacy = serde_json::json!({ "id": 123.456, "contentType": "image", "createdAt": now(), "imagePath": "data:image/png;base64,bad" });
        assert!(manager.bootstrap(vec![legacy], None).is_err());
        assert!(!manager.ready()); assert_eq!(before, fs::read(dir.0.join("history.json")).unwrap());
    }

    #[test]
    fn budget_rejects_protected_overflow_without_mutation() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        let mut candidate = manager.disk.clone();
        candidate.items.push(Record { item: ClipboardItem { id: 1, content: "kept".into(), is_favorite: true, ..ClipboardItem::default() }, fingerprint: String::new(), image_file: None, image_bytes: IMAGE_BUDGET + 1 });
        let before = fs::read(dir.0.join("history.json")).unwrap();
        assert!(manager.commit(candidate, Vec::new(), &[], true).is_err());
        assert_eq!(manager.stats().item_count, 0); assert_eq!(before, fs::read(dir.0.join("history.json")).unwrap());
    }

    #[test]
    fn budget_evicts_old_ordinary_entries_first() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        let mut candidate = manager.disk.clone();
        for id in 1..=3 { candidate.items.push(Record { item: ClipboardItem { id, created_at: now() + id, is_favorite: id == 1, ..ClipboardItem::default() }, fingerprint: String::new(), image_file: None, image_bytes: IMAGE_BUDGET / 2 }); }
        manager.commit(candidate, Vec::new(), &[3], true).unwrap();
        assert_eq!(manager.disk.items.iter().map(|r| r.item.id).collect::<Vec<_>>(), vec![3, 1]);
    }

    #[test]
    fn copied_item_is_not_recaptured_and_snippet_edit_preserves_whitespace() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        let item = manager.create_snippet("  名称  ".into(), "  内容\n".into(), None, None).unwrap();
        manager.record_copy(item.id, text_fingerprint(&item.content)).unwrap();
        assert!(manager.add_text(item.content, None).unwrap().is_none());
        let edited = manager.update(item.id, ItemPatch { content: Some("\n新内容  ".into()), ..ItemPatch::default() }).unwrap();
        assert_eq!(edited.content, "\n新内容  "); assert_eq!(edited.title.as_deref(), Some("名称")); assert_eq!(edited.use_weight, 1);
    }

    #[test]
    fn filenames_and_clear_are_safe_for_protected_records() {
        assert!(!safe_image_name(1, "../1.png")); assert!(!safe_image_name(1, "2.png")); assert!(!managed_image_name("01.png"));
        let dir = TestDir::new(); let mut manager = dir.manager();
        manager.add_text("ordinary".into(), None).unwrap();
        manager.create_snippet("保留".into(), "saved".into(), None, None).unwrap();
        manager.clear(false).unwrap(); assert_eq!(manager.stats().item_count, 1);
        manager.clear(true).unwrap(); assert_eq!(manager.stats().item_count, 0);
    }

    #[test]
    fn repeated_writes_replace_metadata_and_pause_can_resume() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        for value in ["first", "second", "third"] { manager.add_text(value.into(), None).unwrap(); }
        assert_eq!(dir.manager().stats().item_count, 3);
        manager.pause(15).unwrap(); assert!(manager.is_paused());
        manager.pause(0).unwrap(); assert!(!manager.is_paused());
    }

    #[test]
    fn resumed_capture_skips_content_copied_during_pause() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        manager.pause(15).unwrap(); manager.pause(0).unwrap();
        let fingerprint = text_fingerprint("sensitive value");
        assert!(manager.ignore_resume_sample(&fingerprint));
        assert!(manager.add_text("sensitive value".into(), None).unwrap().is_none());
        assert!(manager.add_text("next value".into(), None).unwrap().is_some());
    }

    #[test]
    fn failed_manifest_save_rolls_back_memory_and_new_image_assets() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        manager.add_text("kept".into(), None).unwrap();
        let before = fs::read(dir.0.join("history.json")).unwrap();
        fs::create_dir(dir.0.join("history.next")).unwrap();
        assert!(manager.add_image(1, 1, &[1, 2, 3, 255]).is_err());
        assert_eq!(manager.stats().item_count, 1);
        assert_eq!(before, fs::read(dir.0.join("history.json")).unwrap());
        assert_eq!(fs::read_dir(dir.0.join("images")).unwrap().count(), 0);
    }

    #[test]
    fn corrupt_manifest_is_preserved_and_snapshot_revision_covers_transient_state() {
        let dir = TestDir::new(); let mut manager = dir.manager();
        let first = manager.snapshot().revision;
        manager.last_error = Some("warning".into());
        assert!(manager.snapshot().revision > first);
        drop(manager);
        fs::write(dir.0.join("history.json"), b"bad json").unwrap();
        assert!(HistoryManager::open(dir.0.clone()).is_err());
        assert_eq!(fs::read(dir.0.join("history.json")).unwrap(), b"bad json");
    }
}
