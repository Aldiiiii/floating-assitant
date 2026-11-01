//! Voice Activity Detection (VAD) & End-of-Utterance (EOU) Detection.
//! Diadaptasi dari teknik whisper.cpp (vad_simple) berbasis rasio energi RMS audio.

use std::time::Duration;

#[allow(dead_code)]
pub struct SimpleVad {
    /// Ambang perbandingan energi ekor terhadap total (default ~0.55 ala whisper.cpp)
    pub vad_thold: f32,
    /// Durasi hening untuk memicu End-of-Utterance (default 1200ms)
    pub silence_duration: Duration,
    /// Durasi bicara minimum agar diakui sebagai ujaran valid (default 350ms)
    pub min_speech_duration: Duration,
    /// Ambang energi minimum RMS pada audio ternormalisasi agar diakui sebagai vokal manusia
    pub min_speech_rms: f32,
    /// Peak RMS tertinggi yang tercatat saat user berbicara
    pub max_speech_rms: f32,
    /// Apakah suara manusia sudah mulai terdeteksi
    has_speech: bool,
}

#[allow(dead_code)]
impl SimpleVad {
    pub fn new(silence_ms: u64, vad_thold: f32) -> Self {
        Self {
            vad_thold,
            silence_duration: Duration::from_millis(silence_ms),
            min_speech_duration: Duration::from_millis(350),
            min_speech_rms: 0.020, // RMS bicara pada audio ternormalisasi
            max_speech_rms: 0.0,
            has_speech: false,
        }
    }

    /// Evaluasi sampel PCM mono 16kHz ternormalisasi.
    /// Mengembalikan `true` jika kondisi End-of-Utterance (hening > silence_duration setelah bicara) terpenuhi.
    pub fn evaluate(&mut self, pcm: &[f32], sample_rate: u32) -> bool {
        if pcm.is_empty() || sample_rate == 0 {
            return false;
        }

        let n_samples = pcm.len();
        let silence_samples =
            (sample_rate as usize * self.silence_duration.as_millis() as usize) / 1000;
        let frame_samples = (sample_rate as usize * 100) / 1000; // 100ms frame

        // Evaluasi apakah terdapat vokal bicara manusia pada buffer audio
        if n_samples >= frame_samples {
            let mut detected_frames = 0;
            for chunk in pcm.chunks(frame_samples) {
                let chunk_rms = calculate_rms(chunk);
                if chunk_rms >= self.min_speech_rms {
                    detected_frames += 1;
                    if chunk_rms > self.max_speech_rms {
                        self.max_speech_rms = chunk_rms;
                    }
                    if detected_frames >= 3 {
                        self.has_speech = true;
                    }
                }
            }
        }

        // Belum cukup audio untuk menguji jendela hening (misal audio belum mencapai durasi hening + durasi bicara)
        let min_required_samples = silence_samples + (sample_rate as usize * 350) / 1000;
        if n_samples < min_required_samples {
            return false;
        }

        // Jika belum pernah ada suara manusia yang valid, jangan trigger hening
        if !self.has_speech {
            return false;
        }

        // Jendela total (maksimal 8 detik terakhir agar tetap adaptif)
        let max_window_samples = (sample_rate as usize * 8000) / 1000;
        let window = if n_samples > max_window_samples {
            &pcm[n_samples - max_window_samples..]
        } else {
            pcm
        };

        let rms_all = calculate_rms(window);

        // Ekor terakhir sepanjang `silence_duration` (misal 1200ms)
        let tail = &pcm[n_samples - silence_samples..];
        let rms_tail = calculate_rms(tail);

        // Kondisi hening ala whisper.cpp & adaptif bising kipas:
        // 1. RMS ekor turun signifikan dibanding RMS keseluruhan audio (< vad_thold * rms_all)
        // DAN
        // 2. RMS ekor sudah turun ke level hening (< 0.035) ATAU turun drastis di bawah 45% peak vokal manusia
        let is_silent = rms_tail < self.vad_thold * rms_all
            && (rms_tail < 0.035 || rms_tail < self.max_speech_rms * 0.45);

        is_silent
    }

    pub fn has_detected_speech(&self) -> bool {
        self.has_speech
    }

    pub fn reset(&mut self) {
        self.has_speech = false;
        self.max_speech_rms = 0.0;
    }
}

fn calculate_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_false() {
        let mut vad = SimpleVad::new(1200, 0.60);
        assert!(!vad.evaluate(&[], 16000));
        assert!(!vad.has_detected_speech());
    }

    #[test]
    fn pure_noise_floor_does_not_trigger() {
        let mut vad = SimpleVad::new(1200, 0.60);
        let noise = vec![0.002_f32; 16000 * 3];
        assert!(!vad.evaluate(&noise, 16000));
        assert!(!vad.has_detected_speech());
    }

    #[test]
    fn continuous_speech_does_not_trigger_silence() {
        let mut vad = SimpleVad::new(1200, 0.60);
        let speech = vec![0.08_f32; 16000 * 2];
        assert!(!vad.evaluate(&speech, 16000));
        assert!(vad.has_detected_speech());
    }

    #[test]
    fn speech_followed_by_silence_triggers_eou() {
        let mut vad = SimpleVad::new(200, 0.60);
        vad.min_speech_duration = Duration::from_millis(100);

        let mut audio = vec![0.08_f32; 16000 * 400 / 1000];
        assert!(!vad.evaluate(&audio, 16000));
        assert!(vad.has_detected_speech());

        audio.extend(vec![0.001_f32; 16000 * 300 / 1000]);
        assert!(vad.evaluate(&audio, 16000));
    }

    #[test]
    fn speech_followed_by_fan_noise_triggers_eou() {
        let mut vad = SimpleVad::new(200, 0.60);
        vad.min_speech_duration = Duration::from_millis(100);

        // Suara vokal manusia (RMS ~0.15)
        let mut audio = vec![0.15_f32; 16000 * 400 / 1000];
        assert!(!vad.evaluate(&audio, 16000));
        assert!(vad.has_detected_speech());

        // Deru kipas angin/laptop di ekor rekaman (RMS ~0.025, yang pada sistem lama gagal karena > 0.018)
        audio.extend(vec![0.025_f32; 16000 * 300 / 1000]);
        assert!(vad.evaluate(&audio, 16000));
    }
}
