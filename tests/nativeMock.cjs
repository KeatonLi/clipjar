// Test-only simulation of the native command/event boundary. SQLite is tested in Rust.
module.exports = () => {
  window.__TAURI__ = {};
  const saved = sessionStorage.getItem('mock-native-db');
  const state = (window.nativeMock = {
    text: null,
    image: { width: 1, height: 1, rgba: [255, 0, 0, 255] },
    resources: new Map(),
    shortcuts: new Map(),
    callbacks: new Map(),
    listeners: new Map(),
    files: new Map(),
    pixels: new Map(),
    writes: [],
    calls: [],
    shown: 0,
    hidden: 0,
    nextId: 1000,
    startup: false,
    pinned: false,
    failStartup: false,
    hangStartup: false,
    conflict: '',
    last: null,
    skipNext: false,
    migrationFails: false,
    db: saved
      ? JSON.parse(saved)
      : {
          revision: 0,
          items: [],
          settings: null,
          pauseUntil: null,
          undo: null,
          storageBytes: 4096,
          migrationBackup: null
        },
    initialized: Boolean(saved),
    trash: new Map()
  });
  const emit = (event, payload) => {
    for (const [id, listener] of state.listeners)
      if (listener.event === event)
        state.callbacks.get(listener.handler)?.({ event, id, payload: structuredClone(payload) });
  };
  const persist = () => sessionStorage.setItem('mock-native-db', JSON.stringify(state.db));
  const publish = () => {
    state.db.revision++;
    persist();
    emit('history-changed', state.db);
    return structuredClone(state.db);
  };
  const addImage = (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas
      .getContext('2d')
      .putImageData(
        new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
        0,
        0
      );
    const path = `/mock/images/${image.rgba.join('-')}.png`;
    state.files.set(path, canvas.toDataURL('image/png'));
    state.pixels.set(path, structuredClone(image));
    return path;
  };
  const record = () => {
    if (!state.initialized) return;
    const paused =
      state.db.pauseUntil !== null &&
      (state.db.pauseUntil === 0 || state.db.pauseUntil > Date.now());
    if (paused) {
      state.skipNext = true;
      return;
    }
    let key = state.image ? 'image:' + JSON.stringify(state.image) : state.text || null;
    if (state.skipNext) {
      state.last = key;
      state.skipNext = false;
      return;
    }
    if (key === state.last) return;
    state.last = key;
    if (!key) return;
    const path = state.image ? addImage(state.image) : undefined;
    const existing = state.db.items.find((item) =>
      state.image ? item.imagePath === path : item.content === state.text
    );
    const item = existing
      ? { ...existing, createdAt: Date.now(), updatedAt: Date.now() }
      : {
          id: ++state.nextId,
          content: state.image ? `[图片 ${state.image.width}x${state.image.height}]` : state.text,
          contentType: state.image ? 'image' : 'text',
          imagePath: path,
          imageWidth: state.image?.width,
          imageHeight: state.image?.height,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isFavorite: false,
          tags: [],
          useWeight: 0
        };
    state.db.items = [item, ...state.db.items.filter((row) => row.id !== item.id)];
    publish();
  };
  state.emit = emit;
  state.record = record;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (_event, id) => state.listeners.delete(id)
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    convertFileSrc: (path) => state.files.get(path) || path,
    transformCallback: (callback) => {
      const id = ++state.nextId;
      state.callbacks.set(id, callback);
      return id;
    },
    unregisterCallback: (id) => state.callbacks.delete(id),
    invoke: async (command, args = {}) => {
      state.calls.push(command);
      switch (command) {
        case 'plugin:event|listen': {
          const id = ++state.nextId;
          state.listeners.set(id, args);
          return id;
        }
        case 'plugin:event|unlisten':
          state.listeners.delete(args.eventId);
          return;
        case 'initialize_history': {
          if (state.migrationFails) throw '旧记录迁移失败，原始数据已保留';
          if (!state.initialized) {
            const legacy = args.legacy ? JSON.parse(args.legacy).state : null;
            state.db.items = legacy?.items || [];
            state.db.settings = {
              maxHistoryItems: 100,
              autoCleanup: true,
              cleanupDays: 30,
              globalShortcut: 'CommandOrControl+Shift+V',
              startAtLogin: false,
              showPreview: true,
              ...legacy?.settings
            };
            if (args.shortcut) state.db.settings.globalShortcut = args.shortcut;
            state.db.migrationBackup = args.legacy ? '/mock/backups/legacy.json' : null;
            state.initialized = true;
          }
          return publish();
        }
        case 'history_snapshot':
          return structuredClone(state.db);
        case 'history_action': {
          const action = args.action;
          if (action.type === 'favorite')
            state.db.items = state.db.items.map((item) =>
              item.id === action.id ? { ...item, isFavorite: !item.isFavorite } : item
            );
          if (action.type === 'note')
            state.db.items = state.db.items.map((item) =>
              item.id === action.id ? { ...item, note: action.note } : item
            );
          if (action.type === 'settings') state.db.settings = action.settings;
          if (action.type === 'pause') {
            state.db.pauseUntil = action.minutes === null ? 0 : Date.now() + action.minutes * 60000;
            state.skipNext = true;
          }
          if (action.type === 'resume') {
            state.db.pauseUntil = null;
            state.skipNext = true;
          }
          if (action.type === 'delete') {
            const item = state.db.items.find((item) => item.id === action.id);
            const token = `undo-${action.id}`;
            state.trash.set(token, item);
            state.db.items = state.db.items.filter((item) => item.id !== action.id);
            state.db.undo = { token, expiresAt: Date.now() + 10000 };
          }
          if (action.type === 'undo') {
            const item = state.trash.get(action.token);
            if (item && state.db.undo?.expiresAt > Date.now()) state.db.items.unshift(item);
            state.trash.delete(action.token);
            state.db.undo = null;
          }
          if (action.type === 'clear') {
            state.db.items = action.includeFavorites
              ? []
              : state.db.items.filter((item) => item.isFavorite);
            state.db.undo = null;
            if (action.includeFavorites) state.db.migrationBackup = null;
          }
          return publish();
        }
        case 'copy_history_item': {
          const item = state.db.items.find((item) => item.id === args.id);
          if (!item) throw 'missing record';
          if (item.contentType === 'image') {
            const image = state.pixels.get(item.imagePath);
            state.writes.push({ type: 'image', ...image });
            state.image = structuredClone(image);
            state.text = null;
          } else {
            state.writes.push({ type: 'text', text: item.content });
            state.text = item.content;
            state.image = null;
          }
          return publish();
        }
        case 'plugin:global-shortcut|is_registered':
          return state.conflict === args.shortcut || state.shortcuts.has(args.shortcut);
        case 'plugin:global-shortcut|register':
          await new Promise((resolve) => setTimeout(resolve, 60));
          for (const key of args.shortcuts) {
            if (state.shortcuts.has(key)) throw 'shortcut conflict';
            state.shortcuts.set(key, args.handler);
          }
          return;
        case 'plugin:global-shortcut|unregister':
          for (const key of args.shortcuts) state.shortcuts.delete(key);
          return;
        case 'plugin:window|show':
          state.shown++;
          return;
        case 'plugin:window|hide':
          state.hidden++;
          return;
        case 'plugin:window|set_focus':
          return;
        case 'plugin:window|is_always_on_top':
          return state.pinned;
        case 'plugin:window|set_always_on_top':
          state.pinned = args.value;
          return;
        case 'plugin:autostart|is_enabled':
          if (state.hangStartup) return new Promise(() => {});
          if (state.failStartup) throw 'native setting failed';
          return state.startup;
        case 'plugin:autostart|enable':
          state.startup = true;
          return;
        case 'plugin:autostart|disable':
          state.startup = false;
          return;
        default:
          throw Error('Unexpected native call: ' + command);
      }
    }
  };
  setInterval(record, 150);
};
