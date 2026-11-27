/* global window */
// Cầu nối giữa giao diện và lõi Rust: cung cấp `window.sleepy` với cùng API ở mọi cửa sổ.
(() => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  /** Đăng ký nghe một sự kiện từ Rust, trả về hàm huỷ đăng ký. */
  const on = (channel) => (fn) => {
    let unlisten = null;
    listen(channel, (e) => fn(e.payload)).then((u) => { unlisten = u; });
    return () => unlisten && unlisten();
  };

  window.sleepy = {
    getState: () => invoke('state_get'),
    start: (action, trigger, source) => invoke('job_start', { action, trigger, source }),
    cancel: () => invoke('job_cancel'),
    postpone: (minutes) => invoke('job_postpone', { minutes }),
    now: () => invoke('job_now'),
    setDraft: (draft) => invoke('draft_set', { draft }),
    setSettings: (patch) => invoke('settings_set', { patch }),
    setPresets: (list) => invoke('presets_set', { list }),
    setSchedules: (list) => invoke('schedules_set', { list }),
    clearHistory: () => invoke('history_clear'),
    processes: () => invoke('proc_list'),
    checkProcess: (name) => invoke('proc_check', { name }),
    win: (action) => invoke('win_action', { action }),
    audioState: () => invoke('audio_state'),
    audioTogglePlay: () => invoke('audio_toggle_play'),
    audioToggleChannel: (id) => invoke('audio_toggle_channel', { id }),
    audioSetVolume: (id, volume) => invoke('audio_set_volume', { id, volume }),
    audioSetMaster: (volume) => invoke('audio_set_master', { volume }),
    audioSetFade: (minutes) => invoke('audio_set_fade', { minutes }),
    audioApplyPreset: (id) => invoke('audio_apply_preset', { id }),
    audioSkipLofi: () => invoke('audio_skip_lofi'),
    audioPrevLofi: () => invoke('audio_prev_lofi'),
    audioSelectLofi: (id) => invoke('audio_select_lofi', { id }),
    audioSeekLofi: (ratio) => invoke('audio_seek_lofi', { ratio }),
    audioCycleLofiLoop: () => invoke('audio_cycle_lofi_loop'),
    audioSetPan: (id, pan) => invoke('audio_set_pan', { id, pan }),
    audioToggleSwell: (id) => invoke('audio_toggle_swell', { id }),
    audioShuffleMix: () => invoke('audio_shuffle_mix'),
    audioClearAll: () => invoke('audio_clear_all'),
    audioApplyCustomMix: (id) => invoke('audio_apply_custom_mix', { id }),
    audioSaveMix: (name) => invoke('audio_save_mix', { name }),
    audioDeleteMix: (id) => invoke('audio_delete_mix', { id }),
    audioPickFolder: () => invoke('audio_pick_folder'),
    audioPickFiles: () => invoke('audio_pick_files'),
    audioRemoveCustomTrack: (id) => invoke('audio_remove_custom_track', { id }),
    ytOpen: (mode, rect) => invoke('yt_open', { mode, ...(rect || {}) }),
    ytSetBounds: (x, y, w, h, visible) => invoke('yt_set_bounds', { x, y, w, h, visible }),
    ytHide: () => invoke('yt_hide'),
    ytClose: () => invoke('yt_close'),
    ytStatus: () => invoke('yt_status'),
    ytMedia: () => invoke('yt_media'),
    ytControl: (action) => invoke('yt_control', { action }),
    ytSetVideoOnly: (enabled) => invoke('yt_set_video_only', { enabled }),
    onState: on('state'),
    onTick: on('tick'),
    onAudio: on('audio'),
    onYtMedia: on('yt-media'),
    onMax: on('win-max'),
  };
})();
