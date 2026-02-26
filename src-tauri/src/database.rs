use chrono::{DateTime, Utc};
use tauri::Manager; 
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use tauri::AppHandle;

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)] 
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    pub content_type: String,
    pub image_path: Option<String>,
    pub source_app: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_favorite: bool,
    pub use_count: i32,
    pub tags: String, // JSON array
}

pub struct Database {
    pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new(app_handle: &AppHandle) -> Result<Self, sqlx::Error> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data dir");

        std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");

        let db_path = app_dir.join("clipjar.db");
        let db_url = format!("sqlite:{}", db_path.to_str().unwrap());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await?;

        let db = Self { pool };
        db.init().await?;

        Ok(db)
    }

    async fn init(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS clipboard_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                content_type TEXT NOT NULL,
                image_path TEXT,
                source_app TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_favorite BOOLEAN DEFAULT 0,
                use_count INTEGER DEFAULT 0,
                tags TEXT DEFAULT '[]'
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        // 创建索引
        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_items(created_at DESC)"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_content_type ON clipboard_items(content_type)"
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_is_favorite ON clipboard_items(is_favorite)"
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_items(&self) -> Result<Vec<ClipboardItem>, sqlx::Error> {
        let items = sqlx::query_as::<_, ClipboardItem>(
            r#"
            SELECT * FROM clipboard_items
            ORDER BY created_at DESC
            LIMIT 500
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(items)
    }

    pub async fn add_item(
        &self,
        content: String,
        content_type: String,
        source_app: Option<String>,
    ) -> Result<ClipboardItem, sqlx::Error> {
        let now = Utc::now().to_rfc3339();

        let id = sqlx::query(
            r#"
            INSERT INTO clipboard_items
            (content, content_type, source_app, created_at, updated_at, is_favorite, use_count, tags)
            VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, '[]')
            "#
        )
        .bind(&content)
        .bind(&content_type)
        .bind(&source_app)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();

        Ok(ClipboardItem {
            id,
            content,
            content_type,
            image_path: None,
            source_app,
            created_at: now.clone(),
            updated_at: now,
            is_favorite: false,
            use_count: 0,
            tags: "[]".to_string(),
        })
    }

    pub async fn delete_item(&self, id: i64) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM clipboard_items WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn toggle_favorite(&self, id: i64) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE clipboard_items SET is_favorite = NOT is_favorite WHERE id = ?1"
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn increment_use_count(&self, id: i64) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE clipboard_items SET use_count = use_count + 1 WHERE id = ?1"
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn cleanup_old_items(&self, days: i64) -> Result<u64, sqlx::Error> {
        let cutoff = Utc::now() - chrono::Duration::days(days);

        let result = sqlx::query(
            r#"
            DELETE FROM clipboard_items
            WHERE created_at < ?1 AND is_favorite = 0
            "#
        )
        .bind(cutoff.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}
