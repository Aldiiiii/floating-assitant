use chrono::{Datelike, Local};
use serde::Deserialize;

use crate::mcp_client::{self, McpConfig, McpSlot};
use crate::secrets;

use super::extractor::{clean_text, fetch_page_via_jina};
use super::security::validate_public_url;
use super::types::{client, truncate_text, SearchContext, SearchResult, UA};

#[derive(Deserialize, Debug)]
pub struct CurrencyRateResponse {
    pub date: String,
    pub base: String,
    pub quote: String,
    pub rate: f64,
}

pub fn normalize_currency_code(code: &str) -> Result<String, String> {
    let code = code.trim().to_ascii_uppercase();
    if code.len() == 3 && code.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        Ok(code)
    } else {
        Err("Kode mata uang harus berupa tiga huruf ISO, misalnya USD atau IDR.".into())
    }
}

pub fn parse_currency_rate_response(text: &str) -> Result<CurrencyRateResponse, String> {
    let response: CurrencyRateResponse =
        serde_json::from_str(text).map_err(|e| format!("Format data kurs tidak valid: {e}"))?;
    if !response.rate.is_finite() || response.rate <= 0.0 {
        return Err("Provider mengembalikan angka kurs yang tidak valid.".into());
    }
    Ok(response)
}

pub fn display_rate(rate: f64) -> String {
    if rate >= 100.0 {
        format!("{rate:.2}")
    } else if rate >= 1.0 {
        format!("{rate:.4}")
    } else {
        format!("{rate:.6}")
    }
}

/// Ambil kurs dalam bentuk JSON terstruktur. Ini lebih andal daripada
/// mengekstrak angka dari halaman hasil pencarian yang dinamis/anti-bot.
pub async fn fetch_currency_rate(base: &str, quote: &str) -> Result<SearchResult, String> {
    let base = normalize_currency_code(base)?;
    let quote = normalize_currency_code(quote)?;
    if base == quote {
        return Ok(SearchResult {
            title: format!("Kurs identitas {base}/{quote}"),
            url: String::new(),
            snippet: format!("1 {base} = 1 {quote}."),
        });
    }

    let url = format!("https://api.frankfurter.dev/v2/rate/{base}/{quote}");
    let response = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Provider kurs terstruktur gagal dihubungi: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Provider kurs terstruktur merespons {}.",
            response.status()
        ));
    }
    let body = response.text().await.map_err(|e| e.to_string())?;
    let rate = parse_currency_rate_response(&body)?;
    if rate.base != base || rate.quote != quote {
        return Err("Pasangan mata uang dari provider tidak sesuai permintaan.".into());
    }

    Ok(SearchResult {
        title: format!("Frankfurter reference rate ({base}/{quote})"),
        url,
        snippet: format!(
            "1 {base} = {} {quote}. Tanggal data: {}. Jenis: kurs referensi agregat; bukan kurs jual atau kurs beli bank.",
            display_rate(rate.rate),
            rate.date
        ),
    })
}

pub fn xml_field(item: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = item.find(&open)? + open.len();
    let end = item[start..].find(&close)? + start;
    let raw = &item[start..end];
    let without_cdata = if let Some(inner) = raw.strip_prefix("<![CDATA[").and_then(|s| s.strip_suffix("]]>")) {
        inner
    } else {
        raw
    };
    let unescaped = without_cdata
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    Some(clean_text(&unescaped))
}

