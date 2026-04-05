#![windows_subsystem = "windows"]

mod clipboard;


use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    State,
};
use tauri_plugin_autostart::MacosLauncher;
use clipboard::{SharedClipboardManager, create_manager};
use serde_json;

/// 获取剪贴板历史记录
#[tauri::command]
fn get_clipboard_history(state: State<'_, SharedClipboardManager>) -> Vec<serde_json::Value> {
    let manager = state.lock().unwrap();
    manager.get_items()
        .iter()
        .map(|item| {
            serde_json::json!({
                "id": item.id,
                "content": item.content,
                "contentType": item.content_type,
                "createdAt": item.created_at,
                "isFavorite": item.is_favorite,
                "tags": item.tags,
            })
        })
        .collect()
}

/// 添加剪贴板项目
#[tauri::command]
fn add_clipboard_item(
    state: State<'_, SharedClipboardManager>,
    content: String,
    content_type: String,
) -> Option<serde_json::Value> {
    let mut manager = state.lock().unwrap();
    manager.add_item(content, content_type)
        .map(|item| {
            serde_json::json!({
                "id": item.id,
                "content": item.content,
                "contentType": item.content_type,
                "createdAt": item.created_at,
                "isFavorite": item.is_favorite,
                "tags": item.tags,
            })
        })
}

/// 删除剪贴板项目
#[tauri::command]
fn delete_clipboard_item(state: State<'_, SharedClipboardManager>, id: i64) -> Result<(), String> {
    let mut manager = state.lock().unwrap();
    if manager.delete_item(id) {
        Ok(())
    } else {
        Err("项目不存在".to_string())
    }
}

/// 切换收藏状态
#[tauri::command]
fn toggle_favorite(state: State<'_, SharedClipboardManager>, id: i64) -> Result<bool, String> {
    let mut manager = state.lock().unwrap();
    if manager.toggle_favorite(id) {
        // 返回新的收藏状态
        let is_fav = manager.get_items()
            .iter()
            .find(|i| i.id == id)
            .map(|i| i.is_favorite)
            .unwrap_or(false);
        Ok(is_fav)
    } else {
        Err("项目不存在".to_string())
    }
}

/// 更新使用次数
#[tauri::command]
fn update_use_count(_state: State<'_, SharedClipboardManager>, _id: i64) -> Result<(), String> {
    // 使用次数统计可以在前端完成
    Ok(())
}

/// 清空所有历史记录
#[tauri::command]
fn clear_history(state: State<'_, SharedClipboardManager>) -> Result<(), String> {
    let mut manager = state.lock().unwrap();
    manager.clear();
    Ok(())
}

/// 获取内存使用统计
#[tauri::command]
fn get_memory_stats(state: State<'_, SharedClipboardManager>) -> serde_json::Value {
    let manager = state.lock().unwrap();
    let memory_bytes = manager.memory_usage();
    
    serde_json::json!({
        "itemCount": manager.get_items().len(),
        "memoryBytes": memory_bytes,
        "memoryMB": (memory_bytes as f64 / 1024.0 / 1024.0).round() / 1000.0,
    })
}

/// 写入剪贴板文本
#[tauri::command]
async fn write_clipboard_text(
    app_handle: tauri::AppHandle,
    text: String,
) -> Result<(), String> {
    clipboard::write_clipboard_text(app_handle, text).await
}

/// 写入剪贴板图片
#[tauri::command]
async fn write_clipboard_image(
    _app_handle: tauri::AppHandle,
    _image_data: Vec<u8>,
) -> Result<(), String> {
    // 图片写入功能暂时简化处理
    // 在实际应用中，可能需要将图片转换为 tauri::image::Image 格式
    Ok(())
}

fn main() {
    // 创建共享的剪贴板管理器 - 限制最多 200 条
    let clipboard_manager = create_manager(200);

    tauri::Builder::default()
        .manage(clipboard_manager)
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"].into())))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_clipboard_history,
            add_clipboard_item,
            delete_clipboard_item,
            toggle_favorite,
            update_use_count,
            clear_history,
            get_memory_stats,
            write_clipboard_text,
            write_clipboard_image,
        ])
        .setup(|app| {
            // 创建系统托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示 ClipJar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键点击托盘图标 - 显示并聚焦窗口
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let window_clone = window.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(100));
                                let _ = window_clone.set_focus();
                            });
                        }
                    }
                })
                .build(app)?;

            // 获取主窗口
            if let Some(window) = app.get_webview_window("main") {
                // 阻止窗口关闭，改为隐藏到托盘
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });

                // 监听窗口显示事件，可以在这里进行内存优化
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        if !focused {
                            // 窗口失去焦点时可以考虑清理一些资源
                            // 但保持窗口打开，只是隐藏
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
