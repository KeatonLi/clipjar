module.exports = () => {
  window.__TAURI__ = {};
  const state = (window.nativeMock = {
    text: null,
    image: { width: 1, height: 1, rgba: [255, 0, 0, 255] },
    resources: new Map(),
    shortcuts: new Map(),
    writes: [],
    shown: 0,
    hidden: 0,
    nextId: 1,
    callbacks: new Map(),
    startup: false,
    pinned: false,
    failStartup: false,
    hangStartup: false,
    conflict: ''
  });
  const resource = (value) => {
    const rid = state.nextId++;
    state.resources.set(rid, value);
    return rid;
  };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback: (callback) => {
      const id = state.nextId++;
      state.callbacks.set(id, callback);
      return id;
    },
    unregisterCallback: (id) => state.callbacks.delete(id),
    invoke: async (command, args = {}) => {
      switch (command) {
        case 'plugin:clipboard-manager|read_text':
          if (state.text === null) throw Error('no text');
          return state.text;
        case 'plugin:clipboard-manager|read_image':
          if (!state.image) throw Error('no image');
          return resource(structuredClone(state.image));
        case 'plugin:image|size': {
          const { width, height } = state.resources.get(args.rid);
          return { width, height };
        }
        case 'plugin:image|rgba':
          return state.resources.get(args.rid).rgba;
        case 'plugin:image|new':
          return resource({ width: args.width, height: args.height, rgba: Array.from(args.rgba) });
        case 'plugin:resources|close':
          if (!state.resources.delete(args.rid)) throw Error('double resource release');
          return;
        case 'plugin:clipboard-manager|write_image':
          state.image = structuredClone(state.resources.get(args.image));
          state.text = null;
          state.writes.push({ type: 'image', ...structuredClone(state.image) });
          return;
        case 'plugin:clipboard-manager|write_text':
          state.text = args.text;
          state.image = null;
          state.writes.push({ type: 'text', text: args.text });
          return;
        case 'plugin:global-shortcut|is_registered':
          return state.conflict === args.shortcut || state.shortcuts.has(args.shortcut);
        case 'plugin:global-shortcut|register':
          await new Promise((resolve) => setTimeout(resolve, 60));
          for (const key of args.shortcuts) {
            if (state.shortcuts.has(key)) throw Error('duplicate shortcut');
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
          if (state.failStartup) throw Error('native setting failed');
          return state.startup;
        case 'plugin:autostart|enable':
          state.startup = true;
          return;
        case 'plugin:autostart|disable':
          state.startup = false;
          return;
        case 'get_memory_stats':
          return { itemCount: 0, memoryMB: 0 };
        case 'add_clipboard_item':
          return null;
        default:
          throw Error('Unexpected native call: ' + command);
      }
    }
  };
};
