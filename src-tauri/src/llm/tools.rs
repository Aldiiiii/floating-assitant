use super::types::NativeToolCall;

pub fn tool_definitions() -> serde_json::Value {
    serde_json::json!([
        {"type":"function","function":{"name":"web_search","description":"Cari informasi terbaru di web secara cepat. Masukkan kata kunci spesifik (2-5 kata) tanpa kata obrolan seperti 'saya', 'kamu', 'apakah'.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Kata kunci pencarian spesifik (misal: 'llama 3.1 8b vs qwen 2.5 9b benchmark'). Jangan gunakan kata percakapan."}},"required":["query"]}}},
        {"type":"function","function":{"name":"deep_search","description":"Cari lalu baca isi beberapa halaman web secara mendalam untuk fakta, angka, atau riset yang memerlukan bukti. Masukkan kata kunci spesifik tanpa kata obrolan.","parameters":{"type":"object","properties":{"query":{"type":"string","description":"Kata kunci spesifik untuk riset mendalam. Jangan gunakan kata percakapan."}},"required":["query"]}}},
        {"type":"function","function":{"name":"news_search","description":"Cari beberapa artikel berita terbaru sebagai item terpisah.","parameters":{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":10}},"required":["query"]}}},
        {"type":"function","function":{"name":"read_page","description":"Baca isi URL HTTP(S) publik tertentu.","parameters":{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}}},
        {"type":"function","function":{"name":"local_time","description":"Dapatkan tanggal dan waktu lokal saat ini tanpa browsing.","parameters":{"type":"object","properties":{}}}},
        {"type":"function","function":{"name":"calculator","description":"Hitung ekspresi aritmetika dasar secara deterministik.","parameters":{"type":"object","properties":{"expression":{"type":"string"}},"required":["expression"]}}},
        {"type":"function","function":{"name":"currency_rate","description":"Cari nilai tukar mata uang terbaru beserta sumber dan waktu data.","parameters":{"type":"object","properties":{"base":{"type":"string"},"quote":{"type":"string"}},"required":["base","quote"]}}}
    ])
}

/// Tool yang bisa dipilih model via dua jalur format:
/// 1. Structured JSON (utama): {"tool":"web_search","arguments":{"query":"..."}}
/// 2. Legacy fallback: [CARI: kata kunci]
#[derive(Debug, Clone, PartialEq)]
pub enum ModelTool {
    WebSearch { query: String },
    DeepSearch { query: String },
    NewsSearch { query: String, limit: usize },
    ReadPage { url: String },
    LocalTime,
    Calculator { expression: String },
    CurrencyRate { base: String, quote: String },
}

