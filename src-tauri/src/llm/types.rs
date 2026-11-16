use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub const ERR_VISION_UNSUPPORTED: &str = "Model ini tidak mendukung analisis gambar.\n\nGunakan model multimodal (mis. qwen-vl, llava) di Pengaturan.";
pub const MAX_SEARCH_ITERATIONS: u32 = 2;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    /// String biasa ATAU array content-parts format OpenAI (teks + image_url).
    pub content: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Default, Debug)]
pub struct NativeToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// Parameter generasi yang dikirim ke endpoint /chat/completions.
#[derive(Default, Clone, Debug)]
pub struct GenerationParams {
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub max_tokens: Option<u64>,
}

#[derive(Clone, Serialize)]
pub struct ChunkPayload {
    pub id: u32,
    pub delta: String,
}

#[derive(Clone, Serialize)]
pub struct DonePayload {
    pub id: u32,
    pub cancelled: bool,
    pub sources: Vec<crate::web_search::SearchResult>,
}

#[derive(Clone, Serialize)]
pub struct StreamErrorPayload {
    pub id: u32,
    pub error: String,
}

#[derive(Clone, Serialize)]
pub struct PhasePayload {
    pub id: u32,
    pub phase: &'static str,
    pub query: String,
}

#[derive(Clone, Serialize)]
pub struct ResetPayload {
    pub id: u32,
}

/// Registry request aktif untuk mendukung stop generation.
#[derive(Default)]
pub struct StreamRegistry(pub Mutex<HashMap<u32, CancellationToken>>);

#[derive(Deserialize)]
pub struct CompletionChunk {
    #[serde(default)]
    pub choices: Vec<CompletionChoice>,
}

#[derive(Deserialize, Default)]
pub struct CompletionChoice {
    #[serde(default)]
    pub index: Option<usize>,
    #[serde(default)]
    pub delta: Delta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct Delta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub reasoning_content: Option<String>,
    #[serde(default)]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCallDelta>,
}

#[derive(Deserialize, Default)]
pub struct ToolCallDelta {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub function: ToolFunctionDelta,
}

#[derive(Deserialize, Default)]
pub struct ToolFunctionDelta {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
}

pub enum SseLine {
    Delta(String),
    Reasoning(String),
    Done(Option<String>),
    Ignore,
}

pub fn parse_sse_line(line: &str) -> SseLine {
    let Some(data) = line.strip_prefix("data:") else {
        return SseLine::Ignore;
    };
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return SseLine::Done(None);
    }
    match serde_json::from_str::<CompletionChunk>(data) {
        Ok(chunk) => {
            if let Some(c) = chunk.choices.first() {
                if c.index.unwrap_or(0) != 0 {
                    return SseLine::Ignore;
                }
                if let Some(content) = &c.delta.content {
                    if !content.is_empty() {
                        return SseLine::Delta(content.clone());
                    }
                }
                if let Some(reasoning) = c.delta.reasoning_content.as_ref().or(c.delta.reasoning.as_ref()) {
                    if !reasoning.is_empty() {
                        return SseLine::Reasoning(reasoning.clone());
                    }
                }
                if let Some(reason) = &c.finish_reason {
                    if reason == "stop" || reason == "length" {
                        return SseLine::Done(Some(reason.clone()));
                    }
                }
            }
            SseLine::Ignore
        }
        // Baris komentar/keep-alive yang tidak valid JSON diabaikan.
        Err(_) => SseLine::Ignore,
    }
}

