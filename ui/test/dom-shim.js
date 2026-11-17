// A deliberately tiny stand-in for the DOM, just enough for labels.js's
// makeLabel() (canvas 2D text measurement) to run under plain Node. This
// project has no jsdom dependency — pulling one in just to cover this one
// canvas call isn't worth it. Import this file first, for its side effect,
// before importing anything that reaches labels.js.
//
// This does NOT stand in for a real browser: it proves the scene-construction
// logic (buildSystemScene) runs against real data without throwing, not that
// it renders correctly. There is no substitute here for actually opening the
// page — see the README for that caveat.

class FakeCanvasRenderingContext2D {
  constructor() {
    this.font = '';
    this.fillStyle = '';
  }
  measureText(text) {
    return { width: text.length * 8 };
  }
  fillText() {}
  setTransform() {}
}

class FakeCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
  }
  getContext(kind) {
    if (kind === '2d') return new FakeCanvasRenderingContext2D();
    return null;
  }
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return new FakeCanvas();
    throw new Error(`dom-shim: unexpected createElement("${tag}")`);
  },
};

// Plain Node has no `localStorage` global (unlike a browser) — a minimal
// in-memory stand-in, just enough for nicknames.js's getItem/setItem calls.
class FakeLocalStorage {
  #store = new Map();
  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null;
  }
  setItem(key, value) {
    this.#store.set(key, String(value));
  }
  removeItem(key) {
    this.#store.delete(key);
  }
  clear() {
    this.#store.clear();
  }
}

globalThis.localStorage = new FakeLocalStorage();
