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

/// Pipeline lengkap: mono → 16 kHz.
pub fn to_whisper_pcm(input: &[f32], channels: usize, rate: u32) -> Vec<f32> {
    let mono = to_mono(input, channels);
    resample(&mono, rate, 16_000)
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
}
