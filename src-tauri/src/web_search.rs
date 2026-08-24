//! Pencarian web untuk Live Context (Fase 6.5).
//! Provider: DuckDuckGo Lite (tanpa key), Brave Search, Tavily.

use serde::{Deserialize, Serialize};

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

async fn brave_search(query: &str, key: &str) -> Result<Vec<SearchResult>, String> {
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

async fn tavily_search(query: &str, key: &str) -> Result<Vec<SearchResult>, String> {
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

/// Coba provider terpilih lalu fallback ke provider lain bila gagal
/// (kecuali yang membutuhkan key namun key kosong).
pub async fn search_with_fallback(
    provider: &str,
    api_key: Option<&str>,
    query: &str,
) -> (Vec<SearchResult>, Option<String>) {
    const ORDER: [&str; 3] = ["ddg", "brave", "tavily"];
    let mut last_error: Option<String> = None;

    let mut ordered: Vec<&str> = vec![provider];
    for candidate in ORDER.iter() {
        if *candidate != provider {
            ordered.push(candidate);
        }
    }

    for name in ordered.into_iter() {
        let needs_key = name != "ddg";
        if needs_key && api_key.map(str::trim).filter(|k| !k.is_empty()).is_none() {
            last_error = Some(format!(
                "Provider {name} butuh API key (belum diisi di Pengaturan)."
            ));
            continue;
        }
        match search(name, api_key, query).await {
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
pub async fn search(
    provider: &str,
    api_key: Option<&str>,
    query: &str,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Err("Query pencarian kosong.".into());
    }
    match provider {
        "brave" => {
            let key = api_key.filter(|k| !k.trim().is_empty()).ok_or(
                "API key Brave belum diisi.\n\nIsi di Pengaturan → Pencarian Web.",
            )?;
            brave_search(query, key.trim()).await
        }
        "tavily" => {
            let key = api_key.filter(|k| !k.trim().is_empty()).ok_or(
                "API key Tavily belum diisi.\n\nIsi di Pengaturan → Pencarian Web.",
            )?;
            tavily_search(query, key.trim()).await
        }
        _ => ddg_search(query).await,
    }
}
