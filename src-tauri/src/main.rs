// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod clipboard;
mod database;

use clipboard::{ClipboardManager, write_clipboard_text};
use database::Database;

#[tauri::command]
async fn get_clipboard_history(
    db: tauri::State<'_, Database>,
) -> Result<Vec<database::ClipboardItem>, String> {
    db.get_items().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_clipboard_item(
    db: tauri::State<'_, Database>,
    content: String,
    content_type: String,
    source_app: Option<String>,
) -> Result<database::ClipboardItem, String> {
    db.add_item(content, content_type, source_app)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_clipboard_item(db: tauri::State<'_, Database>, id: i64) -> Result<(), String> {
    db.delete_item(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_favorite(db: tauri::State<'_, Database>, id: i64) -> Result<(), String> {
    db.toggle_favorite(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_use_count(db: tauri::State<'_, Database>, id: i64) -> Result<(), String> {
    db.increment_use_count(id).await.map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 初始化数据库
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let db = Database::new(&app_handle).await.expect("Failed to initialize database");
                app_handle.manage(db);
            });

            // 初始化剪贴板监听
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut clipboard = ClipboardManager::new(app_handle);
                clipboard.start_monitoring().await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard_history,
            add_clipboard_item,
            delete_clipboard_item,
            toggle_favorite,
            update_use_count,
            write_clipboard_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
