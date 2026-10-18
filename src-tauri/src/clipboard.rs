//! Clipboard access runs outside the UI thread and continues while the window is hidden.
use crate::history::{decode_image, image_fingerprint, text_fingerprint, HistoryManager, Snapshot};
use std::{sync::{Arc, Mutex}, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub const HISTORY_EVENT: &str = "clipboard-history-changed";
pub type SharedHistory = Arc<Mutex<HistoryManager>>;

pub fn emit_snapshot(app: &AppHandle, snapshot: Snapshot) {
    let _ = app.emit(HISTORY_EVENT, snapshot);
}

/// Persist mutations before notifying the frontend. Polling and copy-back share
/// this mutex, so a copied item cannot race into a second history entry.
pub async fn mutate<T, F>(app: AppHandle, state: SharedHistory, action: F) -> Result<T, String>
where T: Send + 'static, F: FnOnce(&mut HistoryManager) -> Result<T, String> + Send + 'static {
    tauri::async_runtime::spawn_blocking(move || {
        let mut manager = state.lock().map_err(|_| "历史记录服务暂时不可用".to_string())?;
        let result = action(&mut manager);
        if let Err(error) = &result { manager.last_error = Some(error.clone()); }
        let snapshot = manager.snapshot();
        emit_snapshot(&app, snapshot);
        result
    }).await.map_err(|e| e.to_string())?
}

pub async fn read<T, F>(state: SharedHistory, action: F) -> Result<T, String>
where T: Send + 'static, F: FnOnce(&HistoryManager) -> Result<T, String> + Send + 'static {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = state.lock().map_err(|_| "历史记录服务暂时不可用".to_string())?;
        action(&manager)
    }).await.map_err(|e| e.to_string())?
}

pub async fn copy_item(app: AppHandle, state: SharedHistory, id: i64) -> Result<(), String> {
    let clipboard_app = app.clone();
    mutate(app, state, move |manager| {
        let (item, mut fingerprint, png) = manager.item_for_copy(id)?;
        if let Some(png) = png {
            let (width, height, rgba) = decode_image(&png)?;
            let image = tauri::image::Image::new_owned(rgba, width, height);
            clipboard_app.clipboard().write_image(&image).map_err(|e| e.to_string())?;
            // Some platforms normalize transparent pixels on copy. Suppress the
            // actual OS representation as well as preserving the stored original.
            if let Ok(observed) = clipboard_app.clipboard().read_image() {
                fingerprint = image_fingerprint(observed.width(), observed.height(), observed.rgba());
            }
        } else {
            clipboard_app.clipboard().write_text(item.content).map_err(|e| e.to_string())?;
        }
        // Copy succeeded. A failed optional use counter is a storage warning.
        if let Err(error) = manager.record_copy(id, fingerprint) { manager.last_error = Some(error); }
        Ok(())
    }).await
}

pub async fn write_text(app: AppHandle, state: SharedHistory, text: String) -> Result<(), String> {
    let clipboard_app = app.clone();
    mutate(app, state, move |manager| {
        clipboard_app.clipboard().write_text(text.clone()).map_err(|e| e.to_string())?;
        manager.last_fingerprint = Some(text_fingerprint(&text));
        Ok(())
    }).await
}

pub async fn write_image(app: AppHandle, state: SharedHistory, data: Vec<u8>) -> Result<(), String> {
    let clipboard_app = app.clone();
    mutate(app, state, move |manager| {
        let (width, height, rgba) = decode_image(&data)?;
        let mut fingerprint = image_fingerprint(width, height, &rgba);
        clipboard_app.clipboard().write_image(&tauri::image::Image::new_owned(rgba, width, height)).map_err(|e| e.to_string())?;
        if let Ok(observed) = clipboard_app.clipboard().read_image() {
            fingerprint = image_fingerprint(observed.width(), observed.height(), observed.rgba());
        }
        manager.last_fingerprint = Some(fingerprint);
        Ok(())
    }).await
}

pub fn start_polling(app: AppHandle, state: SharedHistory) {
    std::thread::spawn(move || {
        let mut last_cleanup = Instant::now();
        let mut was_paused = false;
        loop {
            std::thread::sleep(Duration::from_millis(700));
            {
                let Ok(mut manager) = state.lock() else { break; };
                // Complete legacy import before native collection starts.
                if !manager.ready() { continue; }
                let paused = manager.is_paused();
                let mut changed = paused != was_paused;
                was_paused = paused;
                if last_cleanup.elapsed() >= Duration::from_secs(300) {
                    match manager.cleanup() {
                        Ok(cleaned) => changed |= cleaned,
                        Err(error) => { changed |= manager.last_error.as_ref() != Some(&error); manager.last_error = Some(error); }
                    }
                    last_cleanup = Instant::now();
                }
                if !paused {
                    // Prefer the real image over any text fallback offered with it.
                    // The plugin warns reads can deadlock on Linux's main thread.
                    let result = if let Ok(image) = app.clipboard().read_image() {
                        let fingerprint = image_fingerprint(image.width(), image.height(), image.rgba());
                        let result = if manager.ignore_resume_sample(&fingerprint) { Ok(None) }
                            else { manager.add_image(image.width(), image.height(), image.rgba()) };
                        if result.is_err() { manager.last_fingerprint = Some(fingerprint); }
                        Some(result)
                    } else if let Ok(text) = app.clipboard().read_text() {
                        if text.trim().is_empty() {
                            manager.ignore_resume_sample(&text_fingerprint(&text));
                            manager.last_fingerprint = None;
                            None
                        }
                        else {
                            let fingerprint = text_fingerprint(&text);
                            let result = if manager.ignore_resume_sample(&fingerprint) { Ok(None) }
                                else { manager.add_text(text, None) };
                            if result.is_err() { manager.last_fingerprint = Some(fingerprint); }
                            Some(result)
                        }
                    } else { None };
                    match result {
                        Some(Ok(item)) => changed |= item.is_some(),
                        Some(Err(error)) => { changed |= manager.last_error.as_ref() != Some(&error); manager.last_error = Some(error); }
                        None => {}
                    }
                }
                // Keep emitting ordered with mutations through the same mutex.
                if changed { emit_snapshot(&app, manager.snapshot()); }
            }
        }
    });
}
