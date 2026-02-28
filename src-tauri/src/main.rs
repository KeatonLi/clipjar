mod clipboard;

use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
fn get_clipboard_history() -> Vec<serde_json::Value> {
    vec![]
}

#[tauri::command]
fn add_clipboard_item(content: String, content_type: String, source_app: Option<String>) -> serde_json::Value {
    serde_json::json!({
        "id": 1,
        "content": content,
        "contentType": content_type,
        "sourceApp": source_app,
    })
}

#[tauri::command]
fn delete_clipboard_item(_id: i64) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn toggle_favorite(_id: i64) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn update_use_count(_id: i64) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn write_clipboard_text(app_handle: tauri::AppHandle, text: String) -> Result<(), String> {
    clipboard::write_clipboard_text(app_handle, text).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_clipboard_history,
            add_clipboard_item,
            delete_clipboard_item,
            toggle_favorite,
            update_use_count,
            write_clipboard_text,
        ])
        .setup(|app| {
            // 获取主窗口
            if let Some(window) = app.get_webview_window("main") {
                // 阻止窗口关闭，改为隐藏
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