pub fn parse_news_rss(xml: &str, limit: usize) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let mut cursor = 0;
    while let Some(start) = xml[cursor..].find("<item>") {
        let item_start = cursor + start + "<item>".len();
        let Some(item_end_rel) = xml[item_start..].find("</item>") else {
            break;
        };
        let item_end = item_start + item_end_rel;
        let item = &xml[item_start..item_end];
        cursor = item_end + "</item>".len();

        let Some(title) = xml_field(item, "title") else {
            continue;
        };
        let Some(raw_url) = xml_field(item, "link") else {
            continue;
        };
        let url = decode_news_redirect(&raw_url);
        let pub_date = xml_field(item, "pubDate");
        let description = xml_field(item, "description").unwrap_or_default();
        let desc_clean = scraper::Html::parse_fragment(&description)
            .root_element()
            .text()
            .collect::<Vec<_>>()
            .join(" ");
        let desc_clean = clean_text(&desc_clean);
        let snippet = match pub_date {
            Some(date) if !desc_clean.is_empty() => format!("{date} — {desc_clean}"),
            Some(date) => date,
            None => desc_clean,
        };
        if title.is_empty() || url.is_empty() {
            continue;
        }
        results.push(SearchResult { title, url, snippet });
        if results.len() >= limit {
            break;
        }
    }
    results
}

pub fn decode_news_redirect(url: &str) -> String {
    if let Some(pos) = url.find("url=") {
        let raw = &url[pos + 4..];
        let end = raw.find('&').unwrap_or(raw.len());
        let encoded = &raw[..end];
        let decoded = percent_decode(encoded);
        if decoded.starts_with("http://") || decoded.starts_with("https://") {
            return decoded;
        }
    }
    decode_bing_url(url)
}

pub fn news_subject_terms(query: &str) -> Vec<String> {
    const NEWS_STOPWORDS: [&str; 14] = [
        "ada", "berita", "terbaru", "terkini", "hari", "ini", "apa", "di",
        "seputar", "mengenai", "tentang", "tampilkan", "carikan", "cari",
    ];
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|t| t.chars().count() >= 3)
        .filter(|t| !NEWS_STOPWORDS.contains(&t.as_str()))
        .collect()
}

pub fn current_date_indonesian() -> String {
    const MONTHS: [&str; 12] = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
        "Agustus", "September", "Oktober", "November", "Desember",
    ];
    let now = Local::now();
    format!(
        "{} {} {}",
        now.day(),
        MONTHS[now.month0() as usize],
        now.year()
    )
}

/// Feed Bing News menghasilkan satu evidence per artikel, tidak seperti web
/// search biasa yang sering mengembalikan halaman kategori sebuah portal.
pub async fn search_news(query: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
    let limit = limit.clamp(1, 10);

    // Coba SearXNG news terlebih dahulu bila tersedia
    if let Ok(searxng_news) = searxng_news_search(query).await {
        if !searxng_news.is_empty() {
            return Ok(searxng_news.into_iter().take(limit).collect());
        }
    }

    let terms = news_subject_terms(query);
    let subject = if terms.is_empty() {
        "Indonesia".to_string()
    } else {
        terms.join(" ")
    };
    let queries = [
        format!("{subject} {}", current_date_indonesian()),
        format!("{subject} berita hari ini -tag -indeks"),
    ];
    let news_client = client()?;
    let requests = queries.into_iter().map(|news_query| {
        let client = news_client.clone();
        async move {
            let url = reqwest::Url::parse_with_params(
                "https://www.bing.com/news/search",
                &[
                    ("q", news_query.as_str()),
                    ("format", "rss"),
                    ("mkt", "id-ID"),
                    ("setlang", "id-ID"),
                ],
            )
            .map_err(|e| e.to_string())?;
            let response = client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("Feed berita gagal dihubungi: {e}"))?;
            if !response.status().is_success() {
                return Err(format!("Feed berita merespons {}.", response.status()));
            }
            response.text().await.map_err(|e| e.to_string())
        }
    });

    let mut results = Vec::new();
    let mut last_error = None;
    for response in futures_util::future::join_all(requests).await {
        let xml = match response {
            Ok(xml) => xml,
            Err(error) => {
                last_error = Some(error);
                continue;
            }
        };
        for item in parse_news_rss(&xml, 30) {
            let searchable = item.title.to_lowercase();
            if !terms.is_empty() && !terms.iter().any(|term| searchable.contains(term)) {
                continue;
            }
            if results.iter().any(|existing: &SearchResult| {
                existing.url == item.url || existing.title.eq_ignore_ascii_case(&item.title)
            }) {
                continue;
            }
            results.push(item);
            if results.len() >= limit {
                break;
            }
        }
        if results.len() >= limit {
            break;
        }
    }
    if results.is_empty() {
        Err(last_error.unwrap_or_else(|| "Feed berita tidak mengembalikan artikel.".into()))
    } else {
        Ok(results)
    }
}

