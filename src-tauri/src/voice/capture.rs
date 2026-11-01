//! Capture microphone via cpal. Semua format sample dikonversi manual ke f32
//! agar tidak bergantung pada trait konversi yang berubah antar versi.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Emitter};

pub struct Recording {
    pub samples: Vec<f32>,
    pub channels: usize,
    pub rate: u32,
    pub duration: Duration,
}

pub struct Recorder {
    stream: cpal::Stream,
    samples: Arc<Mutex<Vec<f32>>>,
    channels: usize,
    rate: u32,
    started: Instant,
}

fn push_converted<T: Copy>(data: &[T], buf: &Arc<Mutex<Vec<f32>>>, convert: fn(T) -> f32) {
    if let Ok(mut b) = buf.lock() {
        b.extend(data.iter().map(|&v| convert(v)));
    }
}

struct MeterEmitter {
    meter: AudioLevelMeter,
    last_emit: Instant,
}

/// Meter level audio dengan 130Hz High-Pass Filter (HPF), adaptasi dinamis noise floor,
/// dan noise gate berbasis sensitivitas.
pub struct AudioLevelMeter {
    alpha: f32,
    hp_prev_in: f32,
    hp_prev_out: f32,
    noise_floor: f32,
    min_gate: f32,
    noise_mult: f32,
}

impl AudioLevelMeter {
    pub fn new(sample_rate: f32, sensitivity: Option<&str>) -> Self {
        let cutoff = 130.0f32; // Cutoff 130Hz untuk meredam gemuruh kipas laptop dan hembusan angin
        let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff);
        let dt = 1.0 / sample_rate.max(8000.0);
        let alpha = rc / (rc + dt);

        let (min_gate, noise_mult) = match sensitivity {
            Some("low") => (0.012f32, 2.0f32),  // Rendah (Ruangan Bising / Deru Kipas Laptop)
            Some("high") => (0.003f32, 1.3f32), // Tinggi (Ruangan Sunyi)
            _ => (0.006f32, 1.6f32),            // Sedang (Normal - Bawaan)
        };

        Self {
            alpha,
            hp_prev_in: 0.0,
            hp_prev_out: 0.0,
            noise_floor: 0.008,
            min_gate,
            noise_mult,
        }
    }

    /// Memproses kumpulan sampel audio dan menghasilkan nilai visual meter (0.0 .. 1.0)
    pub fn process_frame(&mut self, samples: impl IntoIterator<Item = f32>) -> f32 {
        let mut sum_sq = 0.0f32;
        let mut count = 0usize;

        for input in samples {
            let filtered = self.alpha * (self.hp_prev_out + input - self.hp_prev_in);
            self.hp_prev_in = input;
            self.hp_prev_out = filtered;
            sum_sq += filtered * filtered;
            count += 1;
        }

        if count == 0 {
            return 0.0;
        }

        let rms = (sum_sq / count as f32).sqrt();

        // Adaptasi noise floor dinamis:
        // Menyesuaikan otomatis dengan kebisingan ruangan (kipas laptop, AC kantor)
        if rms < self.noise_floor {
            self.noise_floor = self.noise_floor * 0.85 + rms * 0.15;
        } else {
            self.noise_floor = self.noise_floor * 0.992 + rms * 0.008;
        }

        // Noise gate: potong kebisingan yang berada di bawah atau setara noise floor
        let gate = (self.noise_floor * self.noise_mult).max(self.min_gate);
        let effective_rms = if rms > gate {
            rms - self.noise_floor * 0.85
        } else {
            0.0
        };

        ((effective_rms * 8.5).clamp(0.0, 1.0) * 100.0).round() / 100.0
    }
}

fn build_stream<T: cpal::SizedSample + 'static>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    buf: &Arc<Mutex<Vec<f32>>>,
    convert: fn(T) -> f32,
    app: AppHandle,
    sensitivity: Option<&str>,
) -> Result<cpal::Stream, String> {
    let buf = buf.clone();
    let meter = Arc::new(Mutex::new(MeterEmitter {
        meter: AudioLevelMeter::new(config.sample_rate as f32, sensitivity),
        last_emit: Instant::now(),
    }));

    device
        .build_input_stream(
            config.clone(),
            move |data: &[T], _| {
                push_converted(data, &buf, convert);
                if let Ok(mut emitter) = meter.lock() {
                    if emitter.last_emit.elapsed() >= Duration::from_millis(45) {
                        emitter.last_emit = Instant::now();
                        let level = emitter.meter.process_frame(data.iter().map(|&v| convert(v)));
                        let _ = app.emit("voice-audio-level", level);
                    }
                }
            },
            |err| eprintln!("audio input error: {err}"),
            None,
        )
        .map_err(map_open_error)
}

