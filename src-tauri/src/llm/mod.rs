pub mod calculator;
pub mod grounding;
pub mod router;
pub mod stream;
pub mod tools;
pub mod types;

#[allow(unused_imports)]
pub use router::{clean_search_query, guard_search_query};
pub use stream::*;
#[allow(unused_imports)]
pub use tools::{extract_tool_call, parse_model_tool_from_json, strip_tool_call_artifacts, ModelTool};
#[allow(unused_imports)]
pub use types::{ChatMessage, GenerationParams, StreamRegistry};

#[cfg(test)]
mod tests {
    use super::calculator::evaluate_expression;
    use super::grounding::grounding_issues;
    use super::router::{
        clean_search_query, deterministic_route, guard_search_query, local_date_indonesian,
        normalize_current_query, sanitize_technical_query, temporal_system_context,
    };
    use super::tools::{extract_tool_call, native_to_model_tool, strip_tool_call_artifacts, ModelTool};
    use super::types::{ChatMessage, NativeToolCall};
    use chrono::Local;

    fn user(text: &str) -> ChatMessage {
        ChatMessage {
            role: "user".into(),
            content: serde_json::Value::String(text.into()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    #[test]
    fn routes_current_currency_without_llm() {
        assert!(matches!(
            deterministic_route(&[user("berapa 1 dolar ke rupiah saat ini?")]),
            Some(ModelTool::CurrencyRate { base, quote }) if base == "USD" && quote == "IDR"
        ));
        assert!(matches!(
            deterministic_route(&[user("berapa EUR ke USD sekarang?")]),
            Some(ModelTool::CurrencyRate { base, quote }) if base == "EUR" && quote == "USD"
        ));
    }

    #[test]
    fn does_not_browse_ordinary_conversation() {
        assert!(deterministic_route(&[user("tolong rapikan paragraf ini")]).is_none());
    }

    #[test]
    fn routes_news_and_preserves_requested_count() {
        assert!(matches!(
            deterministic_route(&[user("ada berita terbaru apa di Bogor?")]),
            Some(ModelTool::NewsSearch { limit: 5, .. })
        ));
        assert!(matches!(
            deterministic_route(&[user("tampilkan 10 berita Bogor terbaru")]),
            Some(ModelTool::NewsSearch { limit: 10, .. })
        ));
    }

    #[test]
    fn routes_recent_events_with_current_year_on_first_search() {
        let routed = deterministic_route(&[user(
            "berikan informasi karhutla yang terjadi baru baru ini di Indonesia",
        )]);
        let current_year = Local::now().format("%Y").to_string();
        assert!(matches!(
            routed,
            Some(ModelTool::DeepSearch { query }) if query.contains(&current_year) && !query.contains("2024")
        ));
        assert!(temporal_system_context().contains(&current_year));
    }

    #[test]
    fn replaces_model_invented_stale_year_but_keeps_user_year() {
        let current_year = Local::now().format("%Y").to_string();
        let normalized = normalize_current_query(
            "karhutla Indonesia 2024 terkini",
            "informasi karhutla yang terjadi baru baru ini",
        );
        assert!(normalized.contains(&current_year));
        assert!(!normalized.contains("2024"));

        let historical = normalize_current_query(
            "berita karhutla 2024",
            "berita terbaru tentang karhutla tahun 2024",
        );
        assert_eq!(historical, "berita karhutla 2024");
    }

    #[test]
    fn sanitizes_hallucinated_indonesia_on_technical_queries() {
        let user_req =
            "Library STT/TTS lokal apa yang paling ramai direkomendasikan di Reddit/HN sebulan terakhir?";
        let model_query = "rekomendasi library STT TTS lokal Indonesia Reddit Hacker News";
        let cleaned = sanitize_technical_query(model_query, user_req);
        assert_eq!(
            cleaned,
            "rekomendasi library STT TTS local offline Reddit Hacker News"
        );

        let general_req = "rekomendasi kuliner lokal di Indonesia";
        let general_query = "rekomendasi kuliner lokal Indonesia";
        assert_eq!(
            sanitize_technical_query(general_query, general_req),
            "rekomendasi kuliner lokal Indonesia"
        );
    }

    #[test]
    fn calculator_respects_precedence_and_parentheses() {
        assert_eq!(evaluate_expression("2 + 3 * 4").unwrap(), 14.0);
        assert_eq!(evaluate_expression("(2 + 3) * 4").unwrap(), 20.0);
        assert!(evaluate_expression("4 / 0").is_err());
    }

    #[test]
    fn parses_native_currency_tool() {
        let call = NativeToolCall {
            id: "call_1".into(),
            name: "currency_rate".into(),
            arguments: r#"{"base":"usd","quote":"idr"}"#.into(),
        };
        assert!(matches!(
            native_to_model_tool(&call),
            Some(ModelTool::CurrencyRate { base, quote }) if base == "USD" && quote == "IDR"
        ));
    }

    #[test]
    fn parses_qwen_xml_tool_call_after_prose() {
        let response = r#"Maaf, sumber pertama diblokir.
<tool_call> <function=read_page> <parameter=url>
https://www.tradingeconomics.com/indonesia/currency
</parameter> </function> </tool_call>"#;
        assert!(matches!(
            extract_tool_call(response),
            Some(ModelTool::ReadPage { url })
                if url == "https://www.tradingeconomics.com/indonesia/currency"
        ));
    }

    #[test]
    fn parses_json_inside_xml_tool_call() {
        let response =
            r#"<tool_call>{"name":"deep_search","arguments":{"query":"kurs USD IDR"}}</tool_call>"#;
        assert!(matches!(
            extract_tool_call(response),
            Some(ModelTool::DeepSearch { query }) if query == "kurs USD IDR"
        ));
    }

    #[test]
    fn routes_current_public_facts_with_precise_local_date() {
        let routed = deterministic_route(&[user("hari ini libur kenapa?")]);
        assert!(matches!(
            routed,
            Some(ModelTool::DeepSearch { query })
                if query.contains(&local_date_indonesian()) && query.contains("Indonesia")
        ));
        assert!(deterministic_route(&[user("apa kabar hari ini?")]).is_none());
    }

    #[test]
    fn grounding_gate_rejects_missing_fake_and_unsupported_negative_citations() {
        let sources = vec![crate::web_search::SearchResult {
            title: "Kalender libur resmi".into(),
            url: "https://example.go.id/libur".into(),
            snippet: "25 Agustus 2026 merupakan libur nasional Maulid Nabi.".into(),
        }];
        assert!(
            grounding_issues("25 Agustus 2026 merupakan libur nasional [1].", &sources).is_empty()
        );
        assert!(!grounding_issues("Hari ini bukan libur nasional.", &sources).is_empty());
        assert!(!grounding_issues("Hari ini bukan libur nasional [1].", &sources).is_empty());
        assert!(!grounding_issues("Hari ini libur nasional [2].", &sources).is_empty());
    }

    #[test]
    fn grounding_gate_accepts_explicit_supported_negative_claim() {
        let sources = vec![crate::web_search::SearchResult {
            title: "Pengumuman resmi".into(),
            url: "https://example.go.id/status".into(),
            snippet: "Hari ini bukan hari kerja dan kantor ditutup.".into(),
        }];
        assert!(grounding_issues("Hari ini bukan hari kerja [1].", &sources).is_empty());
    }

    #[test]
    fn routes_self_update_inquiry_to_local_time() {
        assert!(matches!(
            deterministic_route(&[user("informasimu sudah yang terupdate?")]),
            Some(ModelTool::LocalTime)
        ));
        assert!(matches!(
            deterministic_route(&[user("apakah datamu terupdate?")]),
            Some(ModelTool::LocalTime)
        ));
        assert!(matches!(
            deterministic_route(&[user("apakah kamu up to date?")]),
            Some(ModelTool::LocalTime)
        ));
    }

    #[test]
    fn parses_tool_call_variations() {
        // Stringified arguments and aliases
        let r1 = r#"<tool_call>{"name":"get_current_time","arguments":"{}"}</tool_call>"#;
        assert!(matches!(extract_tool_call(r1), Some(ModelTool::LocalTime)));

        // Markdown codeblock inside <tool_call>
        let r2 = "<tool_call>\n```json\n{\"name\": \"local_time\"}\n```\n</tool_call>";
        assert!(matches!(extract_tool_call(r2), Some(ModelTool::LocalTime)));

        // Array format
        let r3 = r#"<tool_call>[{"name": "web_search", "arguments": {"query": "berita bola"}}]</tool_call>"#;
        assert!(matches!(
            extract_tool_call(r3),
            Some(ModelTool::WebSearch { query }) if query == "berita bola"
        ));

        // Alias without arguments
        let r4 = r#"{"name": "current_time"}"#;
        assert!(matches!(extract_tool_call(r4), Some(ModelTool::LocalTime)));
    }

    #[test]
    fn strips_tool_call_artifacts_cleanly() {
        let text1 = "Halo!\n<tool_call>\n{\"name\": \"local_time\"}\n</tool_call>\nSemoga membantu!";
        assert_eq!(strip_tool_call_artifacts(text1), "Halo!\n\nSemoga membantu!");

        let text2 = "<tool_call>\n{\"name\": \"local_time\"}\n</tool_call>";
        assert_eq!(strip_tool_call_artifacts(text2), "");

        let text3 = "Jawaban saya:\n<tool_call>\n{\"name\": \"web_search\"";
        assert_eq!(strip_tool_call_artifacts(text3), "Jawaban saya:");

        let text4 = r#"{"tool": "web_search", "arguments": {"query": "test"}}"#;
        assert_eq!(strip_tool_call_artifacts(text4), "");
    }

    #[test]
    fn cleans_search_query_properly() {
        assert_eq!(
            clean_search_query("cari di web tentang arti gerakan 'salam 3 jari' politik di indonesia"),
            "arti gerakan salam 3 jari politik di indonesia"
        );
        assert_eq!(
            clean_search_query("tolong carikan info tentang cuaca jakarta"),
            "cuaca jakarta"
        );
        assert_eq!(
            clean_search_query("cari web tentang kurs dollar"),
            "kurs dollar"
        );
    }

    #[test]
    fn golden_routing_cases_match() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../docs/evals/web-routing.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let input = case["input"].as_str().unwrap();
            let actual = match deterministic_route(&[user(input)]) {
                Some(ModelTool::CurrencyRate { .. }) => "currency",
                Some(ModelTool::DeepSearch { .. }) => "deep",
                Some(ModelTool::NewsSearch { .. }) => "news",
                Some(ModelTool::LocalTime) => "time",
                Some(ModelTool::Calculator { .. }) => "calculator",
                Some(_) => "other",
                None => "none",
            };
            assert_eq!(actual, case["expected"].as_str().unwrap(), "input: {input}");
        }
    }

    #[test]
    fn guards_conversational_queries_and_recovers_keywords() {
        let user_prompt = "saya pakai lm studio. better mana llama3.1 8b dengan qwen3.5 9b?";
        let guarded = guard_search_query("saya", user_prompt);
        assert!(!guarded.is_empty());
        assert!(!guarded.contains("saya"));
        assert!(guarded.contains("llama3.1") || guarded.contains("8b"));

        // Over-pruned country names should recover core entities from user request
        let nuclear_prompt = "carikan informasi skenario yang terjadi jika amerika atau usa melesatkan bom nuklir ke iran";
        let recovered = guard_search_query("amerika atau usa", nuclear_prompt);
        assert!(recovered.contains("nuklir"));
        assert!(recovered.contains("iran"));

        // Valid query should remain untouched
        assert_eq!(guard_search_query("harga beras hari ini", user_prompt), "harga beras hari ini");
    }
}
