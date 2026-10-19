use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageEncoder, RgbaImage};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const UNDO_MS: i64 = 10_000;
const MAX_PIXELS: u64 = 4096 * 4096;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: f64,
    pub content: String,
    pub content_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_height: Option<u32>,
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub use_weight: u64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
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
    fn validate(&self) -> Result<()> {
        if !(10..=500).contains(&self.max_history_items)
            || self.cleanup_days == 0
            || self.cleanup_days > 36500
        {
            return Err("记录设置超出允许范围".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Undo {
    pub token: String,
    pub expires_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: i64,
    pub items: Vec<Item>,
    pub settings: Settings,
    pub pause_until: Option<i64>,
    pub undo: Option<Undo>,
    pub storage_bytes: u64,
    pub migration_backup: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    Favorite {
        id: f64,
    },
    Note {
        id: f64,
        note: String,
    },
    Delete {
        id: f64,
    },
    Undo {
        token: String,
    },
    Clear {
        #[serde(rename = "includeFavorites")]
        include_favorites: bool,
    },
    Settings {
        settings: Settings,
    },
    Pause {
        minutes: Option<u32>,
    },
    Resume,
    Use {
        id: f64,
    },
}

pub struct History {
    db: Connection,
    root: PathBuf,
}

fn private_dir(path: &Path) -> Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
fn write_new(path: &Path, data: &[u8]) -> Result<()> {
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(data)?;
    file.sync_all()?;
    Ok(())
}
fn atomic_file(path: &Path, data: &[u8]) -> Result<()> {
    if path.exists() {
        if fs::read(path)? == data {
            return Ok(());
        }
        return Err("已存在的文件内容不一致，请保留文件并检查应用数据目录".into());
    }
    let temp = path.with_extension(format!("{}.tmp", std::process::id()));
    if temp.exists() {
        fs::remove_file(&temp)?;
    }
    write_new(&temp, data)?;
    match fs::rename(&temp, path) {
        Ok(()) => {}
        Err(error) => {
            if path.is_file() && fs::read(path)? == data {
                fs::remove_file(&temp)?;
            } else {
                return Err(error.into());
            }
        }
    }
    #[cfg(unix)]
    {
        std::fs::File::open(path.parent().ok_or("missing parent")?)?.sync_all()?;
    }
    Ok(())
}
fn meta(db: &Connection, key: &str) -> Result<Option<String>> {
    Ok(db
        .query_row("SELECT value FROM meta WHERE key=?1", [key], |row| {
            row.get(0)
        })
        .optional()?)
}
fn set_meta(db: &Connection, key: &str, value: &str) -> Result<()> {
    db.execute("INSERT INTO meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key,value])?;
    Ok(())
}
fn bump(db: &Connection) -> Result<()> {
    db.execute(
        "UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision'",
        [],
    )?;
    Ok(())
}
fn items(db: &Connection, include_deleted: bool) -> Result<Vec<Item>> {
    let sql = if include_deleted {
        "SELECT item FROM records ORDER BY time DESC,id DESC"
    } else {
        "SELECT item FROM records WHERE deleted_until IS NULL ORDER BY time DESC,id DESC"
    };
    let mut statement = db.prepare(sql)?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
}
fn hash(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}
fn image_fingerprint(width: u32, height: u32, rgba: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(width.to_le_bytes());
    digest.update(height.to_le_bytes());
    digest.update(rgba);
    format!("image:{:x}", digest.finalize())
}
fn text_fingerprint(_kind: &str, text: &str) -> String {
    format!("text:{}", hash(text.as_bytes()))
}
fn store_item(tx: &Transaction<'_>, item: &Item, fingerprint: &str) -> Result<()> {
    let old_key: Option<String> = tx
        .query_row(
            "SELECT fingerprint FROM records WHERE id=?1",
            [item.id],
            |row| row.get(0),
        )
        .optional()?;
    if old_key.is_some_and(|key| key != fingerprint) {
        return Err("旧记录 ID 冲突，请保留备份并检查原始记录".into());
    }
    tx.execute("INSERT INTO records(id,fingerprint,item,time,deleted_until,delete_token) VALUES(?1,?2,?3,?4,NULL,NULL)
        ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,item=excluded.item,time=excluded.time,deleted_until=NULL,delete_token=NULL",
        params![item.id,fingerprint,serde_json::to_string(item)?,item.created_at])?;
    Ok(())
}
fn merge(tx: &Transaction<'_>, mut incoming: Item, fingerprint: &str) -> Result<()> {
    let existing: Option<String> = tx
        .query_row(
            "SELECT item FROM records WHERE fingerprint=?1",
            [fingerprint],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(json) = existing {
        let old: Item = serde_json::from_str(&json)?;
        incoming.id = old.id;
        incoming.created_at = incoming.created_at.max(old.created_at);
        incoming.updated_at = incoming.updated_at.max(old.updated_at);
        incoming.is_favorite |= old.is_favorite;
        incoming.use_weight += old.use_weight;
        if incoming.note.as_deref().unwrap_or("").is_empty() {
            incoming.note = old.note;
        } else if let Some(note) = old.note.filter(|note| Some(note) != incoming.note.as_ref()) {
            incoming.note = Some(format!("{}\n{}", note, incoming.note.unwrap_or_default()));
        }
        for tag in old.tags {
            if !incoming.tags.contains(&tag) {
                incoming.tags.push(tag);
            }
        }
        if incoming.source_app.is_none() {
            incoming.source_app = old.source_app;
        }
        if incoming.image_path.is_none() {
            incoming.image_path = old.image_path;
        }
    }
    store_item(tx, &incoming, fingerprint)
}
fn retention(tx: &Transaction<'_>, settings: &Settings, now: i64) -> Result<()> {
    let mut normal = 0;
    for item in items(tx, false)? {
        if item.is_favorite {
            continue;
        }
        normal += 1;
        if normal > settings.max_history_items
            || (settings.auto_cleanup
                && item.created_at < now - i64::from(settings.cleanup_days) * 86_400_000)
        {
            tx.execute("DELETE FROM records WHERE id=?1", [item.id])?;
        }
    }
    Ok(())
}

impl History {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        private_dir(&root)?;
        private_dir(&root.join("images"))?;
        private_dir(&root.join("backups"))?;
        let path = root.join("history.sqlite");
        if !path.exists() {
            write_new(&path, &[])?;
        }
        let db = Connection::open(path)?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;
            CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            INSERT OR IGNORE INTO meta VALUES('revision','0');
            CREATE TABLE IF NOT EXISTS records(id REAL PRIMARY KEY,fingerprint TEXT UNIQUE NOT NULL,item TEXT NOT NULL,time INTEGER NOT NULL,deleted_until INTEGER,delete_token TEXT);
            CREATE INDEX IF NOT EXISTS record_time ON records(time DESC);")?;
        Ok(Self { db, root })
    }
    pub fn initialized(&self) -> bool {
        meta(&self.db, "migration_complete")
            .ok()
            .flatten()
            .as_deref()
            == Some("1")
    }
    pub fn settings(&self) -> Result<Settings> {
        Ok(meta(&self.db, "settings")?
            .map(|json| serde_json::from_str(&json))
            .transpose()?
            .unwrap_or_default())
    }
    pub fn pause_until(&self) -> Result<Option<i64>> {
        Ok(meta(&self.db, "pause_until")?
            .map(|value| value.parse())
            .transpose()?)
    }
    pub fn paused(&self, now: i64) -> Result<bool> {
        let until = self.pause_until()?;
        Ok(until.is_some_and(|value| value == 0 || value > now))
    }
    pub fn snapshot(&self, now: i64) -> Result<Snapshot> {
        let mut records = items(&self.db, false)?;
        for item in &mut records {
            if let Some(name) = &item.image_path {
                item.image_path = Some(
                    self.root
                        .join("images")
                        .join(name)
                        .to_string_lossy()
                        .into_owned(),
                );
            }
        }
        let pause_until = meta(&self.db, "pause_until")?
            .map(|value| value.parse())
            .transpose()?
            .filter(|value| *value == 0 || *value > now);
        let undo = self.db.query_row("SELECT delete_token,deleted_until FROM records WHERE deleted_until>?1 ORDER BY deleted_until DESC LIMIT 1",[now],|row| Ok(Undo {token:row.get(0)?,expires_at:row.get(1)?})).optional()?;
        let storage_bytes = fs::read_dir(&self.root)?
            .filter_map(|e| e.ok())
            .filter_map(|e| e.metadata().ok())
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .sum::<u64>()
            + ["images", "backups"]
                .into_iter()
                .map(|folder| -> Result<u64> {
                    Ok(fs::read_dir(self.root.join(folder))?
                        .filter_map(|e| e.ok())
                        .filter_map(|e| e.metadata().ok())
                        .filter(|m| m.is_file())
                        .map(|m| m.len())
                        .sum::<u64>())
                })
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .sum::<u64>();
        Ok(Snapshot {
            revision: meta(&self.db, "revision")?.unwrap_or_default().parse()?,
            items: records,
            settings: self.settings()?,
            pause_until,
            undo,
            storage_bytes,
            migration_backup: meta(&self.db, "migration_backup")?,
        })
    }
    fn save_image(&self, width: u32, height: u32, rgba: &[u8]) -> Result<(String, String)> {
        if width == 0
            || height == 0
            || u64::from(width) * u64::from(height) > MAX_PIXELS
            || rgba.len() as u64 != u64::from(width) * u64::from(height) * 4
        {
            return Err("图片尺寸或像素数据无效".into());
        }
        let fingerprint = image_fingerprint(width, height, rgba);
        let name = format!("{}.png", fingerprint.trim_start_matches("image:"));
        let path = self.root.join("images").join(&name);
        if !path.exists() {
            let mut encoded = Vec::new();
            image::codecs::png::PngEncoder::new(&mut encoded).write_image(
                rgba,
                width,
                height,
                image::ExtendedColorType::Rgba8,
            )?;
            atomic_file(&path, &encoded)?;
        }
        Ok((name, fingerprint))
    }
    fn prepare_legacy(&self, mut item: Item) -> Result<(Item, String)> {
        if !item.id.is_finite()
            || item.id.abs() > 9_007_199_254_740_000.0
            || !["text", "image", "code", "link", "file"].contains(&item.content_type.as_str())
        {
            return Err("旧记录格式无效，已保留原始备份".into());
        }
        let mut fingerprint = if item.content_type == "image" {
            format!("missing-image:{}", item.id)
        } else {
            text_fingerprint(&item.content_type, &item.content)
        };
        if let Some(data) = &item.image_path {
            let (_, encoded) = data
                .split_once(',')
                .filter(|(header, _)| {
                    header.starts_with("data:image/") && header.ends_with(";base64")
                })
                .ok_or("旧图片格式无效")?;
            let bytes = STANDARD.decode(encoded)?;
            let mut reader =
                image::ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format()?;
            let mut limits = image::Limits::default();
            limits.max_image_width = Some(MAX_PIXELS as u32);
            limits.max_image_height = Some(MAX_PIXELS as u32);
            limits.max_alloc = Some(128 * 1024 * 1024);
            reader.limits(limits);
            let rgba = reader.decode()?.into_rgba8();
            let (name, key) = self.save_image(rgba.width(), rgba.height(), rgba.as_raw())?;
            item.image_width = Some(rgba.width());
            item.image_height = Some(rgba.height());
            item.image_path = Some(name);
            fingerprint = key;
        }
        Ok((item, fingerprint))
    }
    /// Back up the exact legacy value before parsing, and mark complete only after a committed import.
    pub fn initialize(
        &mut self,
        legacy: Option<&str>,
        shortcut: Option<&str>,
        now: i64,
    ) -> Result<Snapshot> {
        if self.initialized() {
            return self.snapshot(now);
        }
        let backup = if let Some(raw) = legacy.filter(|raw| !raw.is_empty()) {
            let name = format!("legacy-{}.json", hash(raw.as_bytes()));
            let path = self.root.join("backups").join(name);
            atomic_file(&path, raw.as_bytes())?;
            Some(path.to_string_lossy().into_owned())
        } else {
            None
        };
        #[derive(Deserialize)]
        struct Envelope {
            state: Legacy,
        }
        #[derive(Deserialize)]
        struct Legacy {
            #[serde(default)]
            items: Vec<Item>,
            #[serde(default)]
            settings: Settings,
        }
        let (records, mut settings) = if let Some(raw) = legacy.filter(|raw| !raw.is_empty()) {
            let state: Envelope = serde_json::from_str(raw)?;
            (state.state.items, state.state.settings)
        } else {
            (Vec::new(), Settings::default())
        };
        if let Some(shortcut) = shortcut {
            settings.global_shortcut = shortcut.to_owned();
        }
        settings.validate()?;
        let prepared = records
            .into_iter()
            .map(|item| self.prepare_legacy(item))
            .collect::<Result<Vec<_>>>()?;
        let tx = self.db.transaction()?;
        for (item, key) in prepared {
            merge(&tx, item, &key)?;
        }
        set_meta(&tx, "settings", &serde_json::to_string(&settings)?)?;
        if let Some(path) = backup {
            set_meta(&tx, "migration_backup", &path)?;
        }
        set_meta(&tx, "migration_complete", "1")?;
        bump(&tx)?;
        tx.commit()?;
        let _ = self.collect_garbage(now);
        self.snapshot(now)
    }
    fn next_id(&self, now: i64) -> Result<f64> {
        let maximum: f64 =
            self.db
                .query_row("SELECT COALESCE(MAX(id),0) FROM records", [], |row| {
                    row.get(0)
                })?;
        Ok(((now as f64) * 1000.0).max(maximum.floor() + 1.0))
    }
    pub fn text_key(content: &str) -> String {
        text_fingerprint(Self::content_type(content), content)
    }
    fn content_type(content: &str) -> &'static str {
        if content.starts_with("https://") || content.starts_with("http://") {
            "link"
        } else if [
            "const ",
            "let ",
            "function ",
            "import ",
            "def ",
            "class ",
            "SELECT ",
            "fn ",
        ]
        .iter()
        .any(|key| content.contains(key))
        {
            "code"
        } else {
            "text"
        }
    }
    pub fn capture_text(&mut self, text: &str, now: i64) -> Result<()> {
        if !self.initialized() || self.paused(now)? || text.trim().is_empty() {
            return Ok(());
        }
        if text.len() > 1024 * 1024 {
            return Err("剪贴文字超过 1 MiB，本次未记录".into());
        }
        let item = Item {
            id: self.next_id(now)?,
            content: text.into(),
            content_type: Self::content_type(text).into(),
            image_path: None,
            image_width: None,
            image_height: None,
            created_at: now,
            updated_at: now,
            is_favorite: false,
            use_weight: 0,
            tags: vec![],
            note: None,
            source_app: None,
        };
        let settings = self.settings()?;
        let tx = self.db.transaction()?;
        merge(&tx, item, &Self::text_key(text))?;
        retention(&tx, &settings, now)?;
        bump(&tx)?;
        tx.commit()?;
        let _ = self.collect_garbage(now);
        Ok(())
    }
    pub fn capture_image(
        &mut self,
        width: u32,
        height: u32,
        rgba: &[u8],
        now: i64,
    ) -> Result<String> {
        let key = image_fingerprint(width, height, rgba);
        if !self.initialized() || self.paused(now)? {
            return Ok(key);
        }
        let (name, key) = self.save_image(width, height, rgba)?;
        let item = Item {
            id: self.next_id(now)?,
            content: format!("[图片 {}x{}]", width, height),
            content_type: "image".into(),
            image_path: Some(name),
            image_width: Some(width),
            image_height: Some(height),
            created_at: now,
            updated_at: now,
            is_favorite: false,
            use_weight: 0,
            tags: vec![],
            note: None,
            source_app: None,
        };
        let settings = self.settings()?;
        let tx = self.db.transaction()?;
        merge(&tx, item, &key)?;
        retention(&tx, &settings, now)?;
        bump(&tx)?;
        tx.commit()?;
        let _ = self.collect_garbage(now);
        Ok(key)
    }
    pub fn image_key(width: u32, height: u32, rgba: &[u8]) -> String {
        image_fingerprint(width, height, rgba)
    }
    pub fn act(&mut self, action: Action, now: i64) -> Result<Snapshot> {
        if !self.initialized() {
            return Err("旧数据迁移尚未完成，请先重试初始化".into());
        }
        let settings = self.settings()?;
        let tx = self.db.transaction()?;
        let update_item = |id: f64, change: &dyn Fn(&mut Item)| -> Result<()> {
            let (json, key): (String, String) = tx.query_row(
                "SELECT item,fingerprint FROM records WHERE id=?1 AND deleted_until IS NULL",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            let mut item: Item = serde_json::from_str(&json)?;
            change(&mut item);
            item.updated_at = now;
            store_item(&tx, &item, &key)
        };
        let clear_all = matches!(
            &action,
            Action::Clear {
                include_favorites: true
            }
        );
        match action {
            Action::Favorite { id } => {
                update_item(id, &|item| item.is_favorite = !item.is_favorite)?
            }
            Action::Note { id, note } => {
                if note.chars().count() > 200 {
                    return Err("备注最多 200 个字符".into());
                }
                update_item(id, &|item| item.note = Some(note.clone()))?;
            }
            Action::Use { id } => update_item(id, &|item| {
                item.use_weight += 1;
                item.created_at = now;
            })?,
            Action::Delete { id } => {
                tx.execute("UPDATE records SET deleted_until=?2,delete_token=?3 WHERE id=?1 AND deleted_until IS NULL",params![id,now+UNDO_MS,format!("{}-{}",now,id)])?;
            }
            Action::Undo { token } => {
                let id: Option<f64> = tx
                    .query_row(
                        "SELECT id FROM records WHERE delete_token=?1 AND deleted_until>?2",
                        params![token, now],
                        |row| row.get(0),
                    )
                    .optional()?;
                if let Some(id) = id {
                    tx.execute(
                        "UPDATE records SET deleted_until=NULL,delete_token=NULL WHERE id=?1",
                        [id],
                    )?;
                    update_item(id, &|item| item.created_at = now)?;
                }
            }
            Action::Clear { include_favorites } => {
                for item in items(&tx, true)? {
                    if include_favorites || !item.is_favorite {
                        tx.execute("DELETE FROM records WHERE id=?1", [item.id])?;
                    }
                }
            }
            Action::Settings { settings: next } => {
                next.validate()?;
                set_meta(&tx, "settings", &serde_json::to_string(&next)?)?;
                retention(&tx, &next, now)?;
            }
            Action::Pause { minutes } => {
                if minutes.is_some_and(|m| m == 0 || m > 1440) {
                    return Err("暂停时长无效".into());
                }
                set_meta(
                    &tx,
                    "pause_until",
                    &minutes
                        .map(|m| now + i64::from(m) * 60_000)
                        .unwrap_or(0)
                        .to_string(),
                )?;
            }
            Action::Resume => {
                tx.execute("DELETE FROM meta WHERE key='pause_until'", [])?;
            }
        }
        if !clear_all {
            let effective: Settings = meta(&tx, "settings")?
                .map(|json| serde_json::from_str(&json))
                .transpose()?
                .unwrap_or(settings);
            retention(&tx, &effective, now)?;
        }
        bump(&tx)?;
        tx.commit()?;
        if clear_all {
            // Explicit clear-all also removes legacy backups containing copied secrets.
            for entry in fs::read_dir(self.root.join("backups"))? {
                let entry = entry?;
                if entry.file_type()?.is_file()
                    && entry.file_name().to_string_lossy().starts_with("legacy-")
                {
                    fs::remove_file(entry.path())?;
                }
            }
            self.db
                .execute("DELETE FROM meta WHERE key='migration_backup'", [])?;
        }
        if clear_all {
            self.collect_garbage(now)?;
        } else {
            let _ = self.collect_garbage(now);
        }
        if clear_all {
            self.db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        }
        self.snapshot(now)
    }
    pub fn collect_garbage(&mut self, now: i64) -> Result<()> {
        self.db
            .execute("DELETE FROM records WHERE deleted_until<=?1", [now])?;
        let referenced = items(&self.db, true)?
            .into_iter()
            .filter_map(|item| item.image_path)
            .collect::<HashSet<_>>();
        for entry in fs::read_dir(self.root.join("images"))? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.file_type()?.is_file()
                && name.len() == 68
                && name.ends_with(".png")
                && name.as_bytes()[..64]
                    .iter()
                    .copied()
                    .all(|c| c.is_ascii_hexdigit())
                && !referenced.contains(&name)
            {
                fs::remove_file(entry.path())?;
            }
        }
        Ok(())
    }
    pub fn image_pixels(&self, id: f64) -> Result<RgbaImage> {
        let json: String = self.db.query_row(
            "SELECT item FROM records WHERE id=?1 AND deleted_until IS NULL",
            [id],
            |row| row.get(0),
        )?;
        let item: Item = serde_json::from_str(&json)?;
        let name = item.image_path.ok_or("这条记录已无图片数据")?;
        Ok(image::open(self.root.join("images").join(name))?.into_rgba8())
    }
}

pub enum ClipboardValue {
    Empty,
    Text(String),
    Image {
        width: u32,
        height: u32,
        rgba: Vec<u8>,
    },
}
#[derive(Default)]
pub struct Collector {
    last: Option<String>,
    skip_next: bool,
}
impl Collector {
    pub fn suspend(&mut self) {
        self.skip_next = true;
    }
    /// Check before reading the system clipboard: paused mode does not inspect copied data.
    pub fn enabled(&mut self, history: &History, now: i64) -> Result<bool> {
        if !history.initialized() {
            return Ok(false);
        }
        if history.paused(now)? {
            self.suspend();
            return Ok(false);
        }
        Ok(true)
    }
    pub fn observe(
        &mut self,
        history: &mut History,
        value: ClipboardValue,
        now: i64,
    ) -> Result<bool> {
        if !self.enabled(history, now)? {
            return Ok(false);
        }
        let key = match &value {
            ClipboardValue::Text(text) if !text.trim().is_empty() => Some(History::text_key(text)),
            ClipboardValue::Image {
                width,
                height,
                rgba,
            } => Some(History::image_key(*width, *height, rgba)),
            _ => None,
        };
        if self.skip_next {
            self.last = key;
            self.skip_next = false;
            return Ok(false);
        }
        if key == self.last {
            return Ok(false);
        }
        match value {
            ClipboardValue::Text(text) if key.is_some() => history.capture_text(&text, now)?,
            ClipboardValue::Image {
                width,
                height,
                rgba,
            } => {
                history.capture_image(width, height, &rgba, now)?;
            }
            _ => {
                self.last = key;
                return Ok(false);
            }
        }
        self.last = key;
        Ok(true)
    }
}
