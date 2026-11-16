//! Voice Activity Detection (VAD) & End-of-Utterance (EOU) Detection.
//! Mendeteksi kehadiran vokal bicara manusia secara real-time dengan hysteresis energi,
//! hangover smoothing (anti-potong suku kata), dan penjejakan jeda hening adaptif.

use std::time::Duration;

#[allow(dead_code)]
pub struct SimpleVad {
    /// Faktor pengali ambang vokal terhadap noise floor (default ~1.5x)
    pub vad_thold: f32,
    /// Durasi hening untuk memicu End-of-Utterance (default 1600ms)
    pub silence_duration: Duration,
    /// Durasi bicara minimum agar diakui sebagai ujaran valid (default 200ms)
    pub min_speech_duration: Duration,
    /// Ambang energi onset RMS agar vokal mulai diakui
    pub min_speech_rms: f32,
    /// Peak RMS tertinggi yang tercatat saat user berbicara
    pub max_speech_rms: f32,
    /// Estimasi noise floor lingkungan (kipas laptop, desis mic)
    pub noise_floor: f32,
    /// Apakah suara manusia sudah mulai terdeteksi
    has_speech: bool,
}

#[allow(dead_code)]
impl SimpleVad {
    pub fn new(silence_ms: u64, vad_thold: f32) -> Self {
        Self {
            vad_thold,
            silence_duration: Duration::from_millis(silence_ms),
            min_speech_duration: Duration::from_millis(200),
            min_speech_rms: 0.015,
            max_speech_rms: 0.0,
            noise_floor: 0.006,
            has_speech: false,
        }
    }

    /// Evaluasi sampel PCM mono 16kHz (seluruh rekaman buffer yang sedang berjalan).
    /// Mengembalikan `true` jika user telah berbicara dan kemudian berhenti bicara
    /// selama minimal `silence_duration` (End-of-Utterance).
    pub fn evaluate(&mut self, pcm: &[f32], sample_rate: u32) -> bool {
        if pcm.is_empty() || sample_rate == 0 {
            return false;
        }

        let n_samples = pcm.len();
        let frame_samples = (sample_rate as usize * 50) / 1000; // 50ms frame (800 sampel @ 16kHz)
        if frame_samples == 0 || n_samples < frame_samples {
            return false;
        }

        let min_speech_frames = (self.min_speech_duration.as_millis() as usize / 50).max(2);

        // Hysteresis ambang batas:
        // Onset: threshold lebih tinggi untuk memicu deteksi bicara awal (anti false-trigger)
        let onset_threshold = (self.noise_floor * self.vad_thold).max(self.min_speech_rms);
        // Continuation: threshold lebih rendah untuk menjaga kontinuitas bicara saat suku kata pelan
        let continuation_threshold = (self.noise_floor * 1.20).max(self.min_speech_rms * 0.45);

        // Hangover frames (250ms = 5 frames):
        // Mencegah jeda mikro di antara konsonan / jeda nafas pendek memotong timer bicara
        let hangover_frames = 5usize;
        let mut frames_since_speech = hangover_frames + 1;

        let mut speech_frames = 0usize;
        let mut max_speech = 0.0f32;
        let mut last_speech_end = 0usize;
        let mut current_offset = 0usize;

        for chunk in pcm.chunks(frame_samples) {
            let chunk_len = chunk.len();
            if chunk_len < frame_samples / 2 {
                current_offset += chunk_len;
                continue;
            }

            let chunk_rms = calculate_rms(chunk);
            let is_onset = chunk_rms >= onset_threshold;
            let is_continuation = self.has_speech && chunk_rms >= continuation_threshold;

            if is_onset || is_continuation {
                speech_frames += 1;
                frames_since_speech = 0;
                if chunk_rms > max_speech {
                    max_speech = chunk_rms;
                }
                last_speech_end = current_offset + chunk_len;
            } else if frames_since_speech < hangover_frames && speech_frames >= min_speech_frames {
                // Di dalam jendela hangover setelah bicara aktif:
                // Masih dihitung sebagai bagian dari kalimat yang sedang diucapkan
                frames_since_speech += 1;
                last_speech_end = current_offset + chunk_len;
            } else {
                frames_since_speech += 1;
                if speech_frames == 0 {
                    // Adaptasi noise floor awal sebelum bicara dimulai
                    if chunk_rms < self.noise_floor {
                        self.noise_floor = self.noise_floor * 0.85 + chunk_rms * 0.15;
                    } else {
                        self.noise_floor = self.noise_floor * 0.98 + chunk_rms * 0.02;
                    }
                }
            }

            current_offset += chunk_len;
        }

        if speech_frames >= min_speech_frames {
            self.has_speech = true;
            if max_speech > self.max_speech_rms {
                self.max_speech_rms = max_speech;
            }
        }

        if !self.has_speech {
            return false;
        }

        let silence_samples_elapsed = n_samples.saturating_sub(last_speech_end);
        let required_silence_samples =
            (sample_rate as usize * self.silence_duration.as_millis() as usize) / 1000;

        silence_samples_elapsed >= required_silence_samples
    }

