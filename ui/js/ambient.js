/* global window, sleepy */
// Giao tiếp với bộ trộn âm thanh thuần Rust qua Tauri IPC (`src-tauri/src/audio`).
window.Ambient = (() => {
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  let state = {
    playing: false,
    master: 0.8,
    fadeMinutes: 10,
    fadeLevel: 1,
    fading: false,
    stoppedByTimer: false,
    activePresetId: null,
    lofiTrack: null,
    lofiTracks: [],
    lofiProgress: 0,
    lofiLoopMode: 'all',
    error: null,
    channels: [],
    presets: [],
  };

  let yt = { status: 'closed', title: null, source: null, videoId: null, artwork: null };

  function applySnapshot(next) {
    if (!next) return;
    state = next;
    emit();
  }

  function applyYt(next) {
    if (!next) return;
    yt = next;
    emit();
  }

  sleepy.audioState().then(applySnapshot).catch(() => {});
  sleepy.onAudio(applySnapshot);
  sleepy.ytMedia().then(applyYt).catch(() => {});
  sleepy.onYtMedia(applyYt);

  function optimisticChannel(id, fn) {
    const ch = state.channels.find((c) => c.id === id);
    if (ch) fn(ch);
    emit();
  }

  return {
    get channels() { return state.channels; },
    get presets() { return state.presets; },
    get activePresetId() { return state.activePresetId; },
    get playing() { return state.playing; },
    get fading() { return state.fading; },
    get fadeLevel() { return state.fadeLevel; },
    get stoppedByTimer() { return state.stoppedByTimer; },
    get error() { return state.error; },
    get master() { return state.master; },
    get fade() { return state.fadeMinutes; },
    get lofiTracks() { return state.lofiTracks || []; },
    get lofiProgress() { return state.lofiProgress || 0; },
    get lofiLoopMode() { return state.lofiLoopMode || 'all'; },
    get yt() { return yt; },
    song: () => state.lofiTrack,
    togglePlay: () => {
      state.playing = !state.playing;
      emit();
      sleepy.audioTogglePlay();
    },
    toggle: (id) => {
      optimisticChannel(id, (ch) => {
        ch.active = !ch.active;
        if (ch.active) state.playing = true;
      });
      state.activePresetId = null;
      sleepy.audioToggleChannel(id);
    },
    setVol: (id, v) => {
      optimisticChannel(id, (ch) => { ch.volume = v; });
      state.activePresetId = null;
      sleepy.audioSetVolume(id, v);
    },
    setPan: (id, pan) => {
      optimisticChannel(id, (ch) => { ch.pan = pan; });
      sleepy.audioSetPan(id, pan);
    },
    toggleSwell: (id) => {
      optimisticChannel(id, (ch) => { ch.swell = !ch.swell; });
      sleepy.audioToggleSwell(id);
    },
    setMaster: (v) => {
      state.master = v;
      sleepy.audioSetMaster(v);
    },
    setFade: (m) => {
      state.fadeMinutes = m;
      emit();
      sleepy.audioSetFade(m);
    },
    applyPreset: (id) => {
      state.activePresetId = id;
      state.playing = true;
      emit();
      sleepy.audioApplyPreset(id);
    },
    applyCustomMix: (id) => {
      state.activePresetId = id;
      state.playing = true;
      emit();
      sleepy.audioApplyCustomMix(id);
    },
    saveMix: (name) => sleepy.audioSaveMix(name),
    deleteMix: (id) => sleepy.audioDeleteMix(id),
    shuffle: () => sleepy.audioShuffleMix(),
    clearAll: () => {
      state.playing = false;
      state.activePresetId = null;
      state.channels.forEach((c) => { c.active = false; });
      emit();
      sleepy.audioClearAll();
    },
    skipSong: () => sleepy.audioSkipLofi(),
    prevSong: () => sleepy.audioPrevLofi(),
    selectSong: (id) => sleepy.audioSelectLofi(id),
    seekSong: (ratio) => {
      state.lofiProgress = ratio;
      sleepy.audioSeekLofi(ratio);
    },
    cycleLofiLoop: () => sleepy.audioCycleLofiLoop(),
    pickFolder: () => sleepy.audioPickFolder(),
    pickFiles: () => sleepy.audioPickFiles(),
    removeCustomTrack: (id) => sleepy.audioRemoveCustomTrack(id),
    ytOpen: (mode) => sleepy.ytOpen(mode),
    ytHide: () => sleepy.ytHide(),
    ytClose: () => sleepy.ytClose(),
    ytStatus: () => sleepy.ytStatus(),
    ytControl: (action) => sleepy.ytControl(action),
    syncJob: () => {},
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
