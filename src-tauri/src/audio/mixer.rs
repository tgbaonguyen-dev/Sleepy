//! Bộ trộn âm thanh nền đa kênh chạy trên luồng riêng, xuất PCM qua PipeWire/PulseAudio.
//! Hỗ trợ: Swell (dao động âm lượng), L/R Panning, Shuffle Mix, Playlist Lo-Fi + thư mục nhạc cá nhân.

use std::collections::{HashMap, HashSet};
use std::f32::consts::{FRAC_PI_4, TAU};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};

use serde::Serialize;

use super::catalog::{
    find_channel, find_preset_mix, ChannelKind, PresetMixSpec, CHANNEL_SPECS, LOFI_TRACKS, PRESET_MIXES,
};
use super::decoder::{
    decode_stereo_f32, generate_brown_noise, generate_pink_noise, generate_white_noise, seam_crossfade,
    TARGET_CHANNELS, TARGET_SAMPLE_RATE,
};

const CHUNK_FRAMES: usize = 2048;
const BOOST: f32 = 1.35;
const GAIN_STEP: f32 = 0.08;
const SWELL_PERIOD_SECS: f32 = 12.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub custom: bool,
}

#[derive(Debug, Clone)]
struct TrackEntry {
    info: TrackInfo,
    path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelView {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub category: String,
    pub art: String,
    pub active: bool,
    pub loading: bool,
    pub volume: f32,
    pub pan: f32,
    pub swell: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LofiLoopMode {
    All,
    One,
    Shuffle,
}

impl LofiLoopMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::One => "one",
            Self::Shuffle => "shuffle",
        }
    }

    pub fn next(self) -> Self {
        match self {
            Self::All => Self::One,
            Self::One => Self::Shuffle,
            Self::Shuffle => Self::All,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStateSnapshot {
    pub playing: bool,
    pub master: f32,
    pub fade_minutes: u32,
    pub fade_level: f32,
    pub fading: bool,
    pub stopped_by_timer: bool,
    pub active_preset_id: Option<String>,
    pub lofi_track: Option<TrackInfo>,
    pub lofi_tracks: Vec<TrackInfo>,
    pub lofi_progress: f32,
    pub lofi_loop_mode: String,
    pub error: Option<String>,
    pub channels: Vec<ChannelView>,
    pub presets: &'static [PresetMixSpec],
}

pub enum AudioCmd {
    TogglePlay,
    SetPlaying(bool),
    ToggleChannel(String),
    SetVolume(String, f32),
    SetPan(String, f32),
    ToggleSwell(String),
    SetMaster(f32),
    SetFadeMinutes(u32),
    ApplyPreset(String),
    ApplyCustomMix {
        id: String,
        channels: Vec<(String, f32)>,
    },
    ShuffleMix,
    ClearAll,
    SkipLofi,
    PrevLofi,
    SelectLofiTrack(String),
    SeekLofi(f32),
    CycleLofiLoop,
    AddCustomDir(PathBuf),
    AddCustomFiles(Vec<PathBuf>),
    RemoveCustomTrack(String),
    SyncTimer {
        remaining_ms: Option<i64>,
        active: bool,
    },
    Loaded {
        key: String,
        result: Result<Arc<Vec<f32>>, String>,
    },
    Shutdown,
}

struct ChannelRuntime {
    active: bool,
    volume: f32,
    pan: f32,
    swell: bool,
    swell_phase: f32,
    current_gain: f32,
    loading: bool,
    cursor: usize,
    buffer: Option<Arc<Vec<f32>>>,
}

struct LofiState {
    tracks: Vec<TrackEntry>,
    current_idx: usize,
    loop_mode: LofiLoopMode,
    seed: u64,
}

impl LofiState {
    fn new(sounds_dir: &Path) -> Self {
        let tracks = LOFI_TRACKS
            .iter()
            .map(|t| TrackEntry {
                info: TrackInfo {
                    id: t.id.to_string(),
                    title: t.title.to_string(),
                    artist: t.artist.to_string(),
                    custom: false,
                },
                path: sounds_dir.join(t.file),
            })
            .collect();
        Self {
            tracks,
            current_idx: 0,
            loop_mode: LofiLoopMode::All,
            seed: 0x10F1_2026_CAFE_BABE,
        }
    }

    fn current(&self) -> Option<&TrackEntry> {
        self.tracks.get(self.current_idx)
    }

    fn next(&mut self) {
        if self.tracks.is_empty() {
            return;
        }
        if self.loop_mode == LofiLoopMode::Shuffle && self.tracks.len() > 1 {
            self.seed = self
                .seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let mut idx = ((self.seed >> 32) as usize) % self.tracks.len();
            if idx == self.current_idx {
                idx = (idx + 1) % self.tracks.len();
            }
            self.current_idx = idx;
        } else {
            self.current_idx = (self.current_idx + 1) % self.tracks.len();
        }
    }

    fn prev(&mut self) {
        if !self.tracks.is_empty() {
            self.current_idx = (self.current_idx + self.tracks.len() - 1) % self.tracks.len();
        }
    }

    fn select(&mut self, id: &str) -> bool {
        if let Some(pos) = self.tracks.iter().position(|t| t.info.id == id) {
            self.current_idx = pos;
            true
        } else {
            false
        }
    }

    fn add_files(&mut self, files: &[PathBuf]) -> usize {
        let existing: HashSet<PathBuf> = self.tracks.iter().map(|t| t.path.clone()).collect();
        let mut added = 0;
        for path in files {
            let is_audio = path.is_file()
                && path
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "mp3" | "ogg" | "wav"));
            if !is_audio || existing.contains(path) {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Nhạc cá nhân")
                .replace(['-', '_'], " ");
            let id = format!("custom:{}", path.to_string_lossy());
            self.tracks.push(TrackEntry {
                info: TrackInfo {
                    id,
                    title: stem,
                    artist: "Nhạc của bạn".to_string(),
                    custom: true,
                },
                path: path.clone(),
            });
            added += 1;
        }
        added
    }

    fn add_dir(&mut self, dir: &Path) -> Result<usize, String> {
        let entries =
            std::fs::read_dir(dir).map_err(|e| format!("Không đọc được thư mục {}: {e}", dir.display()))?;
        let mut files: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
        files.sort();
        Ok(self.add_files(&files))
    }

    fn remove_custom(&mut self, id: &str) -> bool {
        let Some(pos) = self.tracks.iter().position(|t| t.info.custom && t.info.id == id) else {
            return false;
        };
        let was_current = pos == self.current_idx;
        self.tracks.remove(pos);
        if self.tracks.is_empty() || self.current_idx >= self.tracks.len() {
            self.current_idx = 0;
        } else if pos < self.current_idx {
            self.current_idx -= 1;
        }
        was_current
    }
}

struct SinkProcess {
    child: Child,
    stdin: ChildStdin,
}

impl SinkProcess {
    fn spawn() -> Result<Self, String> {
        let rate = TARGET_SAMPLE_RATE.to_string();
        let channels = TARGET_CHANNELS.to_string();

        if let Ok(mut child) = Command::new("pw-play")
            .args([
                "--raw",
                "--latency",
                "150ms",
                "--rate",
                &rate,
                "--channels",
                &channels,
                "--format",
                "s16",
                "--media-category",
                "Playback",
                "--media-role",
                "Music",
                "-",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            if let Some(stdin) = child.stdin.take() {
                return Ok(Self { child, stdin });
            }
            let _ = child.kill();
        }

        let mut child = Command::new("paplay")
            .args([
                "--raw",
                &format!("--rate={rate}"),
                &format!("--channels={channels}"),
                "--format=s16le",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Không khởi động được đầu ra âm thanh (pw-play/paplay): {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Không mở được luồng ghi âm thanh".to_string())?;
        Ok(Self { child, stdin })
    }

    fn write_pcm(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.stdin
            .write_all(bytes)
            .map_err(|e| format!("Lỗi ghi luồng âm thanh: {e}"))
    }

    fn close(mut self) {
        drop(self.stdin);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct MixerEngine {
    sounds_dir: PathBuf,
    playing: bool,
    master: f32,
    fade_minutes: u32,
    fade_level: f32,
    stopped_by_timer: bool,
    had_active_job: bool,
    active_preset_id: Option<String>,
    error: Option<String>,
    channels: HashMap<String, ChannelRuntime>,
    cache: HashMap<String, Arc<Vec<f32>>>,
    inflight: HashSet<String>,
    lofi: LofiState,
    sink: Option<SinkProcess>,
    tx: Sender<AudioCmd>,
    snapshot: Arc<Mutex<AudioStateSnapshot>>,
    on_change: Arc<dyn Fn(AudioStateSnapshot) + Send + Sync>,
    chunk_counter: u32,
}

impl MixerEngine {
    pub fn spawn(
        sounds_dir: PathBuf,
        custom_tracks: Vec<PathBuf>,
        on_change: Arc<dyn Fn(AudioStateSnapshot) + Send + Sync>,
    ) -> (Sender<AudioCmd>, Arc<Mutex<AudioStateSnapshot>>) {
        let (tx, rx) = mpsc::channel();
        let mut engine = Self::new(sounds_dir, custom_tracks, tx.clone(), on_change);
        let snapshot = Arc::clone(&engine.snapshot);
        std::thread::Builder::new()
            .name("sleepy-audio".into())
            .spawn(move || engine.run(rx))
            .expect("không tạo được luồng âm thanh");
        (tx, snapshot)
    }

    fn new(
        sounds_dir: PathBuf,
        custom_tracks: Vec<PathBuf>,
        tx: Sender<AudioCmd>,
        on_change: Arc<dyn Fn(AudioStateSnapshot) + Send + Sync>,
    ) -> Self {
        let mut channels = HashMap::new();
        for spec in CHANNEL_SPECS {
            channels.insert(
                spec.id.to_string(),
                ChannelRuntime {
                    active: spec.id == "rain",
                    volume: 0.75,
                    pan: 0.0,
                    swell: false,
                    swell_phase: 0.0,
                    current_gain: 0.0,
                    loading: false,
                    cursor: 0,
                    buffer: None,
                },
            );
        }

        let mut lofi = LofiState::new(&sounds_dir);
        lofi.add_files(&custom_tracks);
        let engine = Self {
            sounds_dir,
            playing: false,
            master: 0.8,
            fade_minutes: 10,
            fade_level: 1.0,
            stopped_by_timer: false,
            had_active_job: false,
            active_preset_id: None,
            error: None,
            channels,
            cache: HashMap::new(),
            inflight: HashSet::new(),
            lofi,
            sink: None,
            tx,
            snapshot: Arc::new(Mutex::new(AudioStateSnapshot {
                playing: false,
                master: 0.8,
                fade_minutes: 10,
                fade_level: 1.0,
                fading: false,
                stopped_by_timer: false,
                active_preset_id: None,
                lofi_track: None,
                lofi_tracks: Vec::new(),
                lofi_progress: 0.0,
                lofi_loop_mode: "all".into(),
                error: None,
                channels: Vec::new(),
                presets: PRESET_MIXES,
            })),
            on_change,
            chunk_counter: 0,
        };
        let initial = engine.build_snapshot();
        *engine.snapshot.lock().unwrap_or_else(|e| e.into_inner()) = initial;
        engine
    }

    fn run(&mut self, rx: Receiver<AudioCmd>) {
        let mut mix_buf = vec![0.0_f32; CHUNK_FRAMES * TARGET_CHANNELS];
        let mut pcm_bytes = vec![0_u8; CHUNK_FRAMES * TARGET_CHANNELS * 2];

        loop {
            if !self.playing && !self.any_channel_audible() {
                self.close_sink();
                match rx.recv() {
                    Ok(cmd) => {
                        if !self.handle_cmd(cmd) {
                            break;
                        }
                    }
                    Err(_) => break,
                }
                continue;
            }

            while let Ok(cmd) = rx.try_recv() {
                if !self.handle_cmd(cmd) {
                    self.close_sink();
                    return;
                }
            }

            if !self.playing && !self.any_channel_audible() {
                continue;
            }

            self.mix_chunk(&mut mix_buf, &mut pcm_bytes);
            if let Err(err) = self.write_to_sink(&pcm_bytes) {
                self.error = Some(err);
                self.playing = false;
                self.close_sink();
                self.publish_snapshot();
                continue;
            }

            self.chunk_counter = self.chunk_counter.wrapping_add(1);
            if self.chunk_counter % 22 == 0
                && self
                    .channels
                    .get("lofi")
                    .is_some_and(|c| c.active && self.playing)
            {
                self.publish_snapshot();
            }
        }
        self.close_sink();
    }

    fn handle_cmd(&mut self, cmd: AudioCmd) -> bool {
        match cmd {
            AudioCmd::Shutdown => return false,
            AudioCmd::TogglePlay => self.set_playing(!self.playing),
            AudioCmd::SetPlaying(play) => self.set_playing(play),
            AudioCmd::ToggleChannel(id) => self.toggle_channel(&id),
            AudioCmd::SetVolume(id, vol) => {
                if let Some(ch) = self.channels.get_mut(&id) {
                    ch.volume = vol.clamp(0.0, 1.0);
                    self.active_preset_id = None;
                    self.publish_snapshot();
                }
            }
            AudioCmd::SetPan(id, pan) => {
                if let Some(ch) = self.channels.get_mut(&id) {
                    ch.pan = pan.clamp(-1.0, 1.0);
                    self.publish_snapshot();
                }
            }
            AudioCmd::ToggleSwell(id) => {
                if let Some(ch) = self.channels.get_mut(&id) {
                    ch.swell = !ch.swell;
                    ch.swell_phase = 0.0;
                    self.publish_snapshot();
                }
            }
            AudioCmd::SetMaster(vol) => {
                self.master = vol.clamp(0.0, 1.0);
                self.publish_snapshot();
            }
            AudioCmd::SetFadeMinutes(mins) => {
                self.fade_minutes = mins.min(60);
                self.publish_snapshot();
            }
            AudioCmd::ApplyPreset(id) => self.apply_preset(&id),
            AudioCmd::ApplyCustomMix { id, channels } => self.apply_custom_mix(id, &channels),
            AudioCmd::ShuffleMix => self.shuffle_mix(),
            AudioCmd::ClearAll => self.clear_all(),
            AudioCmd::SkipLofi => {
                self.lofi.next();
                self.reload_lofi(false);
            }
            AudioCmd::PrevLofi => {
                self.lofi.prev();
                self.reload_lofi(false);
            }
            AudioCmd::SelectLofiTrack(id) => {
                if self.lofi.select(&id) {
                    self.reload_lofi(true);
                }
            }
            AudioCmd::SeekLofi(ratio) => {
                if let Some(ch) = self.channels.get_mut("lofi") {
                    if let Some(buf) = ch.buffer.as_ref() {
                        let frames = buf.len() / TARGET_CHANNELS;
                        let target_frame = ((ratio.clamp(0.0, 0.995)) * frames as f32) as usize;
                        ch.cursor = target_frame * TARGET_CHANNELS;
                    }
                }
                self.publish_snapshot();
            }
            AudioCmd::CycleLofiLoop => {
                self.lofi.loop_mode = self.lofi.loop_mode.next();
                self.publish_snapshot();
            }
            AudioCmd::AddCustomDir(dir) => match self.lofi.add_dir(&dir) {
                Ok(0) => {
                    self.error = Some("Không tìm thấy tệp .mp3/.ogg/.wav mới trong thư mục".into());
                    self.publish_snapshot();
                }
                Ok(_) => {
                    self.error = None;
                    self.publish_snapshot();
                }
                Err(e) => {
                    self.error = Some(e);
                    self.publish_snapshot();
                }
            },
            AudioCmd::AddCustomFiles(files) => {
                self.lofi.add_files(&files);
                self.error = None;
                self.publish_snapshot();
            }
            AudioCmd::RemoveCustomTrack(id) => {
                let was_current = self.lofi.remove_custom(&id);
                if was_current {
                    self.reload_lofi(false);
                } else {
                    self.publish_snapshot();
                }
            }
            AudioCmd::SyncTimer { remaining_ms, active } => self.sync_timer(remaining_ms, active),
            AudioCmd::Loaded { key, result } => self.on_loaded(key, result),
        }
        true
    }

    fn reload_lofi(&mut self, force_play: bool) {
        if let Some(ch) = self.channels.get_mut("lofi") {
            ch.buffer = None;
            ch.cursor = 0;
            if force_play {
                ch.active = true;
            }
        }
        if force_play {
            self.set_playing(true);
        } else {
            if self.channels.get("lofi").is_some_and(|c| c.active) && self.playing {
                self.ensure_channel_loaded("lofi");
            }
            self.publish_snapshot();
        }
    }

    fn set_playing(&mut self, play: bool) {
        self.playing = play;
        self.stopped_by_timer = false;
        self.error = None;
        if play {
            self.fade_level = 1.0;
            if !self.channels.values().any(|c| c.active) {
                if let Some(rain) = self.channels.get_mut("rain") {
                    rain.active = true;
                }
            }
            let active_ids: Vec<String> = self
                .channels
                .iter()
                .filter(|(_, c)| c.active)
                .map(|(id, _)| id.clone())
                .collect();
            for id in active_ids {
                self.ensure_channel_loaded(&id);
            }
        }
        self.publish_snapshot();
    }

    fn toggle_channel(&mut self, id: &str) {
        let Some(ch) = self.channels.get_mut(id) else {
            return;
        };
        ch.active = !ch.active;
        let now_active = ch.active;
        self.active_preset_id = None;
        self.error = None;

        if now_active && self.playing {
            self.ensure_channel_loaded(id);
        } else if now_active && !self.playing {
            self.set_playing(true);
            return;
        }
        self.publish_snapshot();
    }

    fn apply_preset(&mut self, preset_id: &str) {
        let Some(preset) = find_preset_mix(preset_id) else {
            return;
        };
        let list: Vec<(String, f32)> = preset
            .channels
            .iter()
            .map(|&(id, v)| (id.to_string(), v))
            .collect();
        self.apply_custom_mix(preset.id.to_string(), &list);
    }

    fn apply_custom_mix(&mut self, preset_id: String, channels: &[(String, f32)]) {
        for ch in self.channels.values_mut() {
            ch.active = false;
        }
        for (ch_id, vol) in channels {
            if let Some(ch) = self.channels.get_mut(ch_id) {
                ch.active = true;
                ch.volume = vol.clamp(0.0, 1.0);
            }
        }
        self.active_preset_id = Some(preset_id);
        self.set_playing(true);
    }

    fn shuffle_mix(&mut self) {
        self.lofi.seed = self
            .lofi
            .seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let ambient_ids: Vec<&str> = CHANNEL_SPECS
            .iter()
            .filter(|s| s.id != "lofi")
            .map(|s| s.id)
            .collect();
        let order = lofi_shuffle_order(ambient_ids.len(), self.lofi.seed);
        for ch in self.channels.values_mut() {
            ch.active = false;
        }
        for (rank, &idx) in order.iter().take(3).enumerate() {
            if let Some(ch) = self.channels.get_mut(ambient_ids[idx]) {
                ch.active = true;
                ch.volume = [0.75, 0.55, 0.4][rank];
            }
        }
        self.active_preset_id = None;
        self.set_playing(true);
    }

    fn clear_all(&mut self) {
        for ch in self.channels.values_mut() {
            ch.active = false;
        }
        self.active_preset_id = None;
        self.playing = false;
        self.publish_snapshot();
    }

    fn sync_timer(&mut self, remaining_ms: Option<i64>, active: bool) {
        if active {
            self.had_active_job = true;
            if self.fade_minutes > 0 {
                if let Some(rem) = remaining_ms {
                    let window_ms = (self.fade_minutes as f32) * 60_000.0;
                    let next_fade = (rem.max(0) as f32 / window_ms).clamp(0.0, 1.0);
                    if (next_fade - self.fade_level).abs() > 0.01 {
                        self.fade_level = next_fade;
                        self.publish_snapshot();
                    }
                }
            }
        } else if self.had_active_job {
            self.had_active_job = false;
            if self.playing {
                self.playing = false;
                self.stopped_by_timer = true;
                self.fade_level = 1.0;
                self.publish_snapshot();
            }
        }
    }

    fn cache_key_for(&self, id: &str) -> Option<String> {
        let spec = find_channel(id)?;
        Some(match spec.kind {
            ChannelKind::LofiRadio => format!(
                "lofi:{}",
                self.lofi.current().map(|t| t.info.id.as_str()).unwrap_or("")
            ),
            _ => format!("ch:{id}"),
        })
    }

    fn ensure_channel_loaded(&mut self, id: &str) {
        let Some(key) = self.cache_key_for(id) else {
            return;
        };
        if let Some(cached) = self.cache.get(&key).cloned() {
            if let Some(ch) = self.channels.get_mut(id) {
                ch.buffer = Some(cached);
                ch.loading = false;
            }
            return;
        }

        if let Some(ch) = self.channels.get_mut(id) {
            ch.loading = true;
        }
        if !self.inflight.insert(key.clone()) {
            return;
        }

        let sounds_dir = self.sounds_dir.clone();
        let tx = self.tx.clone();
        let id_owned = id.to_string();
        let lofi_path = self.lofi.current().map(|t| t.path.clone());

        std::thread::spawn(move || {
            let result = load_channel_buffer(&sounds_dir, &id_owned, lofi_path.as_deref()).map(Arc::new);
            let _ = tx.send(AudioCmd::Loaded { key, result });
        });
    }

    fn on_loaded(&mut self, key: String, result: Result<Arc<Vec<f32>>, String>) {
        self.inflight.remove(&key);
        match result {
            Ok(buf) => {
                self.cache.insert(key.clone(), Arc::clone(&buf));
                for spec in CHANNEL_SPECS {
                    if self.cache_key_for(spec.id).as_deref() == Some(key.as_str()) {
                        if let Some(ch) = self.channels.get_mut(spec.id) {
                            ch.buffer = Some(Arc::clone(&buf));
                            ch.loading = false;
                            ch.cursor = 0;
                        }
                    }
                }
            }
            Err(err) => {
                self.error = Some(err);
                for spec in CHANNEL_SPECS {
                    if self.cache_key_for(spec.id).as_deref() == Some(key.as_str()) {
                        if let Some(ch) = self.channels.get_mut(spec.id) {
                            ch.loading = false;
                            ch.active = false;
                        }
                    }
                }
            }
        }
        self.publish_snapshot();
    }

    fn any_channel_audible(&self) -> bool {
        self.channels.values().any(|c| c.current_gain > 0.0005)
    }

    fn mix_chunk(&mut self, mix_buf: &mut [f32], pcm_bytes: &mut [u8]) {
        mix_buf.fill(0.0);
        let global_gain = perceptual_gain(self.master) * perceptual_gain(self.fade_level);
        let chunk_secs = CHUNK_FRAMES as f32 / TARGET_SAMPLE_RATE as f32;
        let mut lofi_finished = false;

        for spec in CHANNEL_SPECS {
            let Some(ch) = self.channels.get_mut(spec.id) else {
                continue;
            };
            let swell_mult = if ch.swell {
                ch.swell_phase = (ch.swell_phase + chunk_secs / SWELL_PERIOD_SECS) % 1.0;
                0.55 + 0.45 * 0.5 * (1.0 + (ch.swell_phase * TAU).cos())
            } else {
                1.0
            };

            let target_gain = if self.playing && ch.active {
                perceptual_gain(ch.volume) * spec.mix * BOOST * global_gain * swell_mult
            } else {
                0.0
            };
            ch.current_gain += (target_gain - ch.current_gain) * GAIN_STEP;
            if ch.current_gain < 0.0002 {
                ch.current_gain = 0.0;
                continue;
            }

            let Some(buf) = ch.buffer.as_ref() else {
                continue;
            };
            let total_samples = buf.len();
            if total_samples < TARGET_CHANNELS {
                continue;
            }

            let (gain_l, gain_r) = pan_gains(ch.pan, ch.current_gain);
            let is_lofi = matches!(spec.kind, ChannelKind::LofiRadio);
            for frame in mix_buf.chunks_exact_mut(TARGET_CHANNELS) {
                if ch.cursor + 1 >= total_samples {
                    if is_lofi && self.lofi.loop_mode != LofiLoopMode::One {
                        lofi_finished = true;
                        break;
                    }
                    ch.cursor = 0;
                }
                frame[0] += buf[ch.cursor] * gain_l;
                frame[1] += buf[ch.cursor + 1] * gain_r;
                ch.cursor += TARGET_CHANNELS;
            }
        }

        if lofi_finished {
            self.lofi.next();
            self.reload_lofi(false);
        }

        for (idx, &sample) in mix_buf.iter().enumerate() {
            let limited = soft_limit(sample);
            let s16 = (limited * i16::MAX as f32).round() as i16;
            let bytes = s16.to_le_bytes();
            pcm_bytes[idx * 2] = bytes[0];
            pcm_bytes[idx * 2 + 1] = bytes[1];
        }
    }

    fn write_to_sink(&mut self, bytes: &[u8]) -> Result<(), String> {
        if self.sink.is_none() {
            self.sink = Some(SinkProcess::spawn()?);
        }
        if let Some(sink) = self.sink.as_mut() {
            if let Err(err) = sink.write_pcm(bytes) {
                self.close_sink();
                return Err(err);
            }
        }
        Ok(())
    }

    fn close_sink(&mut self) {
        if let Some(sink) = self.sink.take() {
            sink.close();
        }
    }

    fn build_snapshot(&self) -> AudioStateSnapshot {
        let channels = CHANNEL_SPECS
            .iter()
            .map(|spec| {
                let rt = &self.channels[spec.id];
                ChannelView {
                    id: spec.id.to_string(),
                    name: spec.name.to_string(),
                    desc: spec.desc.to_string(),
                    category: spec.category.to_string(),
                    art: spec.art.to_string(),
                    active: rt.active,
                    loading: rt.loading,
                    volume: rt.volume,
                    pan: rt.pan,
                    swell: rt.swell,
                }
            })
            .collect();

        let lofi_ch = self.channels.get("lofi");
        let lofi_progress = lofi_ch
            .and_then(|c| c.buffer.as_ref().map(|b| (c.cursor, b.len())))
            .filter(|&(_, len)| len > 0)
            .map(|(cur, len)| (cur as f32 / len as f32).clamp(0.0, 1.0))
            .unwrap_or(0.0);

        AudioStateSnapshot {
            playing: self.playing,
            master: self.master,
            fade_minutes: self.fade_minutes,
            fade_level: self.fade_level,
            fading: self.playing && self.fade_minutes > 0 && self.fade_level < 0.99,
            stopped_by_timer: self.stopped_by_timer,
            active_preset_id: self.active_preset_id.clone(),
            lofi_track: self.lofi.current().map(|t| t.info.clone()),
            lofi_tracks: self.lofi.tracks.iter().map(|t| t.info.clone()).collect(),
            lofi_progress,
            lofi_loop_mode: self.lofi.loop_mode.as_str().to_string(),
            error: self.error.clone(),
            channels,
            presets: PRESET_MIXES,
        }
    }

    fn publish_snapshot(&self) {
        let snap = self.build_snapshot();
        *self.snapshot.lock().unwrap_or_else(|e| e.into_inner()) = snap.clone();
        (self.on_change)(snap);
    }
}

fn load_channel_buffer(sounds_dir: &Path, id: &str, lofi_path: Option<&Path>) -> Result<Vec<f32>, String> {
    let spec = find_channel(id).ok_or_else(|| format!("Không rõ kênh âm thanh: {id}"))?;
    match spec.kind {
        ChannelKind::BrownNoise => Ok(generate_brown_noise(12)),
        ChannelKind::PinkNoise => Ok(generate_pink_noise(12)),
        ChannelKind::WhiteNoise => Ok(generate_white_noise(12)),
        ChannelKind::LoopFile(file) => {
            let decoded = decode_stereo_f32(&sounds_dir.join(file))?;
            Ok(seam_crossfade(decoded, 2.5))
        }
        ChannelKind::LofiRadio => {
            let path = lofi_path.ok_or_else(|| "Chưa có bài nhạc nào trong playlist".to_string())?;
            decode_stereo_f32(path)
        }
    }
}

pub fn perceptual_gain(volume: f32) -> f32 {
    volume.clamp(0.0, 1.0).powf(1.5)
}

pub fn pan_gains(pan: f32, gain: f32) -> (f32, f32) {
    let angle = (pan.clamp(-1.0, 1.0) + 1.0) * FRAC_PI_4;
    let scale = std::f32::consts::SQRT_2;
    (gain * angle.cos() * scale, gain * angle.sin() * scale)
}

pub fn soft_limit(sample: f32) -> f32 {
    if sample.abs() <= 0.85 {
        sample
    } else {
        sample.tanh()
    }
}

pub fn lofi_shuffle_order(len: usize, mut seed: u64) -> Vec<usize> {
    let mut order: Vec<usize> = (0..len).collect();
    for i in (1..order.len()).rev() {
        seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        let j = ((seed >> 32) as usize) % (i + 1);
        order.swap(i, j);
    }
    order
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn perceptual_gain_clamps_and_curves() {
        assert_eq!(perceptual_gain(-0.5), 0.0);
        assert_eq!(perceptual_gain(1.5), 1.0);
        assert!(perceptual_gain(0.5) < 0.5);
    }

    #[test]
    fn pan_gains_center_is_equal() {
        let (l, r) = pan_gains(0.0, 1.0);
        assert!((l - 1.0).abs() < 0.001);
        assert!((r - 1.0).abs() < 0.001);
        let (ll, lr) = pan_gains(-1.0, 1.0);
        assert!(ll > 1.3 && lr.abs() < 0.001);
    }

    #[test]
    fn soft_limiter_keeps_bounds() {
        assert_eq!(soft_limit(0.5), 0.5);
        assert!(soft_limit(5.0) <= 1.0);
        assert!(soft_limit(-5.0) >= -1.0);
    }

    #[test]
    fn noise_generators_produce_valid_stereo_loops() {
        let brown = generate_brown_noise(2);
        let pink = generate_pink_noise(2);
        let white = generate_white_noise(2);
        assert!(!brown.is_empty() && !pink.is_empty() && !white.is_empty());
        assert_eq!(brown.len() % 2, 0);
        assert_eq!(pink.len() % 2, 0);
        assert_eq!(white.len() % 2, 0);
        assert!(brown.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
        assert!(pink.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
        assert!(white.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
    }

    #[test]
    fn shuffle_contains_all_indices_once() {
        let mut order = lofi_shuffle_order(LOFI_TRACKS.len(), 42);
        order.sort_unstable();
        assert_eq!(order, (0..LOFI_TRACKS.len()).collect::<Vec<_>>());
    }
}