    pub fn has_detected_speech(&self) -> bool {
        self.has_speech
    }

    pub fn reset(&mut self) {
        self.has_speech = false;
        self.max_speech_rms = 0.0;
        self.noise_floor = 0.006;
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
        let mut vad = SimpleVad::new(1600, 1.5);
        assert!(!vad.evaluate(&[], 16000));
        assert!(!vad.has_detected_speech());
    }

    #[test]
    fn pure_noise_floor_does_not_trigger() {
        let mut vad = SimpleVad::new(1600, 1.5);
        let noise = vec![0.003_f32; 16000 * 3];
        assert!(!vad.evaluate(&noise, 16000));
        assert!(!vad.has_detected_speech());
    }

    #[test]
    fn continuous_speech_does_not_trigger_silence() {
        let mut vad = SimpleVad::new(1600, 1.5);
        let speech = vec![0.06_f32; 16000 * 2];
        assert!(!vad.evaluate(&speech, 16000));
        assert!(vad.has_detected_speech());
    }

    #[test]
    fn speech_followed_by_silence_triggers_eou() {
        let mut vad = SimpleVad::new(1600, 1.5);
        vad.min_speech_duration = Duration::from_millis(150);

        // 800ms bicara vokal (RMS 0.08)
        let mut audio = vec![0.08_f32; 16000 * 800 / 1000];
        assert!(!vad.evaluate(&audio, 16000));
        assert!(vad.has_detected_speech());

        // Diikuti 1900ms hening (> 1600ms silence + 250ms hangover)
        audio.extend(vec![0.001_f32; 16000 * 1900 / 1000]);
        assert!(vad.evaluate(&audio, 16000));
    }

    #[test]
    fn speech_followed_by_fan_noise_triggers_eou() {
        let mut vad = SimpleVad::new(1600, 1.5);
        vad.min_speech_duration = Duration::from_millis(150);

        // 1200ms bicara vokal (RMS 0.07)
        let mut audio = vec![0.07_f32; 16000 * 1200 / 1000];
        assert!(!vad.evaluate(&audio, 16000));
        assert!(vad.has_detected_speech());

        // Diikuti 1900ms deru kipas angin laptop (RMS 0.005)
        audio.extend(vec![0.005_f32; 16000 * 1900 / 1000]);
        assert!(vad.evaluate(&audio, 16000));
    }

    #[test]
    fn brief_pause_within_sentence_does_not_prematurely_trigger() {
        let mut vad = SimpleVad::new(1600, 1.5);
        vad.min_speech_duration = Duration::from_millis(150);

        // 800ms bicara vokal awal
        let mut audio = vec![0.08_f32; 16000 * 800 / 1000];
        // 600ms jeda nafas/berpikir sejenak (< 1600ms)
        audio.extend(vec![0.002_f32; 16000 * 600 / 1000]);

        assert!(!vad.evaluate(&audio, 16000));
        assert!(vad.has_detected_speech());

        // Lanjut bicara vokal 800ms lagi
        audio.extend(vec![0.08_f32; 16000 * 800 / 1000]);
        assert!(!vad.evaluate(&audio, 16000));

        // Baru berhenti hening 1900ms
        audio.extend(vec![0.002_f32; 16000 * 1900 / 1000]);
        assert!(vad.evaluate(&audio, 16000));
    }

    #[test]
    fn soft_consonant_closure_does_not_prematurely_trigger() {
        let mut vad = SimpleVad::new(1600, 1.5);
        vad.min_speech_duration = Duration::from_millis(150);

        let mut audio = Vec::new();
        // Vokal 300ms (RMS 0.07)
        audio.extend(vec![0.07_f32; 16000 * 300 / 1000]);
        // Konsonan stop closure 120ms (RMS 0.004)
        audio.extend(vec![0.004_f32; 16000 * 1200 / 10000]);
        // Vokal kelanjutan 300ms (RMS 0.05)
        audio.extend(vec![0.05_f32; 16000 * 300 / 1000]);

        // Belum hening
        assert!(!vad.evaluate(&audio, 16000));
        assert!(vad.has_detected_speech());
    }
}