/// DuckDuckGo Lite — HTML sederhana tanpa JavaScript, tidak butuh API key.
pub async fn ddg_search(query: &str) -> Result<Vec<SearchResult>, String> {
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

pub fn decode_ddg_redirect(url: &str) -> String {
    if let Some(pos) = url.find("uddg=") {
        let raw = &url[pos + 5..];
        let end = raw.find('&').unwrap_or(raw.len());
        let encoded = &raw[..end];
        return percent_decode(encoded);
    }
    url.to_string()
}

pub fn percent_decode(s: &str) -> String {
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

pub fn decode_bing_url(url: &str) -> String {
    if let Some(pos) = url.find("u=a1") {
        let after = &url[pos + 4..];
        let end = after.find('&').unwrap_or(after.len());
        let raw = &after[..end];

        use base64::Engine;
        let mut b64 = raw.replace('-', "+").replace('_', "/");
        while b64.len() % 4 != 0 {
            b64.push('=');
        }

        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&b64) {
            if let Ok(decoded_str) = String::from_utf8(bytes) {
                if decoded_str.starts_with("http://") || decoded_str.starts_with("https://") {
                    return decoded_str;
                }
            }
        }
    }
    url.to_string()
}

/// Bing Web Search — Gratis tanpa API key, lancar diakses di Indonesia (bebas blokir Kominfo).
pub async fn bing_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let url = reqwest::Url::parse_with_params(
        "https://www.bing.com/search",
        &[
            ("q", query),
            ("mkt", "id-ID"),
            ("setlang", "id-ID"),
        ],
    )
    .map_err(|e| e.to_string())?;

    let resp = client()?
        .get(url)
        .header("Accept-Language", "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7")
        .send()
        .await
        .map_err(|e| format!("Bing Search: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Bing Search merespons {}.", resp.status()));
    }

    let html = resp.text().await.map_err(|e| e.to_string())?;
    let document = scraper::Html::parse_document(&html);
    let item_sel = scraper::Selector::parse("li.b_algo").map_err(|e| format!("{e:?}"))?;
    let title_sel = scraper::Selector::parse("h2 a").map_err(|e| format!("{e:?}"))?;
    let snippet_sel = scraper::Selector::parse("p").map_err(|e| format!("{e:?}"))?;

    let mut results = Vec::new();
    for item in document.select(&item_sel) {
        let Some(title_el) = item.select(&title_sel).next() else {
            continue;
        };
        let Some(raw_url) = title_el.value().attr("href") else {
            continue;
        };
        let title = clean_text(&title_el.text().collect::<String>());
        if title.is_empty() {
            continue;
        }

        let snippet = item
            .select(&snippet_sel)
            .next()
            .map(|p| clean_text(&p.text().collect::<String>()))
            .unwrap_or_else(|| {
                let full = clean_text(&item.text().collect::<String>());
                full.strip_prefix(&title).map(clean_text).unwrap_or(full)
            });

        let clean_url = decode_bing_url(raw_url);
        results.push(SearchResult {
            title,
            url: clean_url,
            snippet,
        });

        if results.len() >= 5 {
            break;
        }
    }

    if results.is_empty() {
        return Err("Bing tidak menemukan hasil pencarian.".into());
    }

    Ok(results)
}

