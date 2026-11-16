use super::security::{strip_obvious_prompt_injection, validate_public_url};
use super::types::{truncate_text, MAX_PAGE_BYTES, UA};

pub fn clean_text(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Pilih potongan halaman yang paling membantu menjawab query. Model kecil jauh
/// lebih konsisten bila menerima evidence terfokus dibanding awalan halaman.
pub fn relevant_excerpt(text: &str, query: &str, max_chars: usize) -> String {
    let sanitized = strip_obvious_prompt_injection(text);
    let text = sanitized.as_str();
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let terms: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|t| t.chars().count() >= 3)
        .collect();
    let chunks: Vec<&str> = text
        .split(['\n', '\r'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if chunks.len() <= 1 {
        let lower = text.to_ascii_lowercase();
        if let Some(hit) = terms
            .iter()
            .filter_map(|term| lower.find(&term.to_ascii_lowercase()))
            .min()
        {
            let mut start = hit.saturating_sub(max_chars / 3);
            while start > 0 && !text.is_char_boundary(start) {
                start -= 1;
            }
            let mut end = (start + max_chars).min(text.len());
            while end > start && !text.is_char_boundary(end) {
                end -= 1;
            }
            return text[start..end].trim().to_string();
        }
    }
    let mut scored: Vec<(usize, usize, &str)> = chunks
        .iter()
        .enumerate()
        .map(|(index, chunk)| {
            let lower = chunk.to_lowercase();
            let term_score = terms
                .iter()
                .filter(|term| lower.contains(term.as_str()))
                .count()
                * 5;
            let numeric_score = usize::from(chunk.chars().any(|c| c.is_ascii_digit()));
            (term_score + numeric_score, index, *chunk)
        })
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));

    let mut chosen: Vec<(usize, &str)> = Vec::new();
    let mut used = 0usize;
    for (score, index, chunk) in scored {
        if score == 0 && !chosen.is_empty() {
            continue;
        }
        let len = chunk.chars().count() + 1;
        if used + len > max_chars && !chosen.is_empty() {
            continue;
        }
        chosen.push((index, chunk));
        used += len;
        if used >= max_chars {
            break;
        }
    }
    chosen.sort_by_key(|(index, _)| *index);
    truncate_text(
        &chosen
            .into_iter()
            .map(|(_, chunk)| chunk)
            .collect::<Vec<_>>()
            .join("\n"),
        max_chars,
    )
}

/// Baca halaman melalui Jina Reader (r.jina.ai).
/// Sangat tangguh untuk melewati Cloudflare/bot-block dan merender Single Page Application (SPA).
pub async fn fetch_page_via_jina(url: &str) -> Result<String, String> {
    validate_public_url(url)?;
    let jina_url = format!("https://r.jina.ai/{url}");
    let parsed = reqwest::Url::parse(&jina_url).map_err(|e| e.to_string())?;

    let jina_client = reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = jina_client
        .get(parsed)
        .header("X-No-Cache", "true")
        .header("Accept", "text/plain")
        .send()
        .await
        .map_err(|e| format!("Jina Reader gagal: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Jina Reader merespons {}.", response.status()));
    }

    let text = response.text().await.map_err(|e| e.to_string())?;
    let trimmed = text.trim();
    if trimmed.len() < 50 {
        return Err("Halaman tidak berisi teks yang cukup untuk dibaca.".into());
    }

    Ok(truncate_text(trimmed, 12_000))
}

/// Baca halaman secara native tanpa MCP (fallback ringan).
pub async fn fetch_page_text_native(url: &str) -> Result<String, String> {
    let parsed = validate_public_url(url)?;
    let page_client = reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.stop();
            }
            if validate_public_url(attempt.url().as_str()).is_err() {
                return attempt.error("Redirect menuju alamat lokal/private ditolak.");
            }
            attempt.follow()
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let response = match page_client.get(parsed).send().await {
        Ok(r) => r,
        Err(_) => return fetch_page_via_jina(url).await,
    };

    if validate_public_url(response.url().as_str()).is_err() {
        return Err("Redirect menuju alamat tidak valid.".into());
    }
    if !response.status().is_success() {
        return fetch_page_via_jina(url).await;
    }
    if response.content_length().unwrap_or(0) > MAX_PAGE_BYTES as u64 {
        return Err("Halaman terlalu besar untuk dibaca (maksimum 2 MB).".into());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !content_type.is_empty()
        && !content_type.contains("text/")
        && !content_type.contains("html")
        && !content_type.contains("json")
        && !content_type.contains("xml")
    {
        return Err(format!("Tipe konten tidak didukung: {content_type}"));
    }
    let bytes = match response.bytes().await {
        Ok(b) => b,
        Err(_) => return fetch_page_via_jina(url).await,
    };
    if bytes.len() > MAX_PAGE_BYTES {
        return Err("Halaman terlalu besar untuk dibaca (maksimum 2 MB).".into());
    }
    let html = String::from_utf8_lossy(&bytes);

    // Scoped block agar scraper::Html (yang !Send) di-drop sebelum pemanggilan .await di bawahnya
    let joined = {
        let document = scraper::Html::parse_document(&html);
        let content_sel =
            scraper::Selector::parse("title,h1,h2,h3,p,li,pre,code,blockquote,table").unwrap();
        let mut parts: Vec<String> = Vec::new();
        for el in document.select(&content_sel) {
            let text = clean_text(&el.text().collect::<String>());
            if text.len() > 2 {
                parts.push(text);
            }
        }
        parts.join("\n")
    };

    if joined.trim().len() < 80 {
        return fetch_page_via_jina(url).await;
    }
    Ok(truncate_text(&joined, 12_000))
}