pub fn parse_model_tool_from_json(value: &serde_json::Value) -> Option<ModelTool> {
    let val = if let Some(arr) = value.as_array() {
        arr.first()?
    } else {
        value
    };

    let mut tool_name = val
        .get("tool")
        .or_else(|| val.get("name"))
        .and_then(serde_json::Value::as_str);

    if tool_name.is_none() {
        if let Some(func) = val.get("function") {
            tool_name = func.get("name").and_then(serde_json::Value::as_str);
        }
    }

    let mut raw_args = val
        .get("arguments")
        .or_else(|| val.get("parameters"))
        .or_else(|| val.get("args"));

    if raw_args.is_none() {
        if let Some(func) = val.get("function") {
            raw_args = func.get("arguments").or_else(|| func.get("parameters"));
        }
    }

    let fallback_name;
    if tool_name.is_none() {
        if let Some(obj) = val.as_object() {
            if obj.len() == 1 {
                let (k, v) = obj.iter().next().unwrap();
                fallback_name = k.as_str();
                tool_name = Some(fallback_name);
                if raw_args.is_none() {
                    raw_args = Some(v);
                }
            }
        }
    }

    let raw_tool = tool_name?.trim().to_lowercase();

    let parsed_args_holder: Option<serde_json::Value> = match raw_args {
        Some(serde_json::Value::String(s)) => {
            let st = s.trim();
            if st.starts_with('{') {
                serde_json::from_str(st).ok()
            } else {
                None
            }
        }
        Some(v @ serde_json::Value::Object(_)) => Some(v.clone()),
        _ => None,
    };
    let args_obj = parsed_args_holder
        .as_ref()
        .and_then(serde_json::Value::as_object);

    let get_arg_str = |keys: &[&str]| -> Option<String> {
        if let Some(obj) = args_obj {
            for &k in keys {
                if let Some(v) = obj.get(k) {
                    if let Some(s) = v.as_str() {
                        let t = s.trim();
                        if !t.is_empty() {
                            return Some(t.to_string());
                        }
                    }
                }
            }
        } else if let Some(serde_json::Value::String(s)) = raw_args {
            let t = s.trim();
            if !t.is_empty() && !t.starts_with('{') {
                return Some(t.to_string());
            }
        }
        None
    };

    match raw_tool.as_str() {
        "local_time"
        | "get_local_time"
        | "current_time"
        | "get_current_time"
        | "time"
        | "get_time"
        | "date"
        | "get_date"
        | "clock" => Some(ModelTool::LocalTime),

        "web_search"
        | "search"
        | "web"
        | "internet_search"
        | "google_search"
        | "bing_search"
        | "web_search_prime" => {
            let query = get_arg_str(&[
                "query",
                "q",
                "search_query",
                "keyword",
                "keywords",
                "text",
                "prompt",
            ])?;
            Some(ModelTool::WebSearch { query })
        }

        "deep_search" | "deepsearch" | "web_deep_search" | "research" => {
            let query = get_arg_str(&[
                "query",
                "q",
                "search_query",
                "keyword",
                "keywords",
                "text",
                "prompt",
            ])?;
            Some(ModelTool::DeepSearch { query })
        }

        "news_search" | "news" | "get_news" | "search_news" => {
            let query = get_arg_str(&[
                "query",
                "q",
                "search_query",
                "keyword",
                "keywords",
                "text",
                "prompt",
            ])?;
            let limit = args_obj
                .and_then(|o| o.get("limit").or_else(|| o.get("count")).or_else(|| o.get("n")))
                .and_then(serde_json::Value::as_u64)
                .unwrap_or(5)
                .clamp(1, 10) as usize;
            Some(ModelTool::NewsSearch { query, limit })
        }

        "read_page"
        | "fetch_page"
        | "read_url"
        | "fetch_url"
        | "browse"
        | "scrape"
        | "fetch"
        | "open_url" => {
            let url = get_arg_str(&["url", "link", "uri", "target", "page"])?;
            Some(ModelTool::ReadPage { url })
        }

        "calculator" | "calc" | "calculate" | "compute" => {
            let expression = get_arg_str(&["expression", "expr", "math", "calculation"])?;
            Some(ModelTool::Calculator { expression })
        }

        "currency_rate" | "currency" | "exchange_rate" | "get_currency_rate" | "forex" => {
            let base = get_arg_str(&["base", "from", "currency", "curr1"])?;
            let quote = get_arg_str(&["quote", "to", "target", "curr2"])?;
            Some(ModelTool::CurrencyRate {
                base: base.to_uppercase(),
                quote: quote.to_uppercase(),
            })
        }

        _ => None,
    }
}