pub async fn brave_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let Some(key) = secrets::get("brave-api-key").filter(|k| !k.trim().is_empty()) else {
        return Err("API key Brave belum diisi.\n\nIsi di Pengaturan → Pencarian Web.".into());
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

pub async fn tavily_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let Some(key) = secrets::get("tavily-api-key").filter(|k| !k.trim().is_empty()) else {
        return Err("API key Tavily belum diisi.\n\nIsi di Pengaturan → Pencarian Web.".into());
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

#[derive(Deserialize, Debug)]
pub struct SearxngResponse {
    #[serde(default)]
    pub results: Vec<SearxngResultItem>,
}

#[derive(Deserialize, Debug)]
pub struct SearxngResultItem {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
}

pub async fn searxng_search_custom(base_url: &str, query: &str) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Err("Query pencarian kosong.".into());
    }
    let base = if base_url.trim().is_empty() {
        "http://localhost:8080"
    } else {
        base_url.trim().trim_end_matches('/')
    };

    let search_url = format!("{base}/search");
    let page_client = reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = page_client
        .get(&search_url)
        .query(&[
            ("q", query),
            ("format", "json"),
            ("categories", "general,news"),
            ("language", "auto"),
        ])
        .send()
        .await
        .map_err(|e| format!("SearXNG gagal dihubungi ({base}): {e}"))?;

    if !response.status().is_success() {
        return Err(format!("SearXNG ({base}) merespons {}.", response.status()));
    }

    let parsed: SearxngResponse = response
        .json()
        .await
        .map_err(|e| format!("Gagal mem-parsing JSON dari SearXNG ({base}): {e}"))?;

    let mut results = Vec::new();
    for item in parsed.results {
        let title = item.title.unwrap_or_default().trim().to_string();
        let url = item.url.unwrap_or_default().trim().to_string();
        let snippet = item.content.unwrap_or_default().trim().to_string();

        if !title.is_empty() && !url.is_empty() && !url.starts_with('/') {
            results.push(SearchResult {
                title,
                url,
                snippet: clean_text(&snippet),
            });
        }
        if results.len() >= 8 {
            break;
        }
    }

    if results.is_empty() {
        return Err(format!("SearXNG ({base}) tidak mengembalikan hasil pencarian."));
    }

    Ok(results)
}

pub async fn searxng_search(query: &str) -> Result<Vec<SearchResult>, String> {
    let custom_url = secrets::get("searxng-url").unwrap_or_default();
    searxng_search_custom(&custom_url, query).await
}

pub async fn searxng_news_search(query: &str) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Err("Query pencarian berita kosong.".into());
    }
    let custom_url = secrets::get("searxng-url").unwrap_or_default();
    let base = if custom_url.trim().is_empty() {
        "http://localhost:8080"
    } else {
        custom_url.trim().trim_end_matches('/')
    };

    let search_url = format!("{base}/search");
    let page_client = reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let response = page_client
        .get(&search_url)
        .query(&[
            ("q", query),
            ("format", "json"),
            ("categories", "news"),
            ("language", "auto"),
        ])
        .send()
        .await
        .map_err(|e| format!("SearXNG news gagal dihubungi ({base}): {e}"))?;

    if !response.status().is_success() {
        return Err(format!("SearXNG news ({base}) merespons {}.", response.status()));
    }

    let parsed: SearxngResponse = response
        .json()
        .await
        .map_err(|e| format!("Gagal mem-parsing JSON berita dari SearXNG ({base}): {e}"))?;

    let mut results = Vec::new();
    for item in parsed.results {
        let title = item.title.unwrap_or_default().trim().to_string();
        let url = item.url.unwrap_or_default().trim().to_string();
        let snippet = item.content.unwrap_or_default().trim().to_string();

        if !title.is_empty() && !url.is_empty() && !url.starts_with('/') {
            results.push(SearchResult {
                title,
                url,
                snippet: clean_text(&snippet),
            });
        }
        if results.len() >= 10 {
            break;
        }
    }

    if results.is_empty() {
        return Err(format!("SearXNG ({base}) tidak mengembalikan artikel berita."));
    }

    Ok(results)
}

