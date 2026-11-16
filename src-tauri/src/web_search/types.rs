use serde::Serialize;
use crate::mcp_client::McpConfig;

#[derive(Clone, Debug, Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Clone, Default)]
pub struct SearchContext<'a> {
    pub provider: &'a str,
    pub mcp_index_path: Option<&'a str>,
    pub mcp_node: Option<&'a str>,
}

impl<'a> SearchContext<'a> {
    pub fn mcp_config(&self) -> Option<McpConfig> {
        let path = self.mcp_index_path?.trim();
        if path.is_empty() || !std::path::Path::new(path).exists() {
            return None;
        }
        Some(McpConfig {
            index_path: path.to_string(),
            node: self
                .mcp_node
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("node")
                .to_string(),
        })
    }
}

pub const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                      (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
pub const MAX_PAGE_BYTES: usize = 2 * 1024 * 1024;

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

pub fn truncate_text(s: &str, max_chars: usize) -> String {
    if s.len() <= max_chars {
        s.to_string()
    } else {
        let mut end = max_chars;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