pub fn extract_tool_call(response: &str) -> Option<ModelTool> {
    let trimmed = response.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Jalur 1 — structured JSON langsung.
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(tool) = parse_model_tool_from_json(&value) {
            return Some(tool);
        }
    }

    // Jalur 2 — legacy [CARI: kata kunci].
    if trimmed.starts_with("[CARI:") && trimmed.ends_with(']') {
        let inner = trimmed["[CARI:".len()..trimmed.len() - 1].trim();
        if !inner.is_empty() {
            return Some(ModelTool::WebSearch {
                query: inner.to_string(),
            });
        }
    }

    // Jalur 3 — XML / tag format <tool_call>...</tool_call> atau <function=...>
    if let Some(tool) = extract_xml_tool_call(trimmed) {
        return Some(tool);
    }

    // Jalur 4 — JSON tool call yang tertanam di dalam teks/prosa bebas
    if let Some(brace_start) = trimmed.find('{') {
        if let Some(brace_end) = trimmed.rfind('}') {
            if brace_end > brace_start {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&trimmed[brace_start..=brace_end]) {
                    if let Some(tool) = parse_model_tool_from_json(&value) {
                        return Some(tool);
                    }
                }
            }
        }
    }

    None
}

pub fn extract_xml_tool_call(response: &str) -> Option<ModelTool> {
    let call_start = response.find("<tool_call")?;
    let after_open = response[call_start..].find('>')? + call_start + 1;
    let call_end = response[after_open..]
        .find("</tool_call>")
        .map(|offset| after_open + offset)
        .unwrap_or(response.len());
    let mut body = response[after_open..call_end].trim();

    // Bersihkan markdown code fences bila ada: ```json ... ``` atau ``` ... ```
    if body.starts_with("```") {
        if let Some(newline_pos) = body.find('\n') {
            body = body[newline_pos + 1..].trim();
        }
        if body.ends_with("```") {
            body = body[..body.len() - 3].trim();
        }
    }

    // 1. Coba parse langsung sebagai JSON
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(tool) = parse_model_tool_from_json(&value) {
            return Some(tool);
        }
    }

    // 2. Coba ekstrak substring JSON {...} di dalam body
    if let Some(brace_start) = body.find('{') {
        if let Some(brace_end) = body.rfind('}') {
            if brace_end > brace_start {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body[brace_start..=brace_end]) {
                    if let Some(tool) = parse_model_tool_from_json(&value) {
                        return Some(tool);
                    }
                }
            }
        }
    }

    // 3. Coba ekstrak substring JSON array [...] di dalam body
    if let Some(bracket_start) = body.find('[') {
        if let Some(bracket_end) = body.rfind(']') {
            if bracket_end > bracket_start {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body[bracket_start..=bracket_end]) {
                    if let Some(tool) = parse_model_tool_from_json(&value) {
                        return Some(tool);
                    }
                }
            }
        }
    }

    // 4. LM Studio/Qwen XML variant:
    // <function=read_page><parameter=url>https://...</parameter></function>
    let function_marker = "<function=";
    if let Some(marker_pos) = body.find(function_marker) {
        let function_start = marker_pos + function_marker.len();
        if let Some(rel_end) = body[function_start..].find('>') {
            let function_end = function_start + rel_end;
            let raw_name = body[function_start..function_end]
                .trim_matches([' ', '\'', '"'])
                .trim()
                .to_lowercase();

            let norm_name = match raw_name.as_str() {
                "local_time" | "get_local_time" | "current_time" | "get_current_time" | "time" | "clock" => {
                    return Some(ModelTool::LocalTime);
                }
                "web_search" | "search" | "google_search" | "bing_search" => "web_search",
                "deep_search" | "deepsearch" | "research" => "deep_search",
                "news_search" | "news" => "news_search",
                "read_page" | "fetch_page" | "read_url" | "browse" => "read_page",
                "calculator" | "calc" | "calculate" => "calculator",
                "currency_rate" | "currency" | "forex" => "currency_rate",
                _ => return None,
            };

            let argument_name = match norm_name {
                "web_search" | "deep_search" | "news_search" => "query",
                "read_page" => "url",
                "calculator" => "expression",
                "currency_rate" => "base",
                _ => return None,
            };

            let value = xml_parameter(body, argument_name)?;
            let mut arguments = serde_json::Map::new();
            arguments.insert(argument_name.into(), serde_json::Value::String(value));

            if norm_name == "news_search" {
                let limit = xml_parameter(body, "limit")
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(5)
                    .clamp(1, 10);
                arguments.insert("limit".into(), serde_json::json!(limit));
            }
            if norm_name == "currency_rate" {
                let quote = xml_parameter(body, "quote")?;
                arguments.insert("quote".into(), serde_json::Value::String(quote));
            }

            return parse_model_tool_from_json(&serde_json::json!({
                "tool": norm_name,
                "arguments": arguments
            }));
        }
    }

    None
}