pub fn parse_mcp_results(text: &str) -> Vec<SearchResult> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(text) {
        let arr = value
            .get("results")
            .or_else(|| value.get("searchResults"))
            .and_then(serde_json::Value::as_array)
            .cloned()
            .or_else(|| value.as_array().cloned());
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
                        url: decode_bing_url(
                            item.get("url")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or(""),
                        ),
                        snippet: mcp_item_text(item),
                    })
                })
                .filter(|r| !r.url.is_empty())
                .collect();
            if !parsed.is_empty() {
                return parsed;
            }
        }
    }
    let legacy = parse_legacy_mcp_results(text);
    if !legacy.is_empty() {
        return legacy;
    }
    vec![SearchResult {
        title: "Hasil pencarian".into(),
        url: String::new(),
        snippet: truncate_text(text, 4_000),
    }]
}

pub fn parse_legacy_mcp_results(text: &str) -> Vec<SearchResult> {
    text.replace("\r\n", "\n")
        .split("\n---")
        .filter_map(|section| {
            let mut title = String::new();
            let mut url = String::new();
            let mut snippet_parts = Vec::new();
            let mut collecting_content = false;

            for line in section.lines().map(str::trim) {
                if title.is_empty() && line.starts_with("**") && line.ends_with("**") {
                    let inner = line.trim_matches('*');
                    if let Some((number, candidate)) = inner.split_once(". ") {
                        if number.chars().all(|c| c.is_ascii_digit()) {
                            title = candidate.trim().to_string();
                            continue;
                        }
                    }
                }
                if let Some(value) = line.strip_prefix("URL:") {
                    url = value.trim().to_string();
                    continue;
                }
                if let Some(value) = line.strip_prefix("Description:") {
                    if !value.trim().is_empty() {
                        snippet_parts.push(value.trim().to_string());
                    }
                    continue;
                }
                if matches!(line, "**Full Content:**" | "**Content Preview:**") {
                    collecting_content = true;
                    continue;
                }
                if line.starts_with("**Content Extraction Failed:**") {
                    collecting_content = false;
                    continue;
                }
                if collecting_content && !line.is_empty() {
                    snippet_parts.push(line.to_string());
                }
            }

            (!title.is_empty() && !url.is_empty()).then(|| SearchResult {
                title,
                url: decode_bing_url(&url),
                snippet: truncate_text(&snippet_parts.join("\n"), 12_000),
            })
        })
        .collect()
}

pub fn mcp_item_text(item: &serde_json::Value) -> String {
    let description = item
        .get("snippet")
        .or_else(|| item.get("description"))
        .and_then(serde_json::Value::as_str)
        .map(clean_text)
        .unwrap_or_default();
    if let Some(content) = item
        .get("fullContent")
        .or_else(|| item.get("content"))
        .or_else(|| item.get("contentPreview"))
        .and_then(serde_json::Value::as_str)
        .filter(|text| !text.trim().is_empty())
    {
        let content = content.trim();
        return if description.is_empty() || content.contains(description.as_str()) {
            content.to_string()
        } else {
            format!("Ringkasan pencarian: {description}\nKonten halaman:\n{content}")
        };
    }
    description
}

pub async fn mcp_summaries(
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
    full_content: bool,
) -> Result<Vec<SearchResult>, String> {
    mcp_search_with_limit(
        slot,
        cfg,
        query,
        full_content,
        if full_content { 3 } else { 5 },
    )
    .await
}

