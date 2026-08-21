use crate::lm::{map_request_error, normalize_base, ERR_UNREACHABLE};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

const ERR_VISION_UNSUPPORTED: &str = "Model ini tidak mendukung analisis gambar.\n\nGunakan model multimodal (mis. qwen-vl, llava) di Pengaturan.";

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    /// String biasa ATAU array content-parts format OpenAI (teks + image_url).
    pub content: serde_json::Value,
}

#[derive(Clone, Serialize)]
struct ChunkPayload {
    id: u32,
    delta: String,
}

#[derive(Clone, Serialize)]
struct DonePayload {
    id: u32,
    cancelled: bool,
}

#[derive(Clone, Serialize)]
struct StreamErrorPayload {
    id: u32,
    error: String,
}

/// Registry request aktif untuk mendukung stop generation.
#[derive(Default)]
pub struct StreamRegistry(pub Mutex<HashMap<u32, CancellationToken>>);

#[derive(Deserialize, Default)]
struct CompletionChunk {
    #[serde(default)]
    choices: Vec<CompletionChoice>,
}

#[derive(Deserialize, Default)]
struct CompletionChoice {
    #[serde(default)]
    delta: Delta,
}

#[derive(Deserialize, Default)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

enum SseLine {
    Delta(String),
    Done,
    Ignore,
}

fn parse_sse_line(line: &str) -> SseLine {
    let Some(data) = line.strip_prefix("data:") else {
        return SseLine::Ignore;
    };
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return SseLine::Done;
    }
    match serde_json::from_str::<CompletionChunk>(data) {
        Ok(chunk) => chunk
            .choices
            .first()
            .and_then(|c| c.delta.content.clone())
            .filter(|d| !d.is_empty())
            .map(SseLine::Delta)
            .unwrap_or(SseLine::Ignore),
        // Baris komentar/keep-alive yang tidak valid JSON diabaikan.
        Err(_) => SseLine::Ignore,
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        // Tanpa total timeout: generasi LLM bisa berjalan lama.
        .build()
        .map_err(|e| e.to_string())
}

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

fn is_vision_reject(body: &str) -> bool {
    let lowered = body.to_lowercase();
    ["image", "vision", "multimodal", "gambar"]
        .iter()
        .any(|k| lowered.contains(k))
}

async fn stream_once(
    app: &AppHandle,
    token: &CancellationToken,
    id: u32,
    base_url: &str,
    model: &str,
    messages: &[ChatMessage],
    has_image: bool,
) -> Result<(), String> {
    let url = format!("{}/chat/completions", normalize_base(base_url));
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    let resp = http_client()?.post(url).json(&body).send().await.map_err(|e| {
        if e.is_connect() || e.is_timeout() {
            ERR_UNREACHABLE.to_string()
        } else {
            map_request_error(e)
        }
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if has_image && is_vision_reject(&text) {
            return Err(ERR_VISION_UNSUPPORTED.to_string());
        }
        return Err(format!(
            "{}\n\n(status {status}: {})",
            ERR_UNREACHABLE,
            truncate(&text, 300)
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();

    loop {
        tokio::select! {
            _ = token.cancelled() => return Ok(()),
            item = stream.next() => match item {
                Some(Ok(bytes)) => {
                    buf.extend_from_slice(&bytes);
                    while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                        let raw: Vec<u8> = buf.drain(..=pos).collect();
                        let line = String::from_utf8_lossy(&raw[..raw.len() - 1]);
                        match parse_sse_line(line.trim()) {
                            SseLine::Delta(delta) => {
                                let _ = app.emit("chat-chunk", ChunkPayload { id, delta });
                            }
                            SseLine::Done => return Ok(()),
                            SseLine::Ignore => {}
                        }
                    }
                }
                Some(Err(e)) => return Err(format!("Koneksi ke AI Server terputus: {e}")),
                None => return Ok(()),
            }
        }
    }
}
#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    id: u32,
    base_url: String,
    model: String,
    messages: Vec<ChatMessage>,
    has_image: bool,
) -> Result<(), String> {
    let token = CancellationToken::new();
    registry.0.lock().await.insert(id, token.clone());

    let result =
        stream_once(&app, &token, id, &base_url, &model, &messages, has_image).await;

    registry.0.lock().await.remove(&id);

    if token.is_cancelled() {
        let _ = app.emit("chat-done", DonePayload { id, cancelled: true });
        return Ok(());
    }

    match result {
        Ok(()) => {
            let _ = app.emit("chat-done", DonePayload { id, cancelled: false });
            Ok(())
        }
        Err(e) => {
            let _ = app.emit("chat-error", StreamErrorPayload { id, error: e });
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn chat_cancel(registry: State<'_, StreamRegistry>, id: u32) -> Result<(), String> {
    if let Some(token) = registry.0.lock().await.get(&id) {
        token.cancel();
    }
    Ok(())
}
