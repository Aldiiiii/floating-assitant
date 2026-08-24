//! Pencarian web untuk Live Context (Fase 6.5).
//! Provider: DuckDuckGo Lite (tanpa key), Brave Search, Tavily.

use serde::{Deserialize, Serialize};
use crate::mcp_client::{self, McpConfig, McpSlot};
use crate::secrets;

#[derive(Clone, Debug, Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                  (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

fn clean_text(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// DuckDuckGo Lite — HTML sederhana tanpa JavaScript, tidak butuh API key.
async fn ddg_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let resp = client()?
        .post("https://html.duckduckgo.com/lite/")
        .form(&[("q", query)])
        .send()
        .await
        .map_err(|e| format!("DuckDuckGo: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("DuckDuckGo merespons {}.", resp.status()));
    }

    let html = resp.text().await.map_err(|e| e.to_string())?;
    let document = scraper::Html::parse_document(&html);
    let link_sel = scraper::Selector::parse("a.result-link").unwrap();
    let snippet_sel = scraper::Selector::parse("td.result-snippet").unwrap();

    let links: Vec<(String, String)> = document
        .select(&link_sel)
        .filter_map(|el| {
            let url = el.value().attr("href")?.to_string();
            let title = clean_text(&el.text().collect::<String>());
            (!title.is_empty()).then_some((title, url))
        })
        .collect();
    let snippets: Vec<String> = document
        .select(&snippet_sel)
        .map(|el| clean_text(&el.text().collect::<String>()))
        .collect();

    let mut results = Vec::new();
    for (i, (title, url)) in links.into_iter().enumerate() {
        // DDG lite kadang membungkus URL lewat redirect /l/?uddg=
        let url = decode_ddg_redirect(&url);
        results.push(SearchResult {
            title,
            url,
            snippet: snippets.get(i).cloned().unwrap_or_default(),
        });
        if results.len() >= 5 {
            break;
        }
    }
    Ok(results)
}

fn decode_ddg_redirect(url: &str) -> String {
    if let Some(pos) = url.find("uddg=") {
        let raw = &url[pos + 5..];
        let end = raw.find('&').unwrap_or(raw.len());
        let encoded = &raw[..end];
        return percent_decode(encoded);
    }
    url.to_string()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(v) => {
                        out.push(v);
                        i += 3;
                    }
                    _ => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            v => {
                out.push(v);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

async fn brave_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let Some(key) = secrets::get("brave-api-key").filter(|k| !k.trim().is_empty()) else {
        return Err(
            "API key Brave belum diisi.

Isi di Pengaturan → Pencarian Web.".into(),
        );
    };
    #[derive(Deserialize)]
    struct BraveResp {
        web: Option<BraveWeb>,
    }
    #[derive(Deserialize)]
    struct BraveWeb {
        results: Vec<BraveItem>,
    }
    #[derive(Deserialize)]
    struct BraveItem {
        title: String,
        url: String,
        #[serde(default)]
        description: String,
    }

    let resp = client()?
        .get("https://api.search.brave.com/res/v1/web/search")
        .query(&[("q", query), ("count", "5")])
        .header("X-Subscription-Token", key)
        .send()
        .await
        .map_err(|e| format!("Brave: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Brave merespons {}.", resp.status()));
    }
    let parsed: BraveResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .web
        .map(|w| {
            w.results
                .into_iter()
                .take(5)
                .map(|r| SearchResult {
                    title: r.title,
                    url: r.url,
                    snippet: clean_text(&r.description),
                })
                .collect()
        })
        .unwrap_or_default())
}

async fn tavily_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let Some(key) = secrets::get("tavily-api-key").filter(|k| !k.trim().is_empty()) else {
        return Err(
            "API key Tavily belum diisi.

Isi di Pengaturan → Pencarian Web.".into(),
        );
    };
    #[derive(Deserialize)]
    struct TavilyResp {
        #[serde(default)]
        results: Vec<TavilyItem>,
    }
    #[derive(Deserialize)]
    struct TavilyItem {
        title: String,
        url: String,
        #[serde(default)]
        content: String,
    }

    let resp = client()?
        .post("https://api.tavily.com/search")
        .json(&serde_json::json!({
            "api_key": key,
            "query": query,
            "max_results": 5,
            "search_depth": "basic"
        }))
        .send()
        .await
        .map_err(|e| format!("Tavily: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Tavily merespons {}.", resp.status()));
    }
    let parsed: TavilyResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(parsed
        .results
        .into_iter()
        .take(5)
        .map(|r| SearchResult {
            title: r.title,
            url: r.url,
            snippet: clean_text(&r.content),
        })
        .collect())
}

#[derive(Clone, Default)]
pub struct SearchContext<'a> {
    pub provider: &'a str,
    pub mcp_index_path: Option<&'a str>,
    pub mcp_node: Option<&'a str>,
    /// Sertakan konten halaman penuh pada deep search MCP.
    pub mcp_full_content: bool,
}

impl<'a> SearchContext<'a> {
    pub fn mcp_config(&self) -> Option<McpConfig> {
        let path = self.mcp_index_path.map(str::trim).filter(|p| !p.is_empty())?;
        Some(McpConfig {
            index_path: path.to_string(),
            node: self
                .mcp_node
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .unwrap_or("node")
                .to_string(),
        })
    }
}

async fn mcp_summaries(
    slot: &McpSlot,
    cfg: &McpConfig,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    mcp_client::acquire(slot, cfg)?;
    let text = mcp_client::with_client(slot, |client| {
        client.call_tool(
            "get-web-search-summaries",
            serde_json::json!({ "query": query, "limit": 5 }),
        )
    })?;
    Ok(parse_mcp_results(&text))
}

