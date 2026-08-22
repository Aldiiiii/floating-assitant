//! Capture microphone via cpal. Semua format sample dikonversi manual ke f32
//! agar tidak bergantung pada trait konversi yang berubah antar versi.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

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

fn build_stream<T: cpal::SizedSample + 'static>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    buf: &Arc<Mutex<Vec<f32>>>,
    convert: fn(T) -> f32,
) -> Result<cpal::Stream, String> {
    let buf = buf.clone();
    device
        .build_input_stream(
            config.clone(),
            move |data: &[T], _| push_converted(data, &buf, convert),
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
    pub fn start(device_name: Option<&str>) -> Result<Recorder, String> {
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
                build_stream::<f32>(&device, &stream_config, &samples, |v| v)
            }
            cpal::SampleFormat::I16 => {
                build_stream::<i16>(&device, &stream_config, &samples, |v| v as f32 / 32_768.0)
            }
            cpal::SampleFormat::U16 => {
                build_stream::<u16>(&device, &stream_config, &samples, |v| {
                    (f32::from(v) - 32_768.0) / 32_768.0
                })
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
