// Bộ icon nét mảnh, vẽ riêng cho Nghỉ.
window.Icons = (() => {
  const w = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return {
    shutdown: w('<path d="M12 3.5v8"/><path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0"/>'),
    reboot: w('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/>'),
    suspend: w('<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1Z"/>'),
    hibernate: w('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>'),
    lock: w('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/><path d="M12 14.5v2"/>'),
    logout: w('<path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"/><path d="M10.5 12H20M16.5 8.5 20 12l-3.5 3.5"/>'),
    timer: w('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 3h5"/>'),
    bookmark: w('<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"/>'),
    repeat: w('<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>'),
    history: w('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4.5H8M12 8v4.5l3 2"/>'),
    gear: w('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.8A8.3 8.3 0 0 1 9.2 4a8.3 8.3 0 1 0 10.8 10.8Z"/><circle cx="17.5" cy="5.5" r="1.1"/><circle cx="20.5" cy="9" r=".7"/></svg>',
    trash: w('<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>'),
    play: w('<path d="M8 5.5v13l10.5-6.5z"/>'),
    plus: w('<path d="M12 5v14M5 12h14"/>'),
    min: '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1 5.5h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    max: '<svg width="11" height="11" viewBox="0 0 11 11"><rect x="1.5" y="1.5" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    close: '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
  };
})();