fn map_open_error(e: cpal::Error) -> String {
    match e.kind() {
        cpal::ErrorKind::PermissionDenied => {
            "Akses microphone ditolak oleh sistem.\n\nAktifkan izin microphone \
             untuk aplikasi ini di pengaturan OS."
                .to_string()
        }
        cpal::ErrorKind::DeviceNotAvailable | cpal::ErrorKind::HostUnavailable => {
            "Microphone tidak tersedia.\n\nPastikan microphone terpasang dan \
             audio subsystem berjalan.".to_string()
        }
        cpal::ErrorKind::DeviceBusy => {
            "Microphone sedang dipakai aplikasi lain.\n\nTutup aplikasi tersebut \
             lalu coba lagi.".to_string()
        }
        _ => format!("Gagal membuka microphone: {e}"),
    }
}

/// Cari device input berdasarkan nama; tanpa nama → default sistem.
/// Nama tersimpan tapi device dicabut → error eksplisit (user in control).
fn resolve_input_device(name: Option<&str>) -> Result<(cpal::Device, String), String> {
    let host = cpal::default_host();

    if let Some(want) = name.map(str::trim).filter(|s| !s.is_empty()) {
        let devices = host
            .input_devices()
            .map_err(|e| format!("Gagal enumerasi microphone: {e}"))?;
        for d in devices {
            let n = match d.description() {
                Ok(desc) => desc.name().to_string(),
                Err(_) => continue,
            };
            if n == want {
                return Ok((d, n));
            }
        }
        return Err(format!(
            "Microphone \"{want}\" tidak ditemukan.\n\nPeriksa koneksi perangkat \
             atau pilih microphone lain di Pengaturan → Voice."
        ));
    }

    let default = host
        .default_input_device()
        .ok_or("Tidak ada microphone terdeteksi pada perangkat ini.")?;
    let name = default.description().map(|d| d.name().to_string()).unwrap_or_else(|_| "Default".into());
    Ok((default, name))
}

impl Recorder {
    pub fn start(
        app: AppHandle,
        device_name: Option<&str>,
        sensitivity: Option<&str>,
    ) -> Result<Recorder, String> {
        let (device, _resolved_name) = resolve_input_device(device_name)?;
        let supported = device
            .default_input_config()
            .map_err(|e| format!("Gagal membaca konfigurasi microphone: {e}"))?;

        let rate = supported.sample_rate();
        let channels = usize::from(supported.channels());
        let stream_config: cpal::StreamConfig = supported.clone().into();
        let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
        let fmt = supported.sample_format();

        let stream = match fmt {
            cpal::SampleFormat::F32 => {
                build_stream::<f32>(&device, &stream_config, &samples, |v| v, app, sensitivity)
            }
            cpal::SampleFormat::I16 => {
                build_stream::<i16>(&device, &stream_config, &samples, |v| v as f32 / 32_768.0, app, sensitivity)
            }
            cpal::SampleFormat::U16 => {
                build_stream::<u16>(&device, &stream_config, &samples, |v| {
                    (f32::from(v) - 32_768.0) / 32_768.0
                }, app, sensitivity)
            }
            other => {
                return Err(format!(
                    "Format sample microphone tidak didukung: {other:?}"
                ))
            }
        }?;

        stream.play().map_err(|e| format!("Gagal memulai microphone: {e}"))?;

        Ok(Recorder {
            stream,
            samples,
            channels,
            rate,
            started: Instant::now(),
        })
    }

    /// Akses handle buffer sample untuk live streaming snapshot.
    pub fn samples_handle(&self) -> (Arc<Mutex<Vec<f32>>>, usize, u32) {
        (self.samples.clone(), self.channels, self.rate)
    }

    /// Hentikan recording dan ambil hasil PCM mentah (masih native rate).
    pub fn stop(self) -> Recording {
        let samples = self.samples.lock().map(|b| b.clone()).unwrap_or_default();
        drop(self.stream);
        Recording {
            samples,
            channels: self.channels,
            rate: self.rate,
            duration: self.started.elapsed(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_level_meter_silence() {
        let mut meter = AudioLevelMeter::new(16000.0, Some("normal"));
        let silence = vec![0.0f32; 720];
        let level = meter.process_frame(silence);
        assert_eq!(level, 0.0);
    }

    #[test]
    fn test_audio_level_meter_low_noise_cut() {
        let mut meter = AudioLevelMeter::new(16000.0, Some("low"));
        // Low amplitude steady background noise (amplitude ~0.005)
        let noise = vec![0.005f32; 720];
        let level = meter.process_frame(noise);
        // Gate harus memotong noise ini ke 0.0
        assert_eq!(level, 0.0);
    }

    #[test]
    fn test_audio_level_meter_speech_signal() {
        let mut meter = AudioLevelMeter::new(16000.0, Some("normal"));
        // Simulasi gelombang vokal (frekuensi ~500Hz, amplitudo 0.25)
        let speech: Vec<f32> = (0..720)
            .map(|i| (i as f32 * 0.2).sin() * 0.25)
            .collect();
        let level = meter.process_frame(speech);
        assert!(level > 0.0, "Sinyal suara harus menghasilkan level > 0.0");
    }
}
