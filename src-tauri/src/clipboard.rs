use clipjar_history::{ClipboardValue, Collector, History, Snapshot};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub struct Runtime {
    pub history: History,
    pub collector: Collector,
}
pub struct HistoryState {
    pub runtime: Mutex<Runtime>,
    pub stop: Arc<AtomicBool>,
}
pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
pub fn publish(app: &AppHandle, snapshot: &Snapshot) {
    let _ = app.emit("history-changed", snapshot);
}

pub fn start(app: AppHandle, state: Arc<HistoryState>) {
    std::thread::spawn(move || {
        let mut last_cleanup = 0;
        let mut failed = false;
        while !state.stop.load(Ordering::Relaxed) {
            let result = (|| -> clipjar_history::Result<()> {
                let mut runtime = state.runtime.lock().map_err(|_| "记录服务暂不可用")?;
                let Runtime { history, collector } = &mut *runtime;
                let time = now();
                if let Some(until) = history.pause_until()? {
                    if until > 0 && until <= time {
                        let snapshot = history.act(clipjar_history::Action::Resume, time)?;
                        collector.suspend();
                        publish(&app, &snapshot);
                    }
                }
                if !collector.enabled(history, time)? {
                    return Ok(());
                }
                let value = if let Ok(image) = app.clipboard().read_image() {
                    if u64::from(image.width()) * u64::from(image.height()) > 4096 * 4096 {
                        return Err("图片超过 1600 万像素，本次未记录".into());
                    }
                    ClipboardValue::Image {
                        width: image.width(),
                        height: image.height(),
                        rgba: image.rgba().to_vec(),
                    }
                } else if let Ok(text) = app.clipboard().read_text() {
                    ClipboardValue::Text(text)
                } else {
                    ClipboardValue::Empty
                };
                if collector.observe(history, value, time)? {
                    publish(&app, &history.snapshot(time)?);
                }
                if time - last_cleanup > 60_000 {
                    history.collect_garbage(time)?;
                    last_cleanup = time;
                }
                Ok(())
            })();
            match result {
                Err(_) if !failed => {
                    failed = true;
                    let _ = app.emit(
                        "capture-error",
                        "后台采集暂时失败，请检查磁盘空间或重启应用。",
                    );
                }
                Ok(()) if failed => {
                    failed = false;
                    let _ = app.emit("capture-error", "");
                }
                _ => {}
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}
