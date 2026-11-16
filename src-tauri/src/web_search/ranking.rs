use super::types::SearchResult;

/// Klasifikasi sumber yang dapat dipahami model kecil dan UI diagnostik.
/// Ini adalah heuristic kualitas, bukan jaminan bahwa isi sumber benar.
pub fn source_tier(url: &str) -> &'static str {
    let domain = source_domain(url);
    if domain.ends_with(".go.id")
        || domain.ends_with(".gov")
        || domain.contains(".gov.")
        || domain.ends_with(".mil")
    {
        "official"
    } else if domain.ends_with(".ac.id") || domain.ends_with(".edu") || domain.contains(".edu.") {
        "primary"
    } else {
        "secondary"
    }
}

pub fn source_domain(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_ascii_lowercase))
        .map(|host| host.strip_prefix("www.").unwrap_or(&host).to_string())
        .unwrap_or_default()
}

pub fn ranking_terms(query: &str) -> Vec<String> {
    const STOP_WORDS: [&str; 31] = [
        "ada",
        "adalah",
        "aku",
        "apa",
        "apakah",
        "bagaimana",
        "berapa",
        "buat",
        "dari",
        "di",
        "hari",
        "ini",
        "itu",
        "kenapa",
        "mana",
        "minta",
        "pada",
        "saat",
        "saya",
        "sekarang",
        "terbaru",
        "terkini",
        "tolong",
        "untuk",
        "yang",
        "the",
        "what",
        "when",
        "where",
        "why",
        "today",
    ];
    let mut terms = query
        .split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|term| term.chars().count() >= 3)
        .filter(|term| !STOP_WORDS.contains(&term.as_str()))
        .collect::<Vec<_>>();
    terms.sort();
    terms.dedup();
    terms
}

pub fn is_non_article_domain(domain: &str) -> bool {
    let d = domain.to_lowercase();
    d.contains("youtube.com")
        || d.contains("youtu.be")
        || d.contains("tiktok.com")
        || d.contains("instagram.com")
        || d.contains("facebook.com")
        || d.contains("twitter.com")
        || d.contains("x.com")
        || d.contains("pinterest.com")
        || d.contains("canva.com")
}