pub async fn mcp_search_with_limit(
    slot: &McpSlot,
    cfg: &McpConfig,
    query: &str,
    full_content: bool,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    mcp_client::acquire(slot, cfg)?;
    let limit = limit.clamp(1, 10);
    let text = mcp_client::with_client(slot, |client| {
        client.call_tool(
            "full-web-search",
            serde_json::json!({
                "query": query,
                "limit": limit,
                "includeContent": full_content
            }),
        )
    })?;

    let mut results = parse_mcp_results(&text);
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(items) = value.get("results").and_then(serde_json::Value::as_array) {
            results.clear();
            for item in items {
                results.push(SearchResult {
                    title: item
                        .get("title")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("Hasil")
                        .to_string(),
                    url: decode_bing_url(
                        item.get("url")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or(""),
                    ),
                    snippet: mcp_item_text(item),
                });
            }
        }
    }
    Ok(results)
}

pub async fn mcp_read_page(slot: &McpSlot, cfg: &McpConfig, url: &str) -> Result<String, String> {
    validate_public_url(url)?;
    mcp_client::acquire(slot, cfg)?;
    let call_res = mcp_client::with_client(slot, |client| {
        client.call_tool(
            "get-single-web-page-content",
            serde_json::json!({ "url": url }),
        )
    });

    let text = match call_res {
        Ok(t) => t,
        Err(_) => return fetch_page_via_jina(url).await,
    };

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(content) = value.get("content").and_then(serde_json::Value::as_str) {
            let trimmed = content.trim();
            if trimmed.len() >= 80 {
                return Ok(truncate_text(trimmed, 12_000));
            }
        }
    }
    let trimmed = text.trim();
    if trimmed.len() >= 80
        && !trimmed.contains("**Word Count:** 0")
        && !trimmed.contains("**Content Length:** 0 characters")
        && !trimmed.contains("Content Extraction Failed")
    {
        return Ok(truncate_text(trimmed, 12_000));
    }

    fetch_page_via_jina(url).await
}

/// Coba provider terpilih lalu fallback ke provider lain bila gagal
pub async fn search_with_fallback(
    ctx: &SearchContext<'_>,
    slot: &McpSlot,
    query: &str,
) -> (Vec<SearchResult>, Option<String>) {
    const ORDER: [&str; 5] = ["searxng", "bing", "ddg", "brave", "tavily"];
    let mut last_error: Option<String> = None;

    let prefer_custom = ctx.provider != "bing" && ctx.provider != "mcp";
    if prefer_custom {
        match search(ctx.provider, query).await {
            Ok(results) if !results.is_empty() => return (results, None),
            Ok(_) => {
                last_error = Some(format!("Provider {} tidak mengembalikan hasil.", ctx.provider));
            }
            Err(e) => {
                last_error = Some(e);
            }
        }
    }

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
        if name == "brave"
            && secrets::get("brave-api-key")
                .map(|k| k.trim().is_empty())
                .unwrap_or(true)
            && ctx.provider != "brave"
        {
            continue;
        }
        if name == "tavily"
            && secrets::get("tavily-api-key")
                .map(|k| k.trim().is_empty())
                .unwrap_or(true)
            && ctx.provider != "tavily"
        {
            continue;
        }
        if name == "searxng"
            && ctx.provider != "searxng"
            && ctx.provider != "google"
            && secrets::get("searxng-url").map(|u| u.trim().is_empty()).unwrap_or(true)
        {
            continue;
        }

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
        Some(last_error.unwrap_or_else(|| "Tidak ada provider pencarian yang berhasil.".into())),
    )
}

/// Jalankan pencarian sesuai provider. Kembali maksimal 5 hasil.
pub async fn search(provider: &str, query: &str) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Err("Query pencarian kosong.".into());
    }
    match provider {
        "searxng" => searxng_search(query).await,
        "google" => match searxng_search(query).await {
            Ok(results) if !results.is_empty() => Ok(results),
            _ => bing_search(query).await,
        },
        "bing" => bing_search(query).await,
        "brave" => brave_search(query).await,
        "tavily" => tavily_search(query).await,
        "ddg" => ddg_search(query).await,
        _ => bing_search(query).await,
    }
}

