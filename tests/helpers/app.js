import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import * as engine from "../../engine.js";
import { helpSteps } from "../../tour.js";

export const KEY = "snapscape.v1";
const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8")
  .replace(/^import \{[\s\S]*?\} from "[^"\n]+";\n/gm, "");
const script = new Script(source, { filename: "app.js" });
export function savedProgress() {
  return {
    version: 1,
    revision: "saved-revision",
    active: {
      id: "active-puzzle", name: "Unfinished memory", difficulty: "breezy",
      ratio: 1.5, seconds: 30, seed: 123, image: "data:image/jpeg;base64,AAAA",
      order: Array.from({ length: 24 }, (_, i) => i), pieces: Array(24).fill(null),
    },
    records: [{
      id: "finished-puzzle", name: "Finished memory", difficulty: "breezy",
      seconds: 60, points: engine.score("breezy", 60).total,
      date: "2026-10-01T12:00:00Z", thumbnail: null,
    }],
  };
}

// Exercise the real app handlers with in-memory storage and minimal DOM stubs.
// Geometry is inert; these stubs do not verify layout, rendering, or native pickers.
export function app(storage = new Map([[KEY, JSON.stringify(savedProgress())]])) {
  const nodes = new Map(), blobs = [], revoked = [], intervals = [];
  const timeouts = new Map();
  let timerNow = 0, nextTimerId = 0;
  let now = 1000;
  let document;
  class Node {
    constructor(id = "") {
      this.id = id;
      this.hidden = false;
      this.open = false;
      this.value = "";
      this.textContent = "";
      this.innerHTML = "";
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.style = { setProperty(name, value) { this[name] = String(value); } };
      this.clientWidth = 600;
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      };
    }
    addEventListener(type, fn, options = {}) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      const listener = options.once ? (...args) => {
        this.listeners.set(type, this.listeners.get(type).filter((entry) => entry !== listener));
        return fn(...args);
      } : fn;
      this.listeners.get(type).push(listener);
    }
    emit(type, detail = {}) {
      const event = { target: this, preventDefault() {}, ...detail };
      const handlers = [...(this.listeners.get(type) || [])];
      if (this[`on${type}`]) handlers.push(this[`on${type}`]);
      return Promise.all(handlers.map((fn) => fn(event)));
    }
    click() { return this.emit("click"); }
    focus() { document.activeElement = this; }
    select() {}
    setCustomValidity(message) { this.validationMessage = message; }
    reportValidity() { return !this.validationMessage; }
    get innerHTML() { return this.html || ""; }
    set innerHTML(value) {
      if (this.id === "modal-content") {
        for (const [, id] of this.innerHTML.matchAll(/id="([^"]+)"/g)) {
          nodes.delete(`#${id}`);
        }
      }
      this.html = value;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    contains(node) { return this === node; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
    showModal() { this.open = true; }
    close() {
      if (!this.open) return;
      this.open = false;
      return this.emit("close");
    }
    scrollTo() {}
    getScreenCTM() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
    hasPointerCapture() { return false; }
    append() {}
    remove() {}
  }
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, new Node(selector.slice(1)));
    return nodes.get(selector);
  }
  const navigation = ["play", "gallery", "achievements"].map((view) => {
    const button = node(`[data-view="${view}"]`);
    button.dataset.view = view;
    return button;
  });
  const zoomButtons = [0.5, 0.75, 1, 1.25, 1.5, 2].map((zoom) => {
    const button = node(`[data-zoom="${zoom}"]`);
    button.dataset.zoom = String(zoom);
    return button;
  });
  document = Object.assign(new Node(), {
    activeElement: null,
    querySelector: node,
    querySelectorAll: (selector) => selector === "[data-view]"
      ? navigation
      : selector === ".view"
        ? ["play", "gallery", "achievements"].map((view) => node(`#${view}-view`))
        : selector === "[data-zoom]" ? zoomButtons : [],
    createElement: () => new Node(),
    body: new Node(),
  });
  node("#options-panel").hidden = true;
  node("#zoom-panel").hidden = true;
  node("#zoom-control").contains = (target) => zoomButtons.includes(target) || [
    "#zoom-control", "#zoom-button", "#zoom-panel",
  ].some((selector) => node(selector) === target);
  node("#footer-options").contains = (target) => [
    "#footer-options", "#options-toggle", "#options-panel", "#export-button",
    "#import-button", "#erase-button",
  ].some((selector) => node(selector) === target);
  const window = Object.assign(new Node(), {
    innerWidth: 1280, innerHeight: 900, scrollY: 0,
    matchMedia: () => Object.assign(new Node(), { matches: false }),
    scrollTo() {},
  });
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const context = createContext({
    ...engine, helpSteps, document, window, localStorage, Blob, atob,
    // Drive the app's real tour callbacks without browser rendering.
    createHelpTour(config) {
      let index = 0;
      config.onStep(config.steps[index]);
      return {
        close: config.onClose, refresh() {},
        get step() { return config.steps[index]; },
        go(id) {
          index = config.steps.findIndex((step) => step.id === id);
          assert.ok(index >= 0, `Unknown tour step: ${id}`);
          config.onStep(config.steps[index]);
        },
        action: config.onAction,
        escape: config.onEscape,
      };
    },
    getComputedStyle: () => ({ columnGap: "16px", rowGap: "12px" }),
    performance: { now: () => now },
    URL: {
      createObjectURL: (blob) => { blobs.push(blob); return "blob:test"; },
      revokeObjectURL: (url) => revoked.push(url),
    },
    setTimeout: (callback, delay = 0) => {
      const id = ++nextTimerId;
      timeouts.set(id, { callback, due: timerNow + delay });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    requestAnimationFrame: () => 1,
    ResizeObserver: class { observe() {} },
  });
  script.runInContext(context);
  return {
    node, document, window, storage, localStorage, blobs, revoked, intervals,
    advance: (milliseconds) => { now += milliseconds; },
    elapseTimers: (milliseconds) => {
      const until = timerNow + milliseconds;
      while (true) {
        const next = [...timeouts.entries()].filter(([, timer]) => timer.due <= until)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, timer] = next;
        timeouts.delete(id);
        timerNow = timer.due;
        timer.callback();
      }
      timerNow = until;
    },
    run: (code) => new Script(code).runInContext(context),
  };
}
