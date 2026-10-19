#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod clipboard;
mod smoke;
use clipboard::{HistoryState, Runtime};
use clipjar_history::{Action, Collector, History, Snapshot};
use std::sync::{atomic::AtomicBool, Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_clipboard_manager::ClipboardExt;

type SharedHistory = Arc<HistoryState>;

#[tauri::command]
fn initialize_history(
    app: tauri::AppHandle,
    state: State<'_, SharedHistory>,
    legacy: Option<String>,
    shortcut: Option<String>,
) -> Result<Snapshot, String> {
    let mut runtime = state.runtime.lock().map_err(|_| "记录服务暂不可用")?;
    let snapshot = runtime
        .history
        .initialize(legacy.as_deref(), shortcut.as_deref(), clipboard::now())
        .map_err(|_| "旧记录迁移失败。原始数据和备份均已保留，请勿清除应用数据，修复后重试。")?;
    clipboard::publish(&app, &snapshot);
    Ok(snapshot)
}
#[tauri::command]
fn history_snapshot(state: State<'_, SharedHistory>) -> Result<Snapshot, String> {
    state
        .runtime
        .lock()
        .map_err(|_| "记录服务暂不可用")?
        .history
        .snapshot(clipboard::now())
        .map_err(|_| "无法读取本地记录".into())
}
#[tauri::command]
fn history_action(
    app: tauri::AppHandle,
    state: State<'_, SharedHistory>,
    action: Action,
) -> Result<Snapshot, String> {
    let mut runtime = state.runtime.lock().map_err(|_| "记录服务暂不可用")?;
    let suspend = matches!(&action, Action::Pause { .. } | Action::Resume);
    let snapshot = runtime
        .history
        .act(action, clipboard::now())
        .map_err(|error| error.to_string())?;
    if suspend {
        runtime.collector.suspend();
    }
    clipboard::publish(&app, &snapshot);
    Ok(snapshot)
}
#[tauri::command]
fn copy_history_item(
    app: tauri::AppHandle,
    state: State<'_, SharedHistory>,
    id: f64,
) -> Result<Snapshot, String> {
    let mut runtime = state.runtime.lock().map_err(|_| "记录服务暂不可用")?;
    let item = runtime
        .history
        .snapshot(clipboard::now())
        .map_err(|_| "无法读取记录")?
        .items
        .into_iter()
        .find(|item| item.id == id)
        .ok_or("记录已不存在")?;
    if item.content_type == "image" {
        let pixels = runtime
            .history
            .image_pixels(id)
            .map_err(|_| "图片数据不可用，请重新复制原图")?;
        app.clipboard()
            .write_image(&tauri::image::Image::new_owned(
                pixels.as_raw().to_vec(),
                pixels.width(),
                pixels.height(),
            ))
            .map_err(|_| "系统剪贴板暂不可用，请重试")?;
    } else {
        app.clipboard()
            .write_text(&item.content)
            .map_err(|_| "系统剪贴板暂不可用，请重试")?;
    }
    let snapshot = runtime
        .history
        .act(Action::Use { id }, clipboard::now())
        .map_err(|_| "已复制，但使用记录未能保存")?;
    clipboard::publish(&app, &snapshot);
    Ok(snapshot)
}
fn main() {
    let mut context = tauri::generate_context!();
    if std::env::var_os("CLIPJAR_SMOKE_TEST").is_some() {
        let root = std::path::PathBuf::from(
            std::env::var("CLIPJAR_TEST_DATA_DIR")
                .expect("Smoke test requires an isolated data directory"),
        );
        for window in &mut context.config_mut().app.windows {
            window.incognito = true;
            window.data_directory = Some(root.join("webview"));
        }
    }
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"].into()),
        ))
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            initialize_history,
            history_snapshot,
            history_action,
            copy_history_item
        ])
        .setup(|app| {
            let testing = std::env::var_os("CLIPJAR_SMOKE_TEST").is_some();
            let root = if testing {
                std::path::PathBuf::from(std::env::var("CLIPJAR_TEST_DATA_DIR")?)
            } else {
                app.path().app_data_dir()?
            };
            let image_root = root.join("images");
            let history =
                History::open(root).map_err(|error| std::io::Error::other(error.to_string()))?;
            let mut collector = Collector::default();
            if history.pause_until().unwrap_or(None).is_some() {
                collector.suspend();
            }
            let state = Arc::new(HistoryState {
                runtime: Mutex::new(Runtime { history, collector }),
                stop: Arc::new(AtomicBool::new(false)),
            });
            app.manage(state.clone());
            if testing {
                app.asset_protocol_scope()
                    .allow_directory(image_root, false)?;
            }
            clipboard::start(app.handle().clone(), state.clone());
            // 创建系统托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示 ClipJar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // 创建系统托盘
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
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
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键点击托盘图标 - 显示并聚焦窗口
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
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

            if testing {
                smoke::start(app.handle().clone(), state);
            }
            Ok(())
        })
        .build(context)
        .expect("ClipJar failed to start");
    app.run(|app, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            app.state::<SharedHistory>()
                .stop
                .store(true, std::sync::atomic::Ordering::Relaxed);
        }
    });
}