pub async fn mcp_deep_search(
    slot: &McpSlot,
    cfg: &McpConfig,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    mcp_client::acquire(slot, cfg)?;
    let text = mcp_client::with_client(slot, |client| {
        client.call_tool(
            "full-web-search",
            serde_json::json!({
                "query": query,
                "limit": 3,
                "includeContent": true
            }),
        )
    })?;

    let mut results = parse_mcp_results(&text);
    // Bila server mengembalikan konten terpisah, gabungkan ke snippet.
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(items) = value.get("results").and_then(serde_json::Value::as_array) {
            results.clear();
            for item in items {
                results.push(SearchResult {
                    title: item.get("title").and_then(serde_json::Value::as_str).unwrap_or("Hasil").to_string(),
                    url: item.get("url").and_then(serde_json::Value::as_str).unwrap_or("").to_string(),
                    snippet: clean_text(
                        item.get("content")
                            .or_else(|| item.get("description"))
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(""),
                    ),
                });
            }
        }
    }
    Ok(results)
}

pub async fn mcp_read_page(
    slot: &McpSlot,
    cfg: &McpConfig,
    url: &str,
) -> Result<String, String> {
    mcp_client::acquire(slot, cfg)?;
    let text = mcp_client::with_client(slot, |client| {
        client.call_tool(
            "get-single-web-page-content",
            serde_json::json!({ "url": url }),
        )
    })?;
    Ok(truncate_text(&text, 12_000))
}

/// Baca halaman secara native tanpa MCP (fallback ringan).
pub async fn fetch_page_text_native(url: &str) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL tidak valid.".into());
    }
    let html = client()?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Gagal membuka halaman: {e}"))?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let document = scraper::Html::parse_document(&html);
    let content_sel =
        scraper::Selector::parse("h1,h2,h3,p,li,pre,code,blockquote").unwrap();
    let mut parts: Vec<String> = Vec::new();
    for el in document.select(&content_sel) {
        let text = clean_text(&el.text().collect::<String>());
        if text.len() > 2 {
            parts.push(text);
        }
    }
    let joined = parts.join("
");
    if joined.trim().is_empty() {
        return Err("Halaman tidak berisi teks yang bisa dibaca.".into());
    }
    Ok(truncate_text(&joined, 12_000))
}

fn truncate_text(s: &str, max_chars: usize) -> String {
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

/// Parser lenien untuk keluaran tools web-search-mcp:
/// coba JSON terstruktur dulu, bila gagal perlakukan seluruh teks sebagai satu hasil.
fn parse_mcp_results(text: &str) -> Vec<SearchResult> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(text) {
        let arr = value
            .get("results")
            .or_else(|| value.get("searchResults"))
            .and_then(serde_json::Value::as_array)
            .cloned()
            .or_else(|| {
                value.as_array().cloned()
            });
        if let Some(items) = arr {
            let parsed: Vec<SearchResult> = items
                .iter()
                .filter_map(|item| {
                    Some(SearchResult {
                        title: item
                            .get("title")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("Hasil")
                            .to_string(),
                        url: item
                            .get("url")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        snippet: clean_text(
                            item.get("snippet")
                                .or_else(|| item.get("description"))
                                .or_else(|| item.get("content"))
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or(""),
                        ),
                    })
                })
                .filter(|r| !r.url.is_empty())
                .collect();
            if !parsed.is_empty() {
                return parsed;
            }
        }
    }
    vec![SearchResult {
        title: "Hasil pencarian".into(),
        url: String::new(),
        snippet: truncate_text(text, 4_000),
    }]
}

/// Coba provider terpilih lalu fallback ke provider lain bila gagal
/// (kecuali yang membutuhkan key namun key kosong).
pub async fn search_with_fallback(
    ctx: &SearchContext<'_>,
    slot: &McpSlot,
    query: &str,
) -> (Vec<SearchResult>, Option<String>) {
    const ORDER: [&str; 3] = ["ddg", "brave", "tavily"];
    let mut last_error: Option<String> = None;

    // Prioritas tertinggi: Web Search MCP lokal bila dikonfigurasi.
    if let Some(cfg) = ctx.mcp_config() {
        match mcp_summaries(slot, &cfg, query).await {
            Ok(results) if !results.is_empty() => return (results, None),
            Ok(_) => {
                last_error = Some("Web Search MCP tidak mengembalikan hasil.".into());
            }
            Err(e) => {
                last_error = Some(e);
            }
        }
    }

    let mut ordered: Vec<&str> = vec![ctx.provider];
    for candidate in ORDER.iter() {
        if *candidate != ctx.provider {
            ordered.push(candidate);
        }
    }

    for name in ordered.into_iter() {
        match search(name, query).await {
            Ok(results) if !results.is_empty() => return (results, None),
            Ok(_) => {
                last_error = Some(format!("Provider {name} tidak mengembalikan hasil."));
            }
            Err(e) => {
                last_error = Some(e);
            }
        }
    }
    (
        Vec::new(),
        Some(last_error.unwrap_or_else(|| "Tidak ada provider pencarian.".into())),
    )
}

/// Jalankan pencarian sesuai provider. Kembali maksimal 5 hasil.
pub async fn search(provider: &str, query: &str) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Err("Query pencarian kosong.".into());
    }
    match provider {
        "brave" => brave_search(query).await,
        "tavily" => tavily_search(query).await,
        _ => ddg_search(query).await,
    }
}