/// Terjemahkan kueri penelusuran bahasa Indonesia ke padanan bahasa Inggris
/// untuk isu global, geopolitik, sains, bencana, atau teknologi.
/// Mengembalikan `None` jika kueri murni administratif lokal Indonesia atau tidak memiliki kata kunci relevan.
pub fn build_cross_lingual_query(query: &str) -> Option<String> {
    let q_lower = query.to_lowercase();

    let is_strictly_local = [
        "ktp", "sim", "bpjs", "bansos", "kelurahan", "kecamatan", "dukcapil",
        "polres", "polda", "kemensos", "dki jakarta", "jawa barat", "jawa timur",
        "jawa tengah", "rtrw", "rt/rw", "pilkada", "bumn", "bri", "bca", "mandiri",
        "pancasila", "uud 1945", "kemendagri", "kemenkes", "prabowo", "gibran", "jokowi",
    ]
    .iter()
    .any(|marker| q_lower.contains(marker));
    if is_strictly_local {
        return None;
    }

    let translations: &[(&str, &str)] = &[
        ("negara-negara", "countries"),
        ("negara", "countries"),
        ("ancaman", "threat"),
        ("darurat", "emergency"),
        ("siaga", "preparedness alert"),
        ("peringatan", "warning alert"),
        ("krisis", "crisis"),
        ("pangan", "food supplies"),
        ("bahan makanan", "food supplies"),
        ("makanan", "food"),
        ("sembako", "groceries supplies"),
        ("obat-obatan", "medicine supplies"),
        ("obat", "medicine"),
        ("air bersih", "clean water"),
        ("air", "water"),
        ("menyetok", "stockpile"),
        ("menyentok", "stockpile"),
        ("stok", "stockpile"),
        ("timbun", "stockpile"),
        ("cadangan", "supplies reserve"),
        ("menyuruh", "urge advise"),
        ("mengimbau", "urge advise"),
        ("imbau", "urge advise"),
        ("meminta", "request urge"),
        ("minta", "urge"),
        ("warganya", "citizens residents"),
        ("warga", "citizens"),
        ("masyarakat", "public"),
        ("pemerintah", "government"),
        ("kebijakan", "policy"),
        ("aturan", "regulation rule"),
        ("perang", "war conflict"),
        ("senjata", "weapons"),
        ("nuklir", "nuclear"),
        ("skenario", "scenario"),
        ("serangan", "strike attack"),
        ("menyerang", "strike attack"),
        ("melesatkan", "launch strike"),
        ("meluncurkan", "launch strike"),
        ("rudal", "missile"),
        ("bom", "bomb strike"),
        ("dampak", "impact consequences"),
        ("akibat", "consequences"),
        ("konflik", "conflict war"),
        ("militer", "military"),
        ("pertahanan", "defense"),
        ("sanksi", "sanctions"),
        ("hubungan", "relations"),
        ("diplomasi", "diplomacy"),
        ("amerika serikat", "US United States"),
        ("amerika", "US United States"),
        ("usa", "US United States"),
        ("as", "US"),
        ("iran", "Iran"),
        ("israel", "Israel"),
        ("rusia", "Russia"),
        ("tiongkok", "China"),
        ("china", "China"),
        ("taiwan", "Taiwan"),
        ("korea utara", "North Korea"),
        ("korea selatan", "South Korea"),
        ("timur tengah", "Middle East"),
        ("bencana", "disaster"),
        ("gempa", "earthquake"),
        ("tsunami", "tsunami"),
        ("iklim", "climate"),
        ("cuaca", "weather"),
        ("ekstrem", "extreme"),
        ("pemilu", "election"),
        ("presiden", "president"),
        ("penyadapan", "wiretapping illegal surveillance"),
        ("kronologinya", "chronology"),
        ("kronologi", "chronology"),
        ("tersangkanya", "suspects"),
        ("tersangka", "suspects"),
        ("terbaru", "latest 2026"),
        ("terkini", "latest 2026"),
        ("hari ini", "today 2026"),
        ("tahun ini", "2026"),
        ("dunia", "global world"),
        ("global", "global"),
        ("internasional", "international"),
        ("luar negeri", "foreign"),
        ("energi", "energy"),
        ("minyak", "oil"),
        ("gas", "gas"),
        ("listrik", "power electricity"),
        ("ekonomi", "economy"),
        ("inflasi", "inflation"),
    ];

    let mut matched_en_terms = Vec::new();
    let mut matched_any = false;
    let mut remaining = q_lower;

    for &(id_term, en_term) in translations {
        if remaining.contains(id_term) {
            matched_en_terms.push(en_term);
            matched_any = true;
            remaining = remaining.replace(id_term, " ");
        }
    }

    if !matched_any {
        return None;
    }

    let id_stopwords: &[&str] = &[
        "dan", "di", "ke", "dari", "yang", "untuk", "pada", "adalah", "ini", "itu",
        "atau", "dengan", "karena", "agar", "supaya", "juga", "bisa", "dapat", "ada",
        "tentang", "mengenai", "terkait", "info", "informasi", "berita", "tolong",
        "carikan", "cari", "tahu", "cek", "bagaimana", "apa", "siapa", "mengapa",
        "kenapa", "kapan", "dimana", "beberapa", "sebenarnya", "baru-baru", "nanti",
        "soal", "coba", "kamu", "saya",
    ];

    let mut preserved_tokens = Vec::new();
    for token in remaining.split_whitespace() {
        let clean = token.trim_matches(|c: char| !c.is_alphanumeric());
        let trimmed_suffix = clean.strip_suffix("nya").unwrap_or(clean);
        if trimmed_suffix.len() >= 2 && !id_stopwords.contains(&trimmed_suffix) {
            preserved_tokens.push(trimmed_suffix.to_string());
        }
    }

    let mut combined_en = Vec::new();
    combined_en.extend(matched_en_terms.iter().map(|s| s.to_string()));
    combined_en.extend(preserved_tokens);

    let en_query = combined_en.join(" ");
    let cleaned_en = en_query.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned_en.is_empty() {
        None
    } else {
        Some(cleaned_en)
    }
}

