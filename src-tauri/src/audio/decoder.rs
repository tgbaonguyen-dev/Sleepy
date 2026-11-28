//! Giải mã âm thanh thuần Rust (Symphonia) và tổng hợp tiếng ồn nâu/hồng.

use std::f32::consts::FRAC_PI_2;
use std::fs::File;
use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub const TARGET_SAMPLE_RATE: u32 = 44_100;
pub const TARGET_CHANNELS: usize = 2;

/// Giải mã tệp âm thanh (`.mp3`, `.ogg`, `.wav`) thành PCM stereo `f32` ở 44.1 kHz.
pub fn decode_stereo_f32(path: &Path) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|e| format!("Không mở được {}: {e}", path.display()))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Không đọc được định dạng {}: {e}", path.display()))?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| format!("Không tìm thấy track âm thanh trong {}", path.display()))?;
    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Không khởi tạo được bộ giải mã cho {}: {e}", path.display()))?;

    let mut src_rate = codec_params.sample_rate.unwrap_or(TARGET_SAMPLE_RATE);
    let mut pcm = Vec::new();
    let mut sample_buf: Option<SampleBuffer<f32>> = None;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(SymphoniaError::IoError(ref err)) if err.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(e) => return Err(format!("Lỗi đọc gói âm thanh {}: {e}", path.display())),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(format!("Lỗi giải mã {}: {e}", path.display())),
        };

        let spec = *decoded.spec();
        src_rate = spec.rate;
        let src_channels = spec.channels.count().max(1);

        let capacity = decoded.capacity() as u64;
        let buf = sample_buf.get_or_insert_with(|| SampleBuffer::<f32>::new(capacity, spec));
        if buf.capacity() < decoded.frames() * src_channels {
            *buf = SampleBuffer::<f32>::new(capacity, spec);
        }
        buf.copy_interleaved_ref(decoded);
        push_as_stereo(buf.samples(), src_channels, &mut pcm);
    }

    if pcm.is_empty() {
        return Err(format!("Tệp {} không có dữ liệu âm thanh", path.display()));
    }

    if src_rate != TARGET_SAMPLE_RATE {
        Ok(resample_stereo(&pcm, src_rate, TARGET_SAMPLE_RATE))
    } else {
        Ok(pcm)
    }
}

fn push_as_stereo(samples: &[f32], channels: usize, out: &mut Vec<f32>) {
    match channels {
        1 => {
            out.reserve(samples.len() * 2);
            for &s in samples {
                out.push(s);
                out.push(s);
            }
        }
        2 => out.extend_from_slice(samples),
        n => {
            out.reserve((samples.len() / n) * 2);
            for frame in samples.chunks_exact(n) {
                out.push(frame[0]);
                out.push(frame[1]);
            }
        }
    }
}

fn resample_stereo(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    let in_frames = input.len() / TARGET_CHANNELS;
    if in_frames < 2 || from_rate == to_rate {
        return input.to_vec();
    }
    let out_frames = ((in_frames as u64 * to_rate as u64) / from_rate as u64) as usize;
    let mut out = Vec::with_capacity(out_frames * TARGET_CHANNELS);
    let ratio = from_rate as f64 / to_rate as f64;

    for i in 0..out_frames {
        let pos = i as f64 * ratio;
        let idx = (pos as usize).min(in_frames - 2);
        let frac = (pos - idx as f64) as f32;
        let base = idx * TARGET_CHANNELS;
        let next = base + TARGET_CHANNELS;
        out.push(input[base] + (input[next] - input[base]) * frac);
        out.push(input[base + 1] + (input[next + 1] - input[base + 1]) * frac);
    }
    out
}

/// Crossfade đoạn cuối vào đầu để vòng lặp không bị khựng mối nối.
pub fn seam_crossfade(samples: Vec<f32>, fade_secs: f32) -> Vec<f32> {
    let total_frames = samples.len() / TARGET_CHANNELS;
    let fade_frames = ((fade_secs * TARGET_SAMPLE_RATE as f32).round() as usize).min(total_frames / 3);
    if fade_frames < 64 {
        return samples;
    }

    let loop_frames = total_frames - fade_frames;
    let mut out = samples[..loop_frames * TARGET_CHANNELS].to_vec();

    for i in 0..fade_frames {
        let t = i as f32 / fade_frames as f32;
        let head_gain = (t * FRAC_PI_2).sin();
        let tail_gain = (t * FRAC_PI_2).cos();
        for ch in 0..TARGET_CHANNELS {
            let head = samples[i * TARGET_CHANNELS + ch];
            let tail = samples[(loop_frames + i) * TARGET_CHANNELS + ch];
            out[i * TARGET_CHANNELS + ch] = head * head_gain + tail * tail_gain;
        }
    }
    out
}

/// Sinh tiếng ồn nâu (Brown Noise) stereo 12 giây, đã khử DC và nối vòng mượt.
pub fn generate_brown_noise(seconds: usize) -> Vec<f32> {
    let frames = TARGET_SAMPLE_RATE as usize * seconds;
    let mut samples = vec![0.0_f32; frames * TARGET_CHANNELS];
    let mut rng = XorShift64::new(0x5EED_B40A_1234_5678);

    for ch in 0..TARGET_CHANNELS {
        let mut b = 0.0_f32;
        let mut hp = 0.0_f32;
        let mut prev = 0.0_f32;
        for i in 0..frames {
            let white = rng.next_signed();
            b = (b + 0.02 * white) / 1.02;
            hp = 0.999 * (hp + b - prev);
            prev = b;
            samples[i * TARGET_CHANNELS + ch] = (hp * 0.98).clamp(-1.0, 1.0);
        }
    }
    seam_crossfade(samples, 2.0)
}

/// Sinh tiếng ồn hồng (Pink Noise) stereo 12 giây bằng bộ lọc Paul Kellet.
pub fn generate_pink_noise(seconds: usize) -> Vec<f32> {
    let frames = TARGET_SAMPLE_RATE as usize * seconds;
    let mut samples = vec![0.0_f32; frames * TARGET_CHANNELS];
    let mut rng = XorShift64::new(0x5EED_F1A6_9876_5432);

    for ch in 0..TARGET_CHANNELS {
        let (mut b0, mut b1, mut b2, mut b3, mut b4, mut b5, mut b6) =
            (0.0_f32, 0.0_f32, 0.0_f32, 0.0_f32, 0.0_f32, 0.0_f32, 0.0_f32);
        for i in 0..frames {
            let white = rng.next_signed();
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.153_852;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            let pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;
            samples[i * TARGET_CHANNELS + ch] = (pink * 0.055).clamp(-1.0, 1.0);
        }
    }
    seam_crossfade(samples, 2.0)
}

/// Sinh tiếng ồn trắng (White Noise) stereo êm nhẹ, đã nối vòng mượt.
pub fn generate_white_noise(seconds: usize) -> Vec<f32> {
    let frames = TARGET_SAMPLE_RATE as usize * seconds;
    let mut samples = vec![0.0_f32; frames * TARGET_CHANNELS];
    let mut rng = XorShift64::new(0x5EED_FFFF_2468_1357);

    for sample in &mut samples {
        *sample = (rng.next_signed() * 0.22).clamp(-1.0, 1.0);
    }
    seam_crossfade(samples, 2.0)
}

struct XorShift64(u64);

impl XorShift64 {
    fn new(seed: u64) -> Self {
        Self(seed.max(1))
    }

    fn next_signed(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        ((x >> 40) as f32 / ((1_u32 << 24) as f32)) * 2.0 - 1.0
    }
}
