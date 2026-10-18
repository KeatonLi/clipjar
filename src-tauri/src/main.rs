#![windows_subsystem = "windows"]

mod clipboard;
mod history;

use clipboard::SharedHistory;
use history::{ClipboardItem, HistoryManager, ItemPatch, Settings, SettingsPatch, Snapshot, StorageStats};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};
use tauri_plugin_autostart::MacosLauncher;

#[tauri::command]
async fn get_clipboard_bootstrap(app_handle: AppHandle, state: State<'_, SharedHistory>, legacy_items: Option<Vec<serde_json::Value>>, legacy_settings: Option<Settings>) -> Result<Snapshot, String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.bootstrap(legacy_items.unwrap_or_default(), legacy_settings)).await
}

#[tauri::command]
async fn get_clipboard_history(state: State<'_, SharedHistory>) -> Result<Vec<ClipboardItem>, String> {
    clipboard::read(state.inner().clone(), |manager| Ok(manager.snapshot().items)).await
}

#[tauri::command]
async fn add_clipboard_item(app_handle: AppHandle, state: State<'_, SharedHistory>, content: String, content_type: Option<String>) -> Result<Option<ClipboardItem>, String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.add_text(content, content_type)).await
}

#[tauri::command]
async fn create_snippet(app_handle: AppHandle, state: State<'_, SharedHistory>, title: String, content: String, content_type: Option<String>, note: Option<String>) -> Result<ClipboardItem, String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.create_snippet(title, content, content_type, note)).await
}

#[tauri::command]
async fn update_clipboard_item(app_handle: AppHandle, state: State<'_, SharedHistory>, id: i64, updates: ItemPatch) -> Result<ClipboardItem, String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.update(id, updates)).await
}

#[tauri::command]
async fn delete_clipboard_item(app_handle: AppHandle, state: State<'_, SharedHistory>, id: i64) -> Result<(), String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.delete(id)).await
}

#[tauri::command]
async fn toggle_favorite(app_handle: AppHandle, state: State<'_, SharedHistory>, id: i64) -> Result<bool, String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.toggle_favorite(id)).await
}

#[tauri::command]
async fn update_clipboard_settings(app_handle: AppHandle, state: State<'_, SharedHistory>, settings: SettingsPatch) -> Result<(), String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.update_settings(settings)).await
}

#[tauri::command]
async fn clear_history(app_handle: AppHandle, state: State<'_, SharedHistory>, include_protected: Option<bool>) -> Result<(), String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.clear(include_protected.unwrap_or(false))).await
}

#[tauri::command]
async fn pause_capture(app_handle: AppHandle, state: State<'_, SharedHistory>, duration_minutes: u32) -> Result<(), String> {
    clipboard::mutate(app_handle, state.inner().clone(), move |manager| manager.pause(duration_minutes)).await
}

#[tauri::command]
async fn get_storage_stats(state: State<'_, SharedHistory>) -> Result<StorageStats, String> {
    clipboard::read(state.inner().clone(), |manager| Ok(manager.stats())).await
}

#[tauri::command]
async fn get_image_data(state: State<'_, SharedHistory>, id: i64) -> Result<String, String> {
    clipboard::read(state.inner().clone(), move |manager| manager.image_data(id)).await
}

#[tauri::command]
async fn get_image_thumbnail(state: State<'_, SharedHistory>, id: i64) -> Result<String, String> {
    clipboard::read(state.inner().clone(), move |manager| manager.image_thumbnail(id)).await
}

#[tauri::command]
async fn copy_clipboard_item(app_handle: AppHandle, state: State<'_, SharedHistory>, id: i64) -> Result<(), String> {
    clipboard::copy_item(app_handle, state.inner().clone(), id).await
}

#[tauri::command]
async fn write_clipboard_text(app_handle: AppHandle, state: State<'_, SharedHistory>, text: String) -> Result<(), String> {
    clipboard::write_text(app_handle, state.inner().clone(), text).await
}

#[tauri::command]
async fn write_clipboard_image(app_handle: AppHandle, state: State<'_, SharedHistory>, image_data: Vec<u8>) -> Result<(), String> {
    clipboard::write_image(app_handle, state.inner().clone(), image_data).await
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // A second launch focuses the running process, keeping one history writer.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_window(app)))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_clipboard_bootstrap, get_clipboard_history, add_clipboard_item,
            create_snippet, update_clipboard_item, delete_clipboard_item, toggle_favorite,
            update_clipboard_settings, clear_history, pause_capture, get_storage_stats,
            get_image_data, get_image_thumbnail, copy_clipboard_item, write_clipboard_text, write_clipboard_image,
        ])
        .setup(|app| {
            let root = app.path().app_data_dir()?.join("history");
            let manager = HistoryManager::open(root).map_err(std::io::Error::other)?;
            let state = Arc::new(Mutex::new(manager));
            app.manage(state.clone());
            clipboard::start_polling(app.handle().clone(), state);

            let show = MenuItem::with_id(app, "show", "显示 ClipJar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new().menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_window(app), "quit" => app.exit(0), _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { show_window(tray.app_handle()); }
                });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let closing_window = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = closing_window.hide(); }
                });
                if std::env::args().any(|arg| arg == "--minimized") { let _ = window.hide(); }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClipJar");
}
