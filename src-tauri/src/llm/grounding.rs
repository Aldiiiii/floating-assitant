fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        let mut end = max;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        &s[..end]
    }
}

pub fn citation_indices(text: &str) -> Vec<usize> {
    let bytes = text.as_bytes();
    let mut indices = Vec::new();
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b'[' {
            cursor += 1;
            continue;
        }
        let start = cursor + 1;
        let mut end = start;
        while end < bytes.len() && bytes[end].is_ascii_digit() {
            end += 1;
        }
        if end > start && end < bytes.len() && bytes[end] == b']' {
            if let Ok(index) = text[start..end].parse::<usize>() {
                indices.push(index);
            }
            cursor = end + 1;
        } else {
            cursor += 1;
        }
    }
    indices
}

pub fn without_citations(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut remaining = text;
    while let Some(open) = remaining.find('[') {
        output.push_str(&remaining[..open]);
        let after_open = &remaining[open + 1..];
        if let Some(close) = after_open.find(']') {
            let inside = &after_open[..close];
            if !inside.is_empty() && inside.bytes().all(|byte| byte.is_ascii_digit()) {
                remaining = &after_open[close + 1..];
                continue;
            }
        }
        output.push('[');
        remaining = after_open;
    }
    output.push_str(remaining);
    output
}

pub fn normalized_words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|word| !word.is_empty())
        .collect()
}

pub fn decisive_negative_phrase(text: &str) -> Option<String> {
    let words = normalized_words(text);
    for (index, word) in words.iter().enumerate() {
        if ["bukan", "tidak", "belum", "tanpa"].contains(&word.as_str()) {
            let end = (index + 4).min(words.len());
            return Some(words[index..end].join(" "));
        }
    }
    None
}

pub fn factual_block_needs_citation(text: &str) -> bool {
    let lower = text.to_lowercase();
    text.chars().any(|c| c.is_ascii_digit())
        || decisive_negative_phrase(text).is_some()
        || [
            " adalah ",
            " merupakan ",
            " jatuh pada ",
            " ditetapkan ",
            " berlaku ",
            " hari ini ",
        ]
        .iter()
        .any(|marker| lower.contains(marker))
}

/// Pemeriksaan murah setelah generasi. Ini bukan semantic theorem prover,
/// tetapi menangkap citation fiktif, klaim faktual tanpa sumber, dan negasi
/// tegas yang tidak pernah muncul pada evidence yang dirujuk.
pub fn grounding_issues(answer: &str, sources: &[crate::web_search::SearchResult]) -> Vec<String> {
    let mut issues = Vec::new();
    for block in answer.split("\n\n").flat_map(|paragraph| {
        if paragraph.contains('|') {
            paragraph.lines().collect::<Vec<_>>()
        } else {
            vec![paragraph]
        }
    }) {
        let trimmed = block.trim();
        if trimmed.is_empty() || trimmed.starts_with("```") || trimmed.starts_with("---") {
            continue;
        }
        let citations = citation_indices(trimmed);
        for index in &citations {
            if *index == 0 || *index > sources.len() {
                issues.push(format!("citation [{index}] tidak tersedia"));
            }
        }
        if factual_block_needs_citation(trimmed) && citations.is_empty() {
            issues.push(format!(
                "klaim faktual tanpa citation: {}",
                truncate(trimmed, 120)
            ));
            continue;
        }
        let Some(negative) = decisive_negative_phrase(&without_citations(trimmed)) else {
            continue;
        };
        if citations.iter().all(|index| {
            sources
                .get(index.saturating_sub(1))
                .map(|source| {
                    let evidence = format!("{} {}", source.title, source.snippet).to_lowercase();
                    !evidence.contains(&negative)
                })
                .unwrap_or(true)
        }) {
            issues.push(format!("negasi tidak didukung evidence: {negative}"));
        }
    }
    issues.sort();
    issues.dedup();
    issues
}

