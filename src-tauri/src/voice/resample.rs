//! Konversi audio ke format input Whisper: mono + 16 kHz f32 PCM.

/// Gabung multi-channel menjadi mono (rata-rata per frame).
pub fn to_mono(input: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 || input.is_empty() {
        return input.to_vec();
    }
    input
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

/// Resample linear. Untuk speech-to-text kualitas linear interpolation cukup;
/// ratio bulat (48k→16k) tetap akurat karena grid jatuh rapi pada mayoritas titik.
pub fn resample(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || input.is_empty() || from_rate == 0 || to_rate == 0 {
        return input.to_vec();
    }
    let ratio = f64::from(from_rate) / f64::from(to_rate);
    let out_len = ((input.len() as f64 - 1.0) / ratio).floor() as usize + 1;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let i0 = src.floor() as usize;
        let i1 = (i0 + 1).min(input.len() - 1);
        let frac = src - i0 as f64;
        let a = f64::from(input[i0]);
        let b = f64::from(input[i1]);
        out.push((a + (b - a) * frac) as f32);
    }
    out
}

/// High-Pass Filter 80 Hz (1-pole IIR) untuk memotong dengungan getaran meja & kipas pendingin laptop.
pub fn high_pass_filter(pcm: &mut [f32], sample_rate: u32, cutoff_hz: f32) {
    if pcm.is_empty() || sample_rate == 0 {
        return;
    }
    let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff_hz);
    let dt = 1.0 / sample_rate as f32;
    let alpha = rc / (rc + dt);

    let mut prev_input = pcm[0];
    let mut prev_output = pcm[0];

    for sample in pcm.iter_mut() {
        let input = *sample;
        let output = alpha * (prev_output + input - prev_input);
        prev_input = input;
        prev_output = output;
        *sample = output;
    }
}

/// Normalisasi volume audio agar berada pada level optimal untuk Whisper (~0.85 peak).
/// Mencegah suara pelan dari microphone terabaikan atau salah tebak oleh Whisper.
pub fn normalize_volume(pcm: &mut [f32]) {
    if pcm.is_empty() {
        return;
    }
    let peak = pcm.iter().map(|&x| x.abs()).fold(0.0_f32, f32::max);
    // Hanya naikkan jika suara terdeteksi (> 0.005) dan belum optimal (< 0.80)
    // Dibatasi penguatan maksimal 12x (sekitar +21 dB) untuk mencegah noise statis ekstrem meledak.
    if peak > 0.005 && peak < 0.80 {
        let gain = (0.85 / peak).min(12.0);
        for sample in pcm.iter_mut() {
            *sample = (*sample * gain).clamp(-1.0, 1.0);
        }
    }
}

/// Pangkas hening di awal dan akhir rekaman menggunakan deteksi energi (VAD berbasis RMS).
/// Mengutamakan suara terdekat (Close-talk near-field speech) dan memblokir noise latar.
pub fn trim_silence(pcm: &[f32], sample_rate: u32) -> Vec<f32> {
    if pcm.is_empty() || sample_rate == 0 {
        return pcm.to_vec();
    }
    let frame_size = (sample_rate as usize * 25) / 1000; // 25ms per frame (400 samples @ 16kHz)
    if pcm.len() < frame_size * 4 {
        return pcm.to_vec();
    }

    let mut energies = Vec::new();
    for chunk in pcm.chunks(frame_size) {
        let sum_sq: f32 = chunk.iter().map(|&x| x * x).sum();
        let rms = (sum_sq / chunk.len() as f32).sqrt();
        energies.push(rms);
    }

    // Estimasi noise floor dari 100ms pertama (4 frame)
    let noise_frames = energies.len().min(4);
    let noise_floor = energies[..noise_frames]
        .iter()
        .copied()
        .fold(0.0_f32, f32::max)
        .max(0.005);
    // Ambang batas isolasi suara terdekat: 2.6x dari noise floor atau minimal 0.022
    let speech_threshold = (noise_floor * 2.6).max(0.022);

    let start_frame = energies.iter().position(|&e| e >= speech_threshold);
    let end_frame = energies.iter().rposition(|&e| e >= speech_threshold);

    match (start_frame, end_frame) {
        (Some(start), Some(end)) if start <= end => {
            // Padding ~250ms (10 frame) sebelum start dan sesudah end
            let pad_frames = (sample_rate as usize * 250) / (1000 * frame_size);
            let start_idx = start.saturating_sub(pad_frames) * frame_size;
            let end_idx = ((end + 1 + pad_frames) * frame_size).min(pcm.len());
            pcm[start_idx..end_idx].to_vec()
        }
        _ => pcm.to_vec(),
    }
}

/// Pipeline evaluasi VAD: multi-channel → mono → 16 kHz → High-Pass 130Hz (meredam gemuruh kipas laptop & hembusan angin).
pub fn to_vad_pcm(input: &[f32], channels: usize, rate: u32) -> Vec<f32> {
    let mono = to_mono(input, channels);
    let mut resampled = resample(&mono, rate, 16_000);
    high_pass_filter(&mut resampled, 16_000, 130.0);
    normalize_volume(&mut resampled);
    resampled
}

/// Pipeline lengkap: multi-channel → mono → 16 kHz → High-Pass 130Hz → normalisasi volume → pangkas hening.
pub fn to_whisper_pcm(input: &[f32], channels: usize, rate: u32) -> Vec<f32> {
    let mono = to_mono(input, channels);
    let mut resampled = resample(&mono, rate, 16_000);
    high_pass_filter(&mut resampled, 16_000, 130.0);
    normalize_volume(&mut resampled);
    trim_silence(&resampled, 16_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stereo_to_mono_averages_channels() {
        let input = [1.0, 0.0, 0.5, 0.5, -1.0, 1.0];
        let mono = to_mono(&input, 2);
        assert_eq!(mono, vec![0.5, 0.5, 0.0]);
    }

    #[test]
    fn mono_passthrough_when_single_channel() {
        let input = vec![0.25, -0.75];
        assert_eq!(to_mono(&input, 1), input);
    }

    #[test]
    fn downsample_48k_to_16k_triples_length_division() {
        let input = vec![0.0_f32; 48_000];
        let out = resample(&input, 48_000, 16_000);
        assert!((out.len() as i64 - 16_000).abs() <= 2);
    }

    #[test]
    fn same_rate_returns_equal_samples() {
        let input = vec![0.1, 0.2, 0.3];
        assert_eq!(resample(&input, 44_100, 44_100), input);
    }

    #[test]
    fn constant_signal_survives_resampling() {
        let input = vec![0.5_f32; 9_600]; // 200 ms @ 48k
        let out = resample(&input, 48_000, 16_000);
        assert!(out.iter().all(|&v| (v - 0.5).abs() < 1e-6));
    }

    #[test]
    fn empty_input_stays_empty() {
        assert!(to_whisper_pcm(&[], 2, 48_000).is_empty());
    }

    #[test]
    fn normalize_volume_boosts_quiet_speech() {
        let mut audio = vec![0.05_f32, -0.10_f32, 0.08_f32];
        normalize_volume(&mut audio);
        let peak = audio.iter().map(|&x| x.abs()).fold(0.0_f32, f32::max);
        assert!((peak - 0.85).abs() < 1e-4);
    }

    #[test]
    fn normalize_volume_does_not_boost_pure_noise_floor() {
        let mut noise = vec![0.001_f32; 100];
        normalize_volume(&mut noise);
        assert_eq!(noise[0], 0.001_f32);
    }
}
