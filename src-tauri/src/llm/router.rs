use chrono::Local;
use super::tools::ModelTool;
use super::types::ChatMessage;

pub fn last_user_text(messages: &[ChatMessage]) -> String {
    let Some(message) = messages.iter().rev().find(|m| m.role == "user") else {
        return String::new();
    };
    match &message.content {
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Array(parts) => parts
            .iter()
            .filter(|p| p.get("type").and_then(serde_json::Value::as_str) == Some("text"))
            .filter_map(|p| p.get("text").and_then(serde_json::Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

pub fn clean_search_query(raw: &str) -> String {
    let mut s = raw.trim();
    let prefixes = [
        "tolong carikan informasi dan berita terbaru mengenai",
        "tolong carikan informasi dan berita terbaru tentang",
        "tolong carikan informasi dan berita mengenai",
        "tolong carikan informasi dan berita tentang",
        "tolong carikan informasi dan berita",
        "tolong carikan berita terbaru mengenai",
        "tolong carikan berita terbaru tentang",
        "cari informasi dan berita terbaru mengenai",
        "cari informasi dan berita terbaru tentang",
        "cari informasi dan berita mengenai",
        "cari informasi dan berita tentang",
        "cari informasi dan berita",
        "cari informasi terbaru mengenai",
        "cari informasi terbaru tentang",
        "cari informasi mengenai",
        "cari informasi tentang",
        "cari informasi",
        "cari berita terbaru mengenai",
        "cari berita terbaru tentang",
        "cari berita mengenai",
        "cari berita tentang",
        "cari berita",
        "tolong cari di web tentang",
        "tolong cari di web",
        "tolong carikan info tentang",
        "tolong carikan informasi tentang",
        "tolong carikan berita tentang",
        "tolong carikan tentang",
        "tolong carikan",
        "tolong cari info tentang",
        "tolong cari tentang",
        "tolong cari",
        "coba cari di web tentang",
        "coba cari di web",
        "coba cari info tentang",
        "coba carikan tentang",
        "coba carikan",
        "coba cari",
        "cari di web tentang",
        "cari di web",
        "cari web tentang",
        "cari web",
        "cari info tentang",
        "cari tentang",
        "cari mengenai",
        "cari",
        "carikan info tentang",
        "carikan informasi tentang",
        "carikan berita tentang",
        "carikan tentang",
        "carikan",
        "cari info tentang",
        "cari tentang",
        "search the web for",
        "search web for",
        "search for",
        "search web",
        "browsing tentang",
        "browsing",
        "browse for",
    ];

    let mut changed = true;
    while changed {
        changed = false;
        let lower = s.to_lowercase();
        for prefix in &prefixes {
            if lower.starts_with(prefix) {
                s = s[prefix.len()..].trim();
                changed = true;
                break;
            }
        }
    }

    let cleaned: String = s
        .chars()
        .map(|c| if c == '\'' || c == '"' || c == '`' { ' ' } else { c })
        .collect();

    let normalized = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalized.is_empty() {
        raw.trim().to_string()
    } else {
        normalized
    }
}

/// Rules cover obvious realtime requests before consulting a small model. This
/// avoids spending one generation just to produce a fragile JSON tool call.
pub fn deterministic_route(messages: &[ChatMessage]) -> Option<ModelTool> {
    let original = last_user_text(messages);
    let text = original.to_lowercase();
    let clean_query = clean_search_query(&original);
    let current = [
        "saat ini",
        "sekarang",
        "hari ini",
        "terbaru",
        "terkini",
        "aktual",
        "latest",
        "baru-baru ini",
        "baru baru ini",
        "belakangan ini",
        "akhir-akhir ini",
        "akhir akhir ini",
        "terupdate",
        "ter-update",
        "up to date",
        "uptodate",
        "update",
        "paling baru",
    ]
    .iter()
    .any(|needle| text.contains(needle));
    let explicit_web = [
        "cari di web",
        "cari web",
        "browsing",
        "browse",
        "search web",
    ]
    .iter()
    .any(|needle| text.contains(needle));
    let currency = [
        "kurs",
        "nilai tukar",
        "usd",
        "idr",
        "dolar",
        "rupiah",
        "eur",
        "euro",
        "gbp",
        "pound",
        "jpy",
        "yen",
        "sgd",
    ]
    .iter()
    .any(|needle| text.contains(needle));
    if currency && (current || text.contains("berapa")) {
        let (base, quote) = detect_currency_pair(&text);
        return Some(ModelTool::CurrencyRate { base, quote });
    }
    if text.contains("berita") && current {
        return Some(ModelTool::NewsSearch {
            query: clean_query,
            limit: requested_result_count(&text).unwrap_or(5),
        });
    }
    if [
        "apa kabar hari ini",
        "bagaimana kabarmu hari ini",
        "gimana kabarmu hari ini",
    ]
    .iter()
    .any(|greeting| text.contains(greeting))
    {
        return None;
    }
    // Pertanyaan mengenai kebaruan / update data Astra sendiri dialihkan ke LocalTime
    let self_update_inquiry = [
        "informasimu",
        "datamu",
        "pengetahuanmu",
        "kamu terupdate",
        "kamu update",
        "kamu up to date",
        "kamu uptodate",
        "apakah kamu update",
        "apakah kamu terupdate",
        "apakah kamu up to date",
        "apakah informasimu",
        "apakah datamu",
        "apakah pengetahuanmu",
        "sudah yang terupdate",
        "sudah terupdate",
    ]
    .iter()
    .any(|needle| text.contains(needle));
    if self_update_inquiry {
        return Some(ModelTool::LocalTime);
    }
    let recent_event_request = current
        && [
            "informasi",
            "kejadian",
            "terjadi",
            "kabar",
            "kasus",
            "peristiwa",
            "situasi",
            "kondisi",
        ]
        .iter()
        .any(|needle| text.contains(needle));
    if recent_event_request {
        return Some(ModelTool::DeepSearch {
            query: format!("{clean_query} {}", Local::now().format("%Y-%m-%d")),
        });
    }
    let current_public_fact = current
        && [
            "libur",
            "tanggal merah",
            "cuti",
            "hari raya",
            "aturan",
            "peraturan",
            "kebijakan",
            "pengumuman",
            "status layanan",
            "operasional",
            "buka",
            "tutup",
        ]
        .iter()
        .any(|needle| text.contains(needle));
    if current_public_fact {
        return Some(ModelTool::DeepSearch {
            query: precise_current_query(&clean_query),
        });
    }
    let needs_current_web = [
        "cuaca", "berita", "harga", "jadwal", "skor", "rilis", "versi",
    ]
    .iter()
    .any(|needle| text.contains(needle));
    if explicit_web || (current && needs_current_web) {
        return Some(ModelTool::DeepSearch { query: clean_query });
    }
    if ["jam berapa", "tanggal berapa", "waktu sekarang"]
        .iter()
        .any(|needle| text.contains(needle))
    {
        return Some(ModelTool::LocalTime);
    }
    for prefix in ["hitung ", "kalkulasi ", "calculate "] {
        if let Some(expression) = text.strip_prefix(prefix) {
            if !expression.is_empty()
                && expression
                    .chars()
                    .all(|c| c.is_ascii_digit() || "+-*/()., %".contains(c))
            {
                return Some(ModelTool::Calculator {
                    expression: expression.replace(',', "."),
                });
            }
        }
    }
    None
}

pub fn local_date_indonesian() -> String {
    use chrono::Datelike;
    const MONTHS: [&str; 12] = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
    ];
    let now = Local::now();
    format!(
        "{} {} {}",
        now.day(),
        MONTHS[now.month0() as usize],
        now.year()
    )
}

pub fn precise_current_query(request: &str) -> String {
    let lower = request.to_lowercase();
    let locale = if ["libur", "tanggal merah", "cuti", "hari raya", "skb"]
        .iter()
        .any(|needle| lower.contains(needle))
    {
        " Indonesia"
    } else {
        ""
    };
    format!("{request} {}{locale}", local_date_indonesian())
}

pub fn requires_authoritative_sources(request: &str) -> bool {
    let text = request.to_lowercase();
    [
        "libur",
        "tanggal merah",
        "cuti",
        "hari raya",
        "aturan",
        "peraturan",
        "undang-undang",
        "kebijakan",
        "pengumuman",
        "pemerintah",
        "resmi",
        "pajak",
        "izin",
        "status layanan",
    ]
    .iter()
    .any(|needle| text.contains(needle))
}

pub fn supplemental_search_query(query: &str, request: &str) -> String {
    if requires_authoritative_sources(request) {
        format!("{query} sumber resmi site:go.id")
    } else if let Some(en) = crate::web_search::build_cross_lingual_query(request) {
        en
    } else if let Some(en) = crate::web_search::build_cross_lingual_query(query) {
        en
    } else {
        format!("{query} berita informasi terkini")
    }
}

pub fn temporal_system_context() -> String {
    format!(
        "Konteks waktu sistem: sekarang {} (waktu lokal perangkat). Untuk permintaan terbaru/terkini, gunakan tanggal ini dan jangan menebak tahun dari pengetahuan model.\n\
         Aturan semantik & pencarian:\n\
         - Dalam konteks AI, komputasi, software, library, dan model: 'lokal' berarti on-device/offline/self-hosted (bukan geografis Indonesia).\n\
         - Untuk pencarian teknis, library, open-source, atau riset komunitas (Reddit, Hacker News, GitHub, dsb.), susun kata kunci pencarian (query) dalam bahasa Inggris teknis tanpa kata 'Indonesia' kecuali diminta eksplisit.\n\
         - Untuk isu geopolitik, militer, hubungan internasional, skenario konflik, atau analisis risiko: selalu sertakan semua entitas utama (pihak terkait, aksi, dan target). Contoh: 'skenario serangan nuklir AS ke Iran' atau 'US nuclear strike Iran scenario analysis'. JANGAN PERNAH menyederhanakan query menjadi hanya nama satu negara saja (seperti hanya 'Amerika' atau 'USA').\n\
         - Formulasi Query Tool: Saat memanggil tool web_search/deep_search, HANYA susun 2-6 kata kunci pencarian inti (keywords). JANGAN PERNAH menyertakan kata ganti atau obrolan seperti 'saya', 'kamu', 'menurutmu', 'apakah', 'kenapa'. Contoh: jika pengguna bertanya perbandingan model, cari 'llama 3.1 8b vs qwen 2.5 9b benchmark', BUKAN kata 'saya'.\n\
         - Kapabilitas pembaruan (update): Anda memiliki akses internet & alat bantu (tool) waktu lokal secara real-time. Jika pengguna bertanya apakah informasi/data Anda terupdate, jelaskan secara ramah bahwa meskipun pengetahuan dasar bawaan model memiliki batas tanggal pelatihan, Anda memiliki akses penelusuran web waktu nyata (real-time) dan waktu perangkat lokal untuk menyajikan informasi yang selalu terkini.",
        Local::now().format("%Y-%m-%d %H:%M:%S %:z")
    )
}

pub fn normalize_current_query(query: &str, user_request: &str) -> String {
    let request = user_request.to_lowercase();
    let asks_current = [
        "saat ini",
        "sekarang",
        "hari ini",
        "terbaru",
        "terkini",
        "aktual",
        "latest",
        "baru-baru ini",
        "baru baru ini",
        "belakangan ini",
        "akhir-akhir ini",
        "akhir akhir ini",
        "terupdate",
        "ter-update",
        "up to date",
        "uptodate",
        "update",
        "paling baru",
    ]
    .iter()
    .any(|marker| request.contains(marker));
    if !asks_current {
        return query.to_string();
    }

    let current_year = Local::now().format("%Y").to_string();
    let mut normalized = query.to_string();
    let mut user_specified_year = false;
    for year in 2000..=2100 {
        let year = year.to_string();
        if user_request.contains(&year) {
            user_specified_year = true;
        } else if normalized.contains(&year) {
            normalized = normalized.replace(&year, &current_year);
        }
    }
    if !user_specified_year && !normalized.contains(&current_year) {
        normalized.push(' ');
        normalized.push_str(&current_year);
    }
    normalized
}

pub fn sanitize_technical_query(query: &str, user_request: &str) -> String {
    let req_lower = user_request.to_lowercase();
    let user_mentions_indonesia = [
        "indonesia",
        "tanah air",
        "dalam negeri",
        "di indonesia",
    ]
    .iter()
    .any(|marker| req_lower.contains(marker));

    if user_mentions_indonesia {
        return query.to_string();
    }

    let q_lower = query.to_lowercase();
    let is_technical = [
        "stt",
        "tts",
        "llm",
        "ai",
        "whisper",
        "speech",
        "voice",
        "model",
        "library",
        "framework",
        "open-source",
        "open source",
        "reddit",
        "hacker news",
        "hackernews",
        "hn",
        "github",
    ]
    .iter()
    .any(|marker| req_lower.contains(marker) || q_lower.contains(marker));

    if !is_technical {
        return query.to_string();
    }

    let tokens: Vec<&str> = query.split_whitespace().collect();
    let mut cleaned_tokens = Vec::with_capacity(tokens.len());
    let mut i = 0;
    while i < tokens.len() {
        let t = tokens[i];
        let lower = t.to_lowercase();
        let stripped = lower.trim_matches(|c: char| !c.is_alphanumeric());

        if (stripped == "lokal" || stripped == "local") && i + 1 < tokens.len() {
            let next_stripped = tokens[i + 1]
                .to_lowercase()
                .trim_matches(|c: char| !c.is_alphanumeric())
                .to_string();
            if next_stripped == "indonesia" {
                cleaned_tokens.push("local");
                cleaned_tokens.push("offline");
                i += 2;
                continue;
            }
        }
        if stripped == "indonesia" {
            i += 1;
            continue;
        }
        if stripped == "lokal" {
            cleaned_tokens.push("local");
            i += 1;
            continue;
        }
        cleaned_tokens.push(t);
        i += 1;
    }
    cleaned_tokens.join(" ")
}

pub fn is_pure_country_or_conjunction(tokens: &[&str]) -> bool {
    const COUNTRIES_AND_CONJUNCTIONS: &[&str] = &[
        "amerika", "usa", "us", "as", "indonesia", "indo", "ri",
        "rusia", "russia", "china", "tiongkok", "iran", "israel",
        "ukraina", "ukraine", "jepang", "japan", "korea", "inggris", "uk",
        "atau", "dan", "vs", "versus", "negara",
    ];
    !tokens.is_empty() && tokens.iter().all(|t| {
        let clean = t.trim_matches(|c: char| !c.is_alphanumeric());
        clean.is_empty() || COUNTRIES_AND_CONJUNCTIONS.contains(&clean)
    })
}

pub fn guard_search_query(query: &str, user_request: &str) -> String {
    let q = query.trim();
    let user_cleaned = clean_search_query(user_request);
    if q.is_empty() {
        return user_cleaned;
    }
    let lower = q.to_lowercase();
    let conversational_words = [
        "saya", "aku", "gue", "gw", "kamu", "anda", "menurut", "menurutmu",
        "tolong", "coba", "bisakah", "bisa", "apakah", "kenapa", "mengapa",
        "gimana", "bagaimana", "apa", "maksud", "arti", "better", "mana",
        "bagus", "bagusan", "rekomendasi", "pilih", "pakai", "gunakan",
    ];
    let tokens: Vec<&str> = lower.split_whitespace().collect();
    let only_stop_words = tokens.iter().all(|t| {
        let stripped = t.trim_matches(|c: char| !c.is_alphanumeric());
        stripped.is_empty() || conversational_words.contains(&stripped)
    });

    let user_meaningful: Vec<String> = user_cleaned
        .split_whitespace()
        .map(|t| t.to_lowercase().trim_matches(|c: char| !c.is_alphanumeric()).to_string())
        .filter(|t| !t.is_empty() && !conversational_words.contains(&t.as_str()) && t.len() >= 2)
        .collect();

    // Jika model hanya menghasilkan stop words, kueri terlalu pendek (< 4 char),
    // atau model hanya menghasilkan nama negara terisolasi padahal pertanyaan memuat topik substantif:
    if only_stop_words || q.len() < 4 || (is_pure_country_or_conjunction(&tokens) && user_meaningful.len() > tokens.len()) {
        if !user_meaningful.is_empty() {
            return user_meaningful.join(" ");
        }
        return user_cleaned;
    }

    // Jika user request memuat topik krusial (misal 'nuklir', 'perang', 'krisis', 'skenario') tapi model
    // menghilangkannya sama sekali dari query:
    let critical_topics = [
        "nuklir", "nuclear", "bom", "bomb", "rudal", "missile", "skenario", "scenario",
        "serangan", "strike", "perang", "war", "krisis", "crisis", "bencana", "disaster",
        "gempa", "tsunami", "sanksi", "sanction", "pemilu", "election", "presiden", "president",
    ];
    let mut missing_critical = Vec::new();
    for word in &user_meaningful {
        if critical_topics.contains(&word.as_str()) && !lower.contains(word.as_str()) && !missing_critical.contains(word) {
            missing_critical.push(word.clone());
        }
    }
    if !missing_critical.is_empty() {
        return format!("{q} {}", missing_critical.join(" "));
    }

    q.to_string()
}

pub fn normalize_tool_time(tool: ModelTool, user_request: &str) -> ModelTool {
    let normalize = |q: &str| {
        let guarded = guard_search_query(q, user_request);
        let cleaned = clean_search_query(&guarded);
        let sanitized = sanitize_technical_query(&cleaned, user_request);
        normalize_current_query(&sanitized, user_request)
    };
    match tool {
        ModelTool::WebSearch { query } => ModelTool::WebSearch {
            query: normalize(&query),
        },
        ModelTool::DeepSearch { query } => ModelTool::DeepSearch {
            query: normalize(&query),
        },
        ModelTool::NewsSearch { query, limit } => ModelTool::NewsSearch {
            query: normalize(&query),
            limit,
        },
        other => other,
    }
}

pub fn requested_result_count(text: &str) -> Option<usize> {
    text.split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<usize>().ok())
        .find(|value| (1..=10).contains(value))
}

pub fn detect_currency_pair(text: &str) -> (String, String) {
    let aliases = [
        ("USD", ["usd", "dolar", "dollar"].as_slice()),
        ("IDR", ["idr", "rupiah"].as_slice()),
        ("EUR", ["eur", "euro"].as_slice()),
        ("GBP", ["gbp", "pound"].as_slice()),
        ("JPY", ["jpy", "yen"].as_slice()),
        ("SGD", ["sgd", "dolar singapura"].as_slice()),
    ];
    let mut found: Vec<(usize, &str)> = aliases
        .iter()
        .filter_map(|(code, names)| {
            names
                .iter()
                .filter_map(|name| text.find(name))
                .min()
                .map(|pos| (pos, *code))
        })
        .collect();
    found.sort_by_key(|(pos, _)| *pos);
    found.dedup_by_key(|(_, code)| *code);
    let base = found.first().map(|(_, code)| *code).unwrap_or("USD");
    let quote = found
        .iter()
        .skip(1)
        .map(|(_, code)| *code)
        .find(|code| *code != base)
        .unwrap_or(if base == "IDR" { "USD" } else { "IDR" });
    (base.into(), quote.into())
}

