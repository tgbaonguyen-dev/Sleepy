/* global window */
// Cầu nối giữa giao diện và lõi Rust: cung cấp `window.nghi` với cùng API ở mọi cửa sổ.
(() => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  /** Đăng ký nghe một sự kiện từ Rust, trả về hàm huỷ đăng ký. */
  const on = (channel) => (fn) => {
    let unlisten = null;
    listen(channel, (e) => fn(e.payload)).then((u) => { unlisten = u; });
    return () => unlisten && unlisten();
  };

  window.nghi = {
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
    onState: on('state'),
    onTick: on('tick'),
    onMax: on('win-max'),
  };
})();
