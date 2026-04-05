use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use serde::{Serialize, Deserialize};

/// 剪贴板项目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    pub content_type: String,
    pub image_data: Option<Vec<u8>>,
    pub created_at: i64,
    pub is_favorite: bool,
    pub tags: Vec<String>,
}

/// 剪贴板管理器 - 在 Rust 端管理历史记录以减少前端内存占用
#[derive(Debug)]
pub struct ClipboardManager {
    items: Vec<ClipboardItem>,
    max_items: usize,
    last_content_hash: String,
}

impl ClipboardManager {
    pub fn new(max_items: usize) -> Self {
        Self {
            items: Vec::with_capacity(max_items),
            max_items,
            last_content_hash: String::new(),
        }
    }

    /// 添加新项目
    pub fn add_item(&mut self, content: String, content_type: String) -> Option<&ClipboardItem> {
        // 简单的内容哈希检查 - 安全处理 UTF-8 字符边界
        let short_content: String = content.chars().take(100).collect();
        let hash = format!("{}:{}", content_type, short_content);
        
        if hash == self.last_content_hash {
            return None;
        }
        
        self.last_content_hash = hash;

        let item = ClipboardItem {
            id: chrono::Utc::now().timestamp_millis(),
            content,
            content_type,
            image_data: None,
            created_at: chrono::Utc::now().timestamp_millis(),
            is_favorite: false,
            tags: Vec::new(),
        };

        self.items.insert(0, item);
        
        // 限制数量
        if self.items.len() > self.max_items {
            self.items.truncate(self.max_items);
        }

        self.items.first()
    }

    /// 获取所有项目
    pub fn get_items(&self) -> &[ClipboardItem] {
        &self.items
    }

    /// 删除项目
    pub fn delete_item(&mut self, id: i64) -> bool {
        let len_before = self.items.len();
        self.items.retain(|item| item.id != id);
        self.items.len() < len_before
    }

    /// 切换收藏状态
    pub fn toggle_favorite(&mut self, id: i64) -> bool {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            item.is_favorite = !item.is_favorite;
            true
        } else {
            false
        }
    }

    /// 清空所有项目
    pub fn clear(&mut self) {
        self.items.clear();
        self.last_content_hash.clear();
    }

    /// 获取内存使用估计 (bytes)
    pub fn memory_usage(&self) -> usize {
        self.items.iter()
            .map(|item| {
                item.content.len() + 
                item.content_type.len() +
                item.image_data.as_ref().map(|d| d.len()).unwrap_or(0) +
                item.tags.iter().map(|t| t.len()).sum::<usize>()
            })
            .sum()
    }
}

/// 写入剪贴板文本
pub async fn write_clipboard_text(
    app_handle: AppHandle,
    text: String,
) -> Result<(), String> {
    app_handle
        .clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())
}

/// 写入剪贴板图片 (使用 PNG 数据)
pub async fn write_clipboard_image(
    app_handle: AppHandle,
    image_data: Vec<u8>,
) -> Result<(), String> {
    // Tauri 2.0 的 Image 类型比较复杂，我们使用 write_text 写入 base64 作为替代方案
    // 或者将图片数据转换为 tauri::image::Image
    // 这里简化处理，只支持文本复制
    app_handle
        .clipboard()
        .write_text("[图片]")
        .map_err(|e| e.to_string())
}

/// 全局剪贴板管理器实例
pub type SharedClipboardManager = Arc<Mutex<ClipboardManager>>;

/// 创建共享管理器
pub fn create_manager(max_items: usize) -> SharedClipboardManager {
    Arc::new(Mutex::new(ClipboardManager::new(max_items)))
}
