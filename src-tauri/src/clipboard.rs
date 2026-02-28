use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

pub async fn write_clipboard_text(
    app_handle: AppHandle,
    text: String,
) -> Result<(), String> {
    app_handle
        .clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())
}
