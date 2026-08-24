//! Wrapper transkripsi Whisper dengan cache context per path model.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters,
};

pub struct Transcript {
    pub text: String,
    pub language: String,
}

type ContextCache = Mutex<Option<(PathBuf, Arc<WhisperContext>)>>;

fn context_cache() -> &'static ContextCache {
    static CACHE: OnceLock<ContextCache> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// Muat context sekali per model; pemanggilan berikutnya memakai cache.
fn context_for(path: &Path) -> Result<Arc<WhisperContext>, String> {
    let cache = context_cache();
    let mut guard = cache.lock().map_err(|_| "Whisper context terkunci.")?;

    if let Some((cached_path, ctx)) = guard.as_ref() {
        if cached_path == path {
            return Ok(ctx.clone());
        }
    }

    if !path.exists() {
        return Err(format!(
            "Model Whisper tidak ditemukan di {}.\n\nUnduh lewat Pengaturan → Voice.",
            path.display()
        ));
    }

    let ctx = WhisperContext::new_with_params(path, WhisperContextParameters::default())
        .map_err(|e| format!("Gagal memuat model Whisper: {e}"))?;
    let arc = Arc::new(ctx);
    *guard = Some((path.to_path_buf(), arc.clone()));
    Ok(arc)
}

fn detected_language(lang_id: i32) -> String {
    let id_id = whisper_rs::get_lang_id("id");
    let en_id = whisper_rs::get_lang_id("en");
    if Some(lang_id) == id_id {
        "id"
    } else if Some(lang_id) == en_id {
        "en"
    } else {
        "auto"
    }
    .to_string()
}

/// Transkripsi PCM 16 kHz mono. Bahasa dideteksi otomatis (ID/EN).
pub fn transcribe(
    pcm_16k: &[f32],
    model_path: &Path,
    language: &str,
) -> Result<Transcript, String> {
    // < 500 ms audio hampir pasti tidak berisi ucapan yang bisa dikenali.
    if pcm_16k.len() < 8_000 {
        return Err("Audio terlalu pendek untuk ditranskripsi.\n\nTahan tombol mic \
             sedikit lebih lama saat berbicara."
            .to_string());
    }

    let ctx = context_for(model_path)?;
    let mut state = ctx
        .create_state()
        .map_err(|e| format!("Gagal menyiapkan Whisper state: {e}"))?;

    let pinned = match language {
        "id" | "en" => language,
        _ => "auto",
    };
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(pinned));
    // Bias decoding ke kosakata bahasa utama (membantu frasa campuran ID+EN).
    match pinned {
        "id" => params.set_initial_prompt(
            "Berikut adalah transkripsi percakapan bahasa Indonesia sehari-hari.",
        ),
        "en" => params.set_initial_prompt(
            "The following is a transcription of everyday English conversation.",
        ),
        _ => {}
    }
    params.set_translate(false);
    params.set_no_context(true);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    state
        .full(params, pcm_16k)
        .map_err(|e| format!("Transkripsi gagal: {e}"))?;

    let count = state.full_n_segments();
    let mut text = String::new();
    for i in 0..count {
        if let Some(segment) = state.get_segment(i) {
            if let Ok(s) = segment.to_str_lossy() {
                text.push_str(&s);
            }
        }
    }

    let language = detected_language(state.full_lang_id_from_state());

    Ok(Transcript {
        text: text.trim().to_string(),
        language,
    })
}