pub fn xml_parameter(body: &str, name: &str) -> Option<String> {
    let marker = format!("<parameter={name}>");
    let start = body.find(&marker)? + marker.len();
    let end_marker = "</parameter>";
    let end = body[start..]
        .find(end_marker)
        .map(|offset| start + offset)?;
    let value = body[start..end].trim();
    (!value.is_empty()).then(|| value.to_string())
}

pub fn native_to_model_tool(call: &NativeToolCall) -> Option<ModelTool> {
    if call.name.is_empty() {
        return None;
    }
    let args = serde_json::from_str::<serde_json::Value>(&call.arguments)
        .unwrap_or_else(|_| serde_json::json!({}));
    let wrapper = serde_json::json!({"tool": call.name, "arguments": args});
    extract_tool_call(&wrapper.to_string())
}

/// Membersihkan tag dan markup alat bantu internal (<tool_call>, <function=...>, [CARI:])
/// dari teks agar tidak bocor ke antarmuka pengguna.
pub fn strip_tool_call_artifacts(text: &str) -> String {
    let mut s = text.to_string();

    // 1. Buang pasangan <tool_call>...</tool_call>
    while let Some(start) = s.find("<tool_call") {
        if let Some(end_tag) = s[start..].find("</tool_call>") {
            let end = start + end_tag + "</tool_call>".len();
            s.replace_range(start..end, "");
        } else {
            // Tag <tool_call tidak tertutup — potong hingga akhir
            s.truncate(start);
            break;
        }
    }

    // 2. Buang sisa tag penutup </tool_call> bila ada
    s = s.replace("</tool_call>", "");

    // 3. Buang pasangan <function=...></function>
    while let Some(start) = s.find("<function=") {
        if let Some(end_tag) = s[start..].find("</function>") {
            let end = start + end_tag + "</function>".len();
            s.replace_range(start..end, "");
        } else {
            s.truncate(start);
            break;
        }
    }

    // 4. Buang tag legacy [CARI: ...]
    while let Some(start) = s.find("[CARI:") {
        if let Some(end_bracket) = s[start..].find(']') {
            let end = start + end_bracket + 1;
            s.replace_range(start..end, "");
        } else {
            s.truncate(start);
            break;
        }
    }

    // 5. Deduplikasi blok <think>...</think> kembar identik
    s = deduplicate_think_blocks(&s);

    // 6. Bila seluruh teks yang tersisa adalah objek JSON tool call murni
    let trimmed = s.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if val.get("tool").is_some() || val.get("name").is_some() || val.get("function").is_some() {
                return String::new();
            }
        }
    }

    s.trim().to_string()
}

pub fn deduplicate_think_blocks(s: &str) -> String {
    let mut result = s.to_string();
    let mut blocks: Vec<(usize, usize, String)> = Vec::new();
    let mut search_from = 0;
    while let Some(start) = result[search_from..].find("<think>") {
        let abs_start = search_from + start;
        if let Some(end_offset) = result[abs_start..].find("</think>") {
            let abs_end = abs_start + end_offset + "</think>".len();
            let inner = result[abs_start + "<think>".len()..abs_start + end_offset].trim().to_string();
            blocks.push((abs_start, abs_end, inner));
            search_from = abs_end;
        } else {
            break;
        }
    }
    if blocks.len() > 1 {
        for i in (1..blocks.len()).rev() {
            if blocks[i].2 == blocks[i - 1].2 {
                let (start, end, _) = blocks[i];
                result.replace_range(start..end, "");
            }
        }
    }
    result
}

