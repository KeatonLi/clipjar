use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time::interval;
use tauri_plugin_clipboard_manager::ClipboardExt;

pub struct ClipboardManager {
    app_handle: AppHandle,
    last_content: Arc<Mutex<String>>,
}

impl ClipboardManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            last_content: Arc::new(Mutex::new(String::new())),
        }
    }

    pub async fn start_monitoring(&mut self) {
        let mut ticker = interval(Duration::from_millis(800));
        let last_content = self.last_content.clone();
        let app_handle = self.app_handle.clone();

        // 初始化时读取一次剪贴板
        if let Ok(content) = self.read_clipboard_text().await {
            let mut last = last_content.lock().await;
            *last = content;
        }

        loop {
            ticker.tick().await;

            match self.read_clipboard_text().await {
                Ok(content) => {
                    if !content.is_empty() {
                        let mut last = last_content.lock().await;
                        if content != *last {
                            println!("Clipboard changed: {}", &content[..content.len().min(50)]);
                            *last = content.clone();
                            drop(last);

                            // 发送事件到前端
                            let _ = app_handle.emit("clipboard-change", serde_json::json!({
                                "content": content,
                                "timestamp": chrono::Utc::now().timestamp_millis()
                            }));
                        }
                    }
                }
                Err(e) => {
                    // 静默处理错误，避免频繁报错
                    if !e.contains("empty") {
                        eprintln!("Clipboard read error: {}", e);
                    }
                }
            }
        }
    }

    async fn read_clipboard_text(&self) -> Result<String, String> {
        let app_handle = self.app_handle.clone();

        // 使用 spawn_blocking 来执行同步的剪贴板操作
        let result = tokio::task::spawn_blocking(move || {
            app_handle.clipboard().read_text()
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?;

        result.map_err(|e| format!("Clipboard error: {}", e))
    }
}

// 剪贴板写入命令
#[tauri::command]
pub async fn write_clipboard_text(
    app_handle: AppHandle,
    text: String,
) -> Result<(), String> {
    app_handle
        .clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())
}
