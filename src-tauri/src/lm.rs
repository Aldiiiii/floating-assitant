use serde::Deserialize;
use std::time::Duration;

pub(crate) const ERR_UNREACHABLE: &str =
    "Tidak dapat terhubung ke AI Server.\n\nPastikan LM Studio Server sedang berjalan dan alamat server sudah benar.";

pub(crate) fn map_request_error(e: reqwest::Error) -> String {
    format!("Gagal menghubungi AI Server: {e}")
}

#[derive(Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

pub(crate) fn normalize_base(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

#[tauri::command]
pub async fn lm_list_models(base_url: String) -> Result<Vec<String>, String> {
    let url = format!("{}/models", normalize_base(&base_url));
    let resp = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                ERR_UNREACHABLE.to_string()
            } else {
                format!("Gagal menghubungi AI Server: {e}")
            }
        })?;

    if !resp.status().is_success() {
        return Err(format!("AI Server merespons dengan status {}.", resp.status()));
    }

    let parsed: ModelsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Respons tidak valid dari AI Server: {e}"))?;

    Ok(parsed.data.into_iter().map(|m| m.id).collect())
}
