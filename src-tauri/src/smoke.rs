use crate::clipboard::{self, HistoryState};
use clipjar_history::Action;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub fn start(app: AppHandle, state: Arc<HistoryState>) {
    tauri::async_runtime::spawn(async move {
        let result = run(&app, &state).await;
        match result {
            Ok(()) => {
                println!("CLIPJAR_NATIVE_SMOKE_PASSED");
                app.exit(0);
            }
            Err(error) => {
                eprintln!("Native smoke failed: {error}");
                app.exit(1);
            }
        }
    });
}
async fn run(app: &AppHandle, state: &HistoryState) -> Result<(), String> {
    {
        let mut runtime = state.runtime.lock().map_err(|_| "lock")?;
        runtime
            .history
            .initialize(None, None, clipboard::now())
            .map_err(|e| e.to_string())?;
    }
    app.global_shortcut()
        .register("Control+Shift+F12")
        .map_err(|e| e.to_string())?;
    if !app.global_shortcut().is_registered("Control+Shift+F12") {
        return Err("Shortcut was not registered".into());
    }
    app.global_shortcut()
        .unregister("Control+Shift+F12")
        .map_err(|e| e.to_string())?;
    let window = app.get_webview_window("main").ok_or("missing window")?;
    window.hide().map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    if window.is_visible().map_err(|e| e.to_string())? {
        return Err("Window did not hide".into());
    }
    app.clipboard()
        .write_text("clipjar-native-smoke")
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    {
        let runtime = state.runtime.lock().map_err(|_| "lock")?;
        if !runtime
            .history
            .snapshot(clipboard::now())
            .map_err(|e| e.to_string())?
            .items
            .iter()
            .any(|i| i.content == "clipjar-native-smoke")
        {
            return Err("Hidden window background capture failed".into());
        }
    }
    app.clipboard()
        .write_image(&tauri::image::Image::new_owned(
            vec![255, 0, 0, 255, 0, 0, 255, 255],
            2,
            1,
        ))
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    let image = app.clipboard().read_image().map_err(|e| e.to_string())?;
    if image.width() != 2 || image.height() != 1 {
        return Err("Native image clipboard mismatch".into());
    }
    {
        let mut runtime = state.runtime.lock().map_err(|_| "lock")?;
        if !runtime
            .history
            .snapshot(clipboard::now())
            .map_err(|e| e.to_string())?
            .items
            .iter()
            .any(|i| i.content_type == "image")
        {
            return Err("Image persistence failed".into());
        }
        runtime
            .history
            .act(Action::Pause { minutes: None }, clipboard::now())
            .map_err(|e| e.to_string())?;
        runtime.collector.suspend();
    }
    app.clipboard()
        .write_text("private-smoke-copy")
        .map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    {
        let mut runtime = state.runtime.lock().map_err(|_| "lock")?;
        runtime
            .history
            .act(Action::Resume, clipboard::now())
            .map_err(|e| e.to_string())?;
        runtime.collector.suspend();
    }
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    {
        let runtime = state.runtime.lock().map_err(|_| "lock")?;
        if runtime
            .history
            .snapshot(clipboard::now())
            .map_err(|e| e.to_string())?
            .items
            .iter()
            .any(|i| i.content == "private-smoke-copy")
        {
            return Err("Privacy pause backfilled sensitive content".into());
        }
    }
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}