pub fn source_score(result: &SearchResult, terms: &[String], original_index: usize) -> i32 {
    let title = result.title.to_lowercase();
    let snippet = result.snippet.to_lowercase();
    let domain = source_domain(&result.url);
    let mut score = terms
        .iter()
        .map(|term| {
            if title.contains(term) {
                12
            } else if snippet.contains(term) {
                5
            } else {
                0
            }
        })
        .sum::<i32>();
    score += match source_tier(&result.url) {
        "official" => 45,
        "primary" => 25,
        _ => 0,
    };
    if result.url.starts_with("https://") {
        score += 3;
    }
    if [
        "resmi",
        "official",
        "kementerian",
        "pemerintah",
        "bank indonesia",
    ]
    .iter()
    .any(|marker| title.contains(marker) || snippet.contains(marker))
    {
        score += 12;
    }
    if ["/tag/", "/search", "?s=", "/category/", "/indeks"]
        .iter()
        .any(|marker| result.url.to_lowercase().contains(marker))
    {
        score -= 12;
    }
    if is_non_article_domain(&domain) {
        score -= 45;
    }
    let query_asks_definition = terms
        .iter()
        .any(|t| t == "definisi" || t == "arti" || t == "artinya" || t == "makna");
    let is_dictionary_domain = [
        "kbbi.",
        "wiktionary.org",
        "kamus.",
        "dictionary.",
        "thesaurus.",
        "glosarium.",
        "definisi.org",
        "arti-kata.",
    ]
    .iter()
    .any(|d| domain.contains(d));
    if is_dictionary_domain && !query_asks_definition {
        score -= 40;
    }
    let query_asks_visa = terms
        .iter()
        .any(|t| t == "visa" || t == "paspor" || t == "imigrasi" || t == "passport");
    let is_visa_page = domain.contains("ustraveldocs")
        || domain.contains("traveldocs")
        || domain.contains("vfsglobal")
        || result.url.contains("/visa")
        || (title.contains("apply for a") && title.contains("visa"))
        || title.contains("permohonan visa");
    if is_visa_page && !query_asks_visa {
        score -= 50;
    }
    let is_tld_article = title.starts_with(".us ")
        || title == ".us - wikipedia"
        || result.url.contains("wiki/.us");
    if is_tld_article && !terms.iter().any(|t| t == "domain" || t == "tld") {
        score -= 40;
    }
    if domain.is_empty() || result.snippet.trim().is_empty() {
        score -= 20;
    }
    score - original_index.min(20) as i32
}

/// Ranking evidence dilakukan di aplikasi agar urutan hasil mesin pencari bukan
/// satu-satunya sinyal. Maksimal dua hasil per domain menjaga corroboration.
pub fn rank_search_results(
    results: Vec<SearchResult>,
    query: &str,
    limit: usize,
) -> Vec<SearchResult> {
    let mut terms = ranking_terms(query);
    if let Some(en_query) = build_cross_lingual_query(query) {
        for t in ranking_terms(&en_query) {
            if !terms.contains(&t) {
                terms.push(t);
            }
        }
    }
    let mut scored = results
        .into_iter()
        .enumerate()
        .map(|(index, result)| (source_score(&result, &terms, index), result))
        .collect::<Vec<_>>();
    scored.sort_by(|a, b| b.0.cmp(&a.0));

    let mut chosen = Vec::new();
    let mut domains = std::collections::HashMap::<String, usize>::new();
    for (_, result) in scored {
        let domain = source_domain(&result.url);
        if chosen.iter().any(|existing: &SearchResult| {
            (!result.url.is_empty() && existing.url == result.url)
                || existing.title.eq_ignore_ascii_case(&result.title)
        }) {
            continue;
        }
        if !domain.is_empty() && domains.get(&domain).copied().unwrap_or(0) >= 2 {
            continue;
        }
        *domains.entry(domain).or_default() += 1;
        chosen.push(result);
        if chosen.len() >= limit.clamp(1, 10) {
            break;
        }
    }
    chosen
}

pub fn evidence_is_adequate(
    results: &[SearchResult],
    query: &str,
    require_authority: bool,
) -> bool {
    if results.len() < 2 {
        return false;
    }
    let domains = results
        .iter()
        .map(|result| source_domain(&result.url))
        .filter(|domain| !domain.is_empty())
        .collect::<std::collections::HashSet<_>>();
    if domains.len() < 2 {
        return false;
    }
    let searchable = results
        .iter()
        .map(|result| format!("{} {}", result.title, result.snippet).to_lowercase())
        .collect::<Vec<_>>()
        .join(" ");
    let mut terms = ranking_terms(query);
    if let Some(en_query) = build_cross_lingual_query(query) {
        for t in ranking_terms(&en_query) {
            if !terms.contains(&t) {
                terms.push(t);
            }
        }
    }
    let covered = terms
        .iter()
        .filter(|term| searchable.contains(term.as_str()))
        .count();
    let relevance_ok = terms.is_empty() || covered >= terms.len().min(2);
    let authority_ok = !require_authority
        || results
            .iter()
            .any(|result| matches!(source_tier(&result.url), "official" | "primary"));
    relevance_ok && authority_ok
}

