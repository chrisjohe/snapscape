import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import * as engine from "../engine.js";
import { helpSteps } from "../tour.js";

const KEY = "snapscape.v1";
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8")
  .replace(/^import \{[\s\S]*?\} from "[^"\n]+";\n/gm, "");
const script = new Script(source, { filename: "app.js" });
function savedProgress() {
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
// Measurements are supplied explicitly; no browser rendering or native picker is used.
function app(storage = new Map([[KEY, JSON.stringify(savedProgress())]])) {
  const nodes = new Map(), blobs = [], revoked = [], intervals = [];
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
      this.rect = { left: 0, top: 0, width: 0, height: 0 };
      this.computedStyle = { columnGap: "16px", rowGap: "12px" };
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
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
    getBoundingClientRect() { return this.rect; }
    showModal() { this.open = true; }
    close() {
      if (!this.open) return;
      this.open = false;
      return this.emit("close");
    }
    scrollTo() {}
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
    getComputedStyle: (node) => node.computedStyle,
    performance: { now: () => now },
    URL: {
      createObjectURL: (blob) => { blobs.push(blob); return "blob:test"; },
      revokeObjectURL: (url) => revoked.push(url),
    },
    setTimeout: () => 1, clearTimeout() {},
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    requestAnimationFrame: () => 1,
    ResizeObserver: class { observe() {} },
  });
  script.runInContext(context);
  return {
    node, document, window, storage, localStorage, blobs, revoked, intervals,
    advance: (milliseconds) => { now += milliseconds; },
    run: (code) => new Script(code).runInContext(context),
  };
}

test("practice moves, helpers, completion and autosave never modify saved memories or points", async () => {
  const a = app(), before = a.storage.get(KEY);
  const dataBefore = a.run("JSON.stringify(data)");
  await a.node("#help-button").click();
  assert.equal(a.run("helpTour.step.id"), "setup");
  assert.equal(a.node("#modal").open, false);
  a.run('helpTour.go("moving"); positionPiece(0, 0, 0);');
  await a.run("finishPlacement(0);");
  a.run('helpTour.go("helpers");');
  await a.node("#reference-button").click();
  assert.equal(a.run("showGuide"), true);
  assert.equal(a.node("#modal").open, false);
  await a.node("#edges-button").click();
  assert.equal(a.run("onlyEdges"), true);
  assert.equal(a.run("game.guideUses"), 0);
  a.run("game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));");
  await a.run("completeGame();");
  for (const interval of a.intervals) interval();
  await a.window.emit("pagehide");
  assert.equal(a.storage.get(KEY), before);
  assert.equal(a.run("JSON.stringify(data)"), dataBefore);
  a.run("helpTour.close();");
  assert.equal(a.run("game"), null);
  assert.equal(a.node("#setup").hidden, false);
  assert.equal(a.storage.get(KEY), before);
});

test("exiting every tour step restores the original puzzle, photo, controls, and clock state", async () => {
  for (const paused of [false, true]) {
    for (const step of helpSteps(true)) {
      const a = app();
      a.run(`resumeSavedGame(); game.twist = true; game.rotations = Array(24).fill(0);
        showPhoto({ image: "data:image/jpeg;base64,BBBB", ratio: 1, name: "My next puzzle" });
        selected = 2; showGuide = true; onlyEdges = true; zoomLevel = 1.5; keyboardCell = 3;`);
      if (paused) a.run("pause();");
      const gameBefore = a.run("JSON.stringify(game)"), photoBefore = a.run("selectedPhoto");
      const oldGame = a.run("game"), oldImage = a.run("gameImageUrl");
      await a.node("#help-button").click();
      a.run(`helpTour.go("${step.id}"); helpTour.close();`);
      assert.equal(a.run("game"), oldGame, step.id);
      assert.equal(a.run("JSON.stringify(game)"), gameBefore, step.id);
      assert.equal(a.run("selectedPhoto"), photoBefore, step.id);
      assert.equal(a.run("gameImageUrl"), oldImage, step.id);
      assert.equal(a.run("paused"), paused, step.id);
      assert.equal(a.run("selected"), 2, step.id);
      assert.equal(a.run("showGuide && onlyEdges && keyboardCell === 3 && zoomLevel === 1.5"), true, step.id);
      assert.equal(a.node("#setup-puzzle-name").textContent, "My next puzzle");
      assert.equal(a.revoked.includes(oldImage), false);
      assert.equal(a.node("#pause-cover").hidden, !paused);
      assert.equal(a.document.activeElement, a.node("#help-button"));
    }
  }
});

test("the tour returns to each original view and does not create a saved game for a new visitor", async () => {
  for (const view of ["play", "gallery", "achievements"]) {
    const a = app(new Map());
    a.run(`switchView("${view}", { showSetup: true });`);
    await a.node("#help-button").click();
    a.run('helpTour.go("backup"); helpTour.close();');
    assert.equal(a.run("view"), view);
    assert.equal(a.node(`#${view}-view`).hidden, false);
    assert.equal(a.node("#options-panel").hidden, true);
    assert.equal(a.run("game"), null);
    assert.equal(a.run("selectedPhoto"), null);
    assert.equal(a.storage.has(KEY), false);
  }
});

test("time spent in the tour is excluded from the real puzzle and its next autosave", async () => {
  const a = app();
  a.run("resumeSavedGame();");
  a.advance(5000);
  await a.node("#help-button").click();
  assert.equal(JSON.parse(a.storage.get(KEY)).active.seconds, 35);
  a.run('helpTour.go("moving");');
  a.advance(120000);
  for (const interval of a.intervals) interval();
  a.run("helpTour.close();");
  assert.equal(a.run("seconds()"), 35);
  a.advance(3000);
  a.run("save();");
  assert.equal(JSON.parse(a.storage.get(KEY)).active.seconds, 38);
});

test("the snap demonstrations join and lock neighbors and can be replayed", async () => {
  const a = app(), before = a.storage.get(KEY);
  await a.node("#help-button").click();
  a.run('helpTour.go("snapping"); helpTour.action("join");');
  assert.equal(a.run("game.pieces[0].group === game.pieces[1].group"), true);
  assert.equal(a.run("game.pieces[0].locked || game.pieces[1].locked"), false);
  a.run('helpTour.action("lock");');
  assert.equal(a.run("game.pieces[0].locked && game.pieces[1].locked"), true);
  a.run('helpTour.action("join");');
  assert.equal(a.run("game.pieces[0].locked"), false);
  assert.equal(a.storage.get(KEY), before);
});

test("Twist practice rotates without saving and Escape releases selection before exiting", async () => {
  const a = app(), before = a.storage.get(KEY);
  a.node("#random-rotation").setAttribute("aria-pressed", "true");
  await a.node("#help-button").click();
  a.run('helpTour.go("rotation");');
  assert.equal(a.node("#rotation-controls").hidden, false);
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[7]"), 2);
  assert.equal(a.run("helpTour.escape()"), true);
  assert.equal(a.run("selected"), null);
  assert.equal(a.run("helpTour.escape()"), false);
  assert.equal(a.storage.get(KEY), before);
});

test("hiding the tab during practice leaves the real game paused and practice usable on return", async () => {
  const a = app();
  a.run("resumeSavedGame();");
  await a.node("#help-button").click();
  a.run('helpTour.go("moving");');
  a.document.hidden = true;
  await a.document.emit("visibilitychange");
  assert.equal(a.run("paused"), true);
  a.document.hidden = false;
  await a.document.emit("visibilitychange");
  assert.equal(a.run("paused"), false);
  a.run("helpTour.close();");
  assert.equal(a.run("paused"), true);
  assert.equal(a.node("#pause-cover").hidden, false);
});

test("external replacement and erasure close practice without resurrecting an older save", async () => {
  for (const erased of [false, true]) {
    const a = app();
    a.run("resumeSavedGame();");
    await a.node("#help-button").click();
    a.run('helpTour.go("helpers");');
    const replacement = savedProgress();
    replacement.active.name = "Changed in another tab";
    const raw = erased ? null : JSON.stringify(replacement);
    if (erased) a.storage.delete(KEY);
    else a.storage.set(KEY, raw);
    await a.window.emit("storage", { key: KEY, newValue: raw });
    assert.equal(a.run("helpSession"), null);
    assert.equal(a.run("helpTour"), null);
    assert.equal(a.run("game"), null);
    assert.equal(a.storage.get(KEY) ?? null, raw);
    assert.equal(a.run("data.active?.name ?? null"), erased ? null : replacement.active.name);
  }
});

test("the setup title can be edited without changing a saved game, then starts and resumes with the chosen name", async () => {
  const a = app(), before = a.storage.get(KEY);
  a.run('prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5 });');
  await a.node("#sample-button").click();
  const suggested = a.node("#setup-puzzle-name").textContent;
  assert.ok(suggested.length > 0);
  assert.equal(a.node("#setup-title").hidden, false);
  assert.equal(a.node("#launch-tagline").hidden, true);
  await a.node("#edit-setup-name-button").click();
  assert.equal(a.node("#rename-input").value, suggested);
  a.node("#rename-input").value = "  Our spring escape  ";
  await a.node("#rename-form").emit("submit");
  assert.equal(a.node("#setup-puzzle-name").textContent, "Our spring escape");
  assert.equal(a.storage.get(KEY), before);
  assert.equal(a.node("#modal").open, false);
  a.node('[name=difficulty]:checked').value = "snappy";
  await a.node("#start-button").click();
  await a.node("#confirm-new").click();
  assert.equal(a.node("#game-name").textContent, "Our spring escape");
  assert.equal(JSON.parse(a.storage.get(KEY)).active.name, "Our spring escape");
  const restored = app(a.storage);
  restored.run("resumeSavedGame();");
  assert.equal(restored.node("#game-name").textContent, "Our spring escape");
});

test("new difficulty counts survive start, resume, completion, and trophy reload", async () => {
  for (const [id, count] of [["breezy", 24], ["snappy", 48], ["bold", 96], ["legend", 192]]) {
    const a = app();
    assert.match(a.node("#gallery-content").innerHTML, /24 pieces/);
    assert.doesNotMatch(a.node("#difficulty-options").innerHTML, /<b>12<\/b>/);
    a.node('[name=difficulty]:checked').value = id;
    a.run('selectedPhoto = { image: "data:image/jpeg;base64,AAAA", ratio: 1.5 }; startGame();');
    assert.equal(a.run("game.pieces.length"), count);
    assert.equal(a.node("#piece-progress").getAttribute("aria-valuemax"), String(count));
    const resumed = app(a.storage);
    resumed.run("resumeSavedGame();");
    assert.equal(resumed.run("game.pieces.length"), count);
    resumed.run(`game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
      prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
    await resumed.run("completeGame();");
    assert.equal(Object.hasOwn(JSON.parse(a.storage.get(KEY)).records.at(-1), "pieceCount"), false);
    const reloaded = app(a.storage);
    assert.equal(reloaded.run("data.records.at(-1).difficulty"), id);
    assert.ok(reloaded.node("#gallery-content").innerHTML.includes(`${count} pieces`));
    assert.match(reloaded.node("#gallery-content").innerHTML, /24 pieces/);
  }
});

test("blank names and dismissed setup edits keep the suggested title", async () => {
  for (const dismiss of ["#cancel-rename", "#modal-close"]) {
    const a = app();
    a.run('showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5 });');
    const suggested = a.node("#setup-puzzle-name").textContent;
    await a.node("#edit-setup-name-button").click();
    a.node("#rename-input").value = "   ";
    await a.node("#rename-form").emit("submit");
    assert.equal(a.node("#modal").open, true);
    assert.equal(a.node("#setup-puzzle-name").textContent, suggested);
    assert.equal(a.node("#rename-input").validationMessage, "Please enter a puzzle name.");
    a.node("#rename-input").value = "Unsaved edit";
    await a.node("#rename-input").emit("input");
    assert.equal(a.node("#rename-input").validationMessage, "");
    await a.node(dismiss).click();
    assert.equal(a.node("#modal").open, false);
    assert.equal(a.node("#setup-puzzle-name").textContent, suggested);
  }
});

test("replacing or removing a photo discards its custom name and ignores a stale name editor", async () => {
  for (const replace of [false, true]) {
    const a = app();
    a.run('showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5 });');
    await a.node("#edit-setup-name-button").click();
    a.node("#rename-input").value = "Old picture name";
    await a.node("#rename-form").emit("submit");
    await a.node("#edit-setup-name-button").click();
    a.node("#rename-input").value = "Stale edit";
    if (replace) a.run('showPhoto({ image: "data:image/jpeg;base64,BBBB", ratio: 1 });');
    else await a.node("#remove-photo-button").click();
    const current = a.node("#setup-puzzle-name").textContent;
    assert.notEqual(current, "Old picture name");
    await a.node("#rename-form").emit("submit");
    assert.equal(a.node("#setup-puzzle-name").textContent, current);
    assert.equal(a.node("#setup-title").hidden, !replace);
    assert.equal(a.node("#launch-tagline").hidden, replace);
    assert.equal(a.node("#edit-setup-name-button").disabled, !replace);
  }
});

test("the shared in-game name editor saves trimmed names and preserves running or paused state", async () => {
  for (const initiallyPaused of [false, true]) {
    const a = app();
    a.run("resumeSavedGame();");
    if (initiallyPaused) a.run("pause();");
    await a.node("#edit-name-button").click();
    assert.equal(a.run("paused"), true);
    a.node("#rename-input").value = "  A renamed memory  ";
    await a.node("#rename-form").emit("submit");
    assert.equal(a.node("#game-name").textContent, "A renamed memory");
    assert.equal(JSON.parse(a.storage.get(KEY)).active.name, "A renamed memory");
    assert.equal(a.run("paused"), initiallyPaused);
    await a.node("#edit-name-button").click();
    a.node("#rename-input").value = "An unsaved name";
    await a.node("#cancel-rename").click();
    assert.equal(a.node("#game-name").textContent, "A renamed memory");
    assert.equal(JSON.parse(a.storage.get(KEY)).active.name, "A renamed memory");
    assert.equal(a.run("paused"), initiallyPaused);
  }
});

test("Options dismisses with Escape or outside interaction and preserves storage", async () => {
  const a = app(), before = a.storage.get(KEY);
  await a.node("#options-toggle").click();
  assert.equal(a.node("#options-panel").hidden, false);
  assert.equal(a.node("#options-toggle").getAttribute("aria-expanded"), "true");
  await a.node("#footer-options").emit("keydown", { key: "Escape" });
  assert.equal(a.node("#options-panel").hidden, true);
  assert.equal(a.document.activeElement, a.node("#options-toggle"));
  for (const event of ["click", "focusin"]) {
    await a.node("#options-toggle").click();
    await a.document.emit(event, { target: a.node("#main") });
    assert.equal(a.node("#options-panel").hidden, true);
  }
  assert.equal(a.storage.get(KEY), before);
});

test("erase requires confirmation and cancel preserves saved memories", async () => {
  const a = app(), before = a.storage.get(KEY);
  await a.node("#erase-button").click();
  assert.equal(a.storage.get(KEY), before);
  assert.equal(a.node("#modal").open, true);
  assert.equal(a.document.activeElement, a.node("#cancel-erase"));
  await a.node("#cancel-erase").click();
  assert.equal(a.node("#modal").open, false);
  assert.equal(a.storage.get(KEY), before);
});

test("confirmed erase clears Snapscape, releases photos, and prevents later autosaves", async () => {
  const a = app();
  a.storage.set("another-app", "keep me");
  a.run('game = data.active; paused = true; gameImageUrl = "blob:old-photo"; selectedPhoto = { image: "private photo" };');
  a.node("#puzzle-board").innerHTML = "private puzzle";
  a.node("#piece-tray").innerHTML = "private pieces";
  await a.node("#erase-button").click();
  await a.node("#confirm-erase").click();
  assert.equal(a.storage.has(KEY), false);
  assert.equal(a.storage.get("another-app"), "keep me");
  assert.equal(a.run("game === null && selectedPhoto === null && paused"), true);
  assert.equal(a.node("#total-points").textContent, "0");
  assert.equal(String(a.node("#gallery-count").textContent), "0");
  assert.equal(a.node("#game").hidden, true);
  assert.equal(a.node("#setup").hidden, false);
  assert.equal(a.node("#puzzle-board").innerHTML, "");
  assert.equal(a.node("#piece-tray").innerHTML, "");
  assert.deepEqual(a.revoked, ["blob:old-photo"]);
  for (const timer of a.intervals) timer();
  await a.window.emit("pagehide");
  assert.equal(a.storage.has(KEY), false);
  // A new puzzle can still be saved after erasing.
  a.run(`data.active = ${JSON.stringify(savedProgress().active)}; save();`);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.id, "active-puzzle");
});

test("failed erasure keeps saved and in-memory progress and reports the failure", async () => {
  const a = app(), before = a.storage.get(KEY);
  a.localStorage.removeItem = () => { throw new Error("Storage denied"); };
  await a.node("#erase-button").click();
  await a.node("#confirm-erase").click();
  assert.equal(a.storage.get(KEY), before);
  assert.equal(a.run("data.records.length"), 1);
  assert.equal(a.node("#modal").open, true);
  assert.equal(a.node("#erase-error").hidden, false);
  assert.match(a.node("#erase-error").textContent, /could not erase/);
});

test("a stale tab cannot restore erased data before receiving the storage event", async () => {
  const first = app(), second = app(first.storage);
  second.run("game = data.active; paused = false;");
  await first.node("#erase-button").click();
  await first.node("#confirm-erase").click();
  for (const timer of second.intervals) timer();
  await second.window.emit("pagehide");
  assert.equal(first.storage.has(KEY), false);
  assert.equal(second.run("game"), null);
  assert.equal(second.node("#total-points").textContent, "0");
});

test("external erasure cancels pending backup and photo loads", async () => {
  const a = app();
  let finishImport;
  const pendingImport = a.node("#import-input").emit("change", {
    target: { files: [{ size: 100, text: () => new Promise((resolve) => { finishImport = resolve; }) }], value: "" },
  });
  a.run("prepareImage = () => new Promise(resolve => { globalThis.finishPhoto = resolve; });");
  const pendingPhoto = a.run("useSample()");
  a.storage.delete(KEY);
  await a.window.emit("storage", { key: KEY, newValue: null });
  finishImport(JSON.stringify(savedProgress()));
  a.run('finishPhoto({ image: "old photo", ratio: 1 });');
  await Promise.all([pendingImport, pendingPhoto]);
  assert.equal(a.node("#modal").open, false);
  assert.equal(a.run("selectedPhoto"), null);
  assert.equal(a.node("#start-button").disabled, true);
  assert.equal(a.storage.has(KEY), false);
});

test("erasing invalidates a backup confirmation already open in another tab", async () => {
  const a = app(), backup = { ...savedProgress(), active: null };
  await a.node("#import-input").emit("change", {
    target: { files: [{ size: 100, text: async () => JSON.stringify(backup) }], value: "" },
  });
  const staleConfirmation = a.node("#confirm-import").onclick;
  a.storage.delete(KEY);
  await a.window.emit("storage", { key: KEY, newValue: null });
  staleConfirmation();
  assert.equal(a.storage.has(KEY), false);
  assert.equal(a.run("data.records.length"), 0);
});

test("backup export and confirmed restore still work through Options", async () => {
  const a = app(), original = JSON.parse(a.storage.get(KEY));
  await a.node("#options-toggle").click();
  await a.node("#export-button").click();
  const backup = JSON.parse(await a.blobs[0].text());
  assert.equal(backup.records[0].id, original.records[0].id);
  assert.equal(backup.active.id, original.active.id);
  assert.equal(a.node("#options-panel").hidden, true);
  let pickerOpened = false;
  a.node("#import-input").addEventListener("click", () => { pickerOpened = true; });
  await a.node("#options-toggle").click();
  await a.node("#import-button").click();
  assert.equal(pickerOpened, true);
  const restored = { ...backup, active: null };
  restored.records[0].name = "Restored memory";
  await a.node("#import-input").emit("change", {
    target: { files: [{ size: 100, text: async () => JSON.stringify(restored) }], value: "" },
  });
  assert.equal(JSON.parse(a.storage.get(KEY)).records[0].name, "Finished memory");
  await a.node("#confirm-import").click();
  assert.equal(JSON.parse(a.storage.get(KEY)).records[0].name, "Restored memory");
  assert.equal(a.node("#modal").open, false);
});

test("progress ring counts only locked pieces, restores progress, and resets for a new puzzle", () => {
  const a = app();
  a.run("game = data.active; updateGameProgress();");
  const progress = a.node("#piece-progress"), fill = a.node("#piece-progress-fill");
  assert.equal(progress.getAttribute("aria-valuemax"), "24");
  assert.equal(progress.getAttribute("aria-valuenow"), "0");
  assert.equal(fill.getAttribute("stroke-dashoffset"), "100");
  // Half locked, one loose piece on the table, and eleven still in the tray.
  a.run(`game.pieces = Array.from({ length: 24 }, (_, i) =>
    i < 12 ? { id: i, group: i, ...target(game, i), locked: true }
      : i === 12 ? { id: i, group: i, x: 50, y: 50, locked: false } : null);
    updateGameProgress();`);
  assert.equal(a.node("#placed-count").textContent, "12 / 24");
  assert.equal(progress.getAttribute("aria-valuetext"), "12 of 24 pieces placed");
  assert.equal(fill.getAttribute("stroke-dashoffset"), "50");
  // A fresh app reads the stored state and computes the same progress on resume.
  a.run("save();");
  const resumed = app(a.storage);
  resumed.run("game = data.active; updateGameProgress();");
  assert.equal(resumed.node("#piece-progress").getAttribute("aria-valuenow"), "12");
  assert.equal(resumed.node("#piece-progress-fill").getAttribute("stroke-dashoffset"), "50");
  a.run("game.pieces.fill({ locked: true }); updateGameProgress();");
  assert.equal(progress.getAttribute("aria-valuenow"), "24");
  assert.equal(fill.getAttribute("stroke-dashoffset"), "0");
  a.run('game = { difficulty: "legend", pieces: Array(192).fill(null) }; updateGameProgress();');
  assert.equal(a.node("#placed-count").textContent, "0 / 192");
  assert.equal(progress.getAttribute("aria-valuemax"), "192");
  assert.equal(progress.getAttribute("aria-valuenow"), "0");
  assert.equal(fill.getAttribute("stroke-dashoffset"), "100");
});

test("board uses the full table width, reserves mobile tools and tray, and retains zoom after resizing", () => {
  const a = app();
  a.run("game = data.active;");
  a.node("#game").hidden = false;
  const layout = a.node(".game-layout"), board = a.node("#puzzle-board");
  a.node("#table-scroll").rect.top = 200;
  a.node(".table-tools").rect.height = 44;
  a.node(".tray-panel").rect.height = 200;
  for (const [screenWidth, areaWidth, tableWidth, tableHeight] of [
    [1280, 836, 836, 688],
    [901, 495, 495, 688],
    [900, 810, 810, 420],
    [390, 351, 351, 420],
  ]) {
    a.window.innerWidth = screenWidth;
    a.node(".table-area").clientWidth = areaWidth;
    a.run("sizeBoard();");
    assert.equal(layout.style["--table-width"], `${tableWidth}px`);
    assert.equal(layout.style["--table-height"], `${tableHeight}px`);
    assert.ok(parseFloat(board.style.width) <= tableWidth + 1e-9);
    assert.ok(parseFloat(board.style.height) <= tableHeight + 1e-9);
  }
  // The tray measurement includes its internal filter row.
  a.node(".tray-panel").rect.height = 280;
  a.run("sizeBoard();");
  assert.equal(layout.style["--table-height"], "340px");
  a.node("#table-scroll").rect.top = 240;
  a.run("sizeBoard();");
  assert.equal(layout.style["--table-height"], "300px");
  const fittedWidth = parseFloat(board.style.width);
  a.run("zoomLevel = 2; sizeBoard();");
  assert.equal(layout.style["--table-height"], "300px");
  assert.equal(parseFloat(board.style.width), fittedWidth * 2);
});

test("the desktop tray follows the fitted picture, reserves controls, and stays within the table viewport", () => {
  const a = app();
  a.run("game = data.active; game.ratio = 4 / 3;");
  a.node("#game").hidden = false;
  const layout = a.node(".game-layout"), board = a.node("#puzzle-board");
  a.node("#table-scroll").rect.top = 80;
  a.node(".table-area").clientWidth = 980;
  a.node(".game-info").rect.height = 116;
  a.node(".table-tools").rect.height = 44;
  a.node(".game-sidebar").computedStyle.rowGap = "14px";
  a.window.innerHeight = 1100;
  a.run("sizeBoard();");
  const fittedHeight = parseFloat(board.style.height);
  assert.equal(parseFloat(layout.style["--sidebar-height"]), fittedHeight);
  assert.ok(fittedHeight < parseFloat(layout.style["--table-height"]));

  for (const zoom of [0.5, 1.25, 2]) {
    a.run(`zoomLevel = ${zoom}; sizeBoard();`);
    assert.equal(parseFloat(layout.style["--sidebar-height"]), fittedHeight);
  }
  // Panoramas still leave a useful 120px tray below the title and tools.
  a.run("game.ratio = 7; zoomLevel = 1; sizeBoard();");
  assert.equal(layout.style["--sidebar-height"], "308px");
  a.node(".game-info").rect.height = 164;
  a.run("sizeBoard();");
  assert.equal(layout.style["--sidebar-height"], "356px");

  // A short window limits the column, letting the pieces scroll inside it.
  a.window.visualViewport = { height: 400 };
  a.run("sizeBoard();");
  assert.equal(layout.style["--sidebar-height"], "308px");
  assert.equal(layout.style["--sidebar-height"], layout.style["--table-height"]);
  a.window.visualViewport.height = 700;
  a.run("game.ratio = 2 / 3; sizeBoard();");
  assert.equal(layout.style["--sidebar-height"], "608px");
  assert.equal(layout.style["--sidebar-height"], layout.style["--table-height"]);
});

test("zoom presets scale the picture, mark the selection, restore focus, and reset to Fit on reopen", async () => {
  const a = app();
  a.run("resumeSavedGame();");
  const board = a.node("#puzzle-board"), table = a.node("#table-scroll");
  const width = parseFloat(board.style.width), height = parseFloat(board.style.height);
  const scrolls = [];
  table.scrollTo = (...args) => scrolls.push(args);
  const presets = [0.5, 0.75, 1, 1.25, 1.5, 2];
  for (const zoom of presets) {
    await a.node("#zoom-button").click();
    assert.equal(a.node("#zoom-panel").hidden, false);
    assert.equal(a.document.activeElement, a.node(`[data-zoom="${a.run("zoomLevel")}"]`));
    await a.node(`[data-zoom="${zoom}"]`).click();
    assert.equal(parseFloat(board.style.width), width * zoom);
    assert.equal(parseFloat(board.style.height), height * zoom);
    assert.equal(a.node("#zoom-button").getAttribute("aria-label"), `Zoom: ${zoom === 1 ? "Fit" : `${zoom * 100}%`}`);
    assert.equal(a.node("#zoom-panel").hidden, true);
    assert.equal(a.node("#zoom-button").getAttribute("aria-expanded"), "false");
    assert.equal(a.document.activeElement, a.node("#zoom-button"));
    for (const value of presets) {
      assert.equal(a.node(`[data-zoom="${value}"]`).getAttribute("aria-pressed"), String(value === zoom));
    }
  }
  assert.deepEqual(scrolls, [[0, 0], [0, 0], [0, 0]]);
  await a.node('[data-zoom="1"]').click();
  assert.equal(parseFloat(board.style.width), width);
  assert.deepEqual(scrolls.at(-1), [0, 0]);
  await a.node('[data-zoom="2"]').click();
  a.run("openGame();");
  assert.equal(a.run("zoomLevel"), 1);
  assert.equal(a.node("#zoom-button").title, "Zoom: Fit");
});

test("zoom selection survives dismissal by Escape, toggle, outside click, or focus", async () => {
  const a = app();
  a.run("resumeSavedGame();");
  await a.node('[data-zoom="1.25"]').click();
  await a.node("#zoom-button").click();
  await a.document.emit("focusin", { target: a.node('[data-zoom="0.5"]') });
  assert.equal(a.node("#zoom-panel").hidden, false);
  await a.node("#zoom-control").emit("keydown", { key: "Escape" });
  assert.equal(a.node("#zoom-panel").hidden, true);
  assert.equal(a.document.activeElement, a.node("#zoom-button"));
  await a.node("#zoom-button").click();
  await a.node("#zoom-button").click();
  assert.equal(a.node("#zoom-panel").hidden, true);
  for (const type of ["click", "focusin"]) {
    await a.node("#zoom-button").click();
    await a.document.emit(type, { target: a.node("#main") });
    assert.equal(a.node("#zoom-panel").hidden, true);
  }
  assert.equal(a.run("zoomLevel"), 1.25);
});

test("autosave and navigation preserve progress without a separate save button", async () => {
  for (const exit of ['.brand', '[data-view="gallery"]', '[data-view="achievements"]']) {
    const a = app();
    a.run(`game = data.active; paused = false; elapsed = 42; runStart = 1000;
      game.pieces[0] = { id: 0, group: 0, ...target(game, 0), locked: true };`);
    for (const timer of a.intervals) timer();
    assert.equal(JSON.parse(a.storage.get(KEY)).active.pieces[0].locked, true);
    a.run("elapsed = 50;");
    await a.window.emit("pagehide");
    assert.equal(JSON.parse(a.storage.get(KEY)).active.seconds, 50);
    a.run("elapsed = 60;");
    await a.node(exit).click();
    const saved = JSON.parse(a.storage.get(KEY));
    assert.equal(saved.active.seconds, 60);
    assert.equal(saved.active.pieces[0].locked, true);
    assert.equal(a.run("game === null && paused"), true);
    assert.equal(a.node("#game").hidden, true);
    assert.equal(a.node("#play-nav-label").textContent, "Continue puzzle");
    if (exit === '.brand') assert.equal(a.node("#setup").hidden, false);
  }
});

test("the tray filter remains usable while carrying a piece and is outside the return target", async () => {
  const a = app();
  a.run("game = data.active; paused = false; selected = 0;");
  a.node(".tray-panel").rect = { left: 100, right: 400, top: 100, bottom: 500 };
  a.node(".tray-body").rect = { left: 100, right: 400, top: 148, bottom: 500 };
  assert.equal(a.run("withinTray(350, 120)"), false);
  assert.equal(a.run("withinTray(350, 180)"), true);
  await a.node("#edges-button").click();
  assert.equal(a.node("#edges-button").getAttribute("aria-pressed"), "true");
  assert.equal(a.node("#clear-selection").hidden, false);
  assert.equal(a.node("#piece-tray").inert, true);
  assert.equal(a.run("selected"), 0);
  await a.node("#edges-button").click();
  assert.equal(a.node("#edges-button").getAttribute("aria-pressed"), "false");
});

test("first guide use requires confirmation, cancellation is free, and later uses persist without another prompt", async () => {
  const a = app();
  a.run("resumeSavedGame();");
  await a.node("#reference-button").click();
  assert.equal(a.node("#modal").open, true);
  assert.match(a.node("#modal-content").innerHTML, /1 Snap Points/);
  assert.equal(a.run("paused && !showGuide && game.guideUses === 0"), true);
  await a.node("#cancel-guide").click();
  assert.equal(a.run("!paused && !showGuide && game.guideUses === 0"), true);
  await a.node("#reference-button").click();
  await a.node("#confirm-guide").click();
  assert.equal(a.run("!paused && showGuide && game.guideUses === 1"), true);
  assert.equal(a.node("#reference-button").getAttribute("aria-pressed"), "true");
  assert.equal(a.node("#guide-image").getAttribute("opacity"), ".4");
  assert.equal(JSON.parse(a.storage.get(KEY)).active.guideUses, 1);
  await a.node("#reference-button").click();
  assert.equal(a.run("!showGuide && game.guideUses === 1"), true);
  const resumed = app(a.storage);
  resumed.run("resumeSavedGame();");
  assert.equal(resumed.run("showGuide"), false);
  await resumed.node("#reference-button").click();
  assert.equal(Boolean(resumed.node("#modal").open), false);
  assert.equal(resumed.run("showGuide && game.guideUses === 2"), true);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.guideUses, 2);
  resumed.run("pause();");
  assert.equal(resumed.node("#reference-button").disabled, true);
  await resumed.node("#reference-button").click();
  assert.equal(resumed.run("game.guideUses"), 2);
});

test("canceling the first guide notice with the dialog close control costs nothing", async () => {
  const a = app();
  a.run("resumeSavedGame();");
  await a.node("#reference-button").click();
  await a.node("#modal-close").click();
  assert.equal(a.run("!paused && !showGuide && game.guideUses === 0"), true);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.guideUses, 0);
});

test("a new puzzle resets guide usage and shows its own difficulty-specific confirmation", async () => {
  const a = app();
  a.run("data.active.guideUses = 7; resumeSavedGame();");
  a.node('[name=difficulty]:checked').value = "legend";
  a.run('selectedPhoto = { image: "data:image/jpeg;base64,AAAA", ratio: 1.5, suggestedName: "New memory" }; startGame();');
  assert.equal(a.run("game.guideUses"), 0);
  assert.equal(a.run("showGuide"), false);
  await a.node("#reference-button").click();
  assert.match(a.node("#modal-content").innerHTML, /14 Snap Points/);
  await a.node("#confirm-guide").click();
  assert.equal(a.run("game.guideUses"), 1);
});

test("piece selection keeps the preview; keyboard placement and real dragging hide it without another charge", async () => {
  const a = app();
  a.run("data.active.guideUses = 1; resumeSavedGame();");
  await a.node("#reference-button").click();
  a.run("selectPiece(0);");
  assert.equal(a.run("showGuide"), true);
  await a.node("#puzzle-board").emit("keydown", { key: "ArrowRight" });
  assert.equal(a.run("showGuide"), true);
  await a.node("#puzzle-board").emit("keydown", { key: "Enter" });
  assert.equal(a.run("showGuide"), false);
  assert.equal(a.run("game.guideUses"), 2);
  assert.equal(a.node("#reference-button").getAttribute("aria-pressed"), "false");
  await a.node("#reference-button").click();
  a.run("boardPoint = (x, y) => ({ x, y });");
  const target = { closest: () => ({ dataset: { piece: "1" } }) };
  await a.node("#piece-tray").emit("pointerdown", {
    target, isPrimary: true, button: 0, pointerId: 7, clientX: 100, clientY: 100,
  });
  await a.window.emit("pointermove", { pointerId: 7, clientX: 103, clientY: 103 });
  assert.equal(a.run("showGuide"), true);
  await a.window.emit("pointermove", { pointerId: 7, clientX: 120, clientY: 120 });
  assert.equal(a.run("showGuide"), false);
  assert.equal(a.run("game.guideUses"), 3);
  await a.window.emit("pointercancel", { pointerId: 7 });
  assert.equal(a.run("showGuide"), false);
});

test("tap placement and returning a loose group to the tray hide the preview", async () => {
  const a = app();
  a.run("data.active.guideUses = 1; resumeSavedGame(); boardPoint = (x, y) => ({ x, y });");
  await a.node("#reference-button").click();
  a.run("selectPiece(0);");
  await a.node("#puzzle-board").emit("click", {
    target: { closest: () => null }, clientX: 170, clientY: 180,
  });
  assert.equal(a.run("showGuide"), false);
  assert.equal(a.run("game.pieces[0].locked"), false);
  await a.node("#reference-button").click();
  a.run("putPieceBack(0);");
  assert.equal(a.run("showGuide"), false);
  assert.equal(a.run("game.pieces[0]"), null);
  assert.equal(a.run("game.guideUses"), 3);
});

test("a stale guide confirmation cannot charge or reveal a replacement puzzle", async () => {
  const a = app();
  a.run("resumeSavedGame();");
  await a.node("#reference-button").click();
  const confirm = a.node("#confirm-guide").onclick;
  const replacement = savedProgress();
  replacement.active.id = "replacement-puzzle";
  replacement.active.guideUses = 0;
  const raw = JSON.stringify(replacement);
  a.storage.set(KEY, raw);
  await a.window.emit("storage", { key: KEY, newValue: raw });
  confirm();
  assert.equal(a.run("game"), null);
  assert.equal(a.run("data.active.guideUses"), 0);
  assert.equal(a.run("showGuide"), false);
  assert.equal(a.storage.get(KEY), raw);
});

test("completion records, totals and backups use the guide-adjusted reward, including zero-point finishes", async () => {
  for (const uses of [2, 10, 11]) {
    const a = app();
    a.run(`game = data.active; game.guideUses = ${uses}; paused = false; elapsed = 60; runStart = 1000;
      game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
      prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
    await a.run("completeGame();");
    const saved = engine.validateData(JSON.parse(a.storage.get(KEY)));
    const record = saved.records.at(-1), award = engine.score("breezy", 60, uses);
    assert.equal(record.guideUses, uses);
    assert.equal(record.points, award.total);
    assert.equal(saved.active, null);
    assert.equal(a.node("#total-points").textContent, engine.achievementProgress(saved.records, saved).totalPoints.toLocaleString());
    await a.node("#win-stats-button").click();
    assert.ok(a.node("#modal-content").innerHTML.includes(`Picture guide (${uses} uses)</dt><dd>−${award.guidePenalty.toLocaleString()}</dd>`));
    await a.node("#export-button").click();
    const backup = engine.validateData(JSON.parse(await a.blobs.at(-1).text()));
    assert.equal(backup.records.at(-1).guideUses, uses);
    assert.equal(backup.records.at(-1).points, award.total);
  }
});

test("Snappy guide copy and completion report whole deductions and rewards consistently", async () => {
  const a = app(new Map());
  a.node('[name=difficulty]:checked').value = "snappy";
  a.run('showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: true }); startGame();');
  await a.node("#reference-button").click();
  assert.ok(a.node("#modal-content").innerHTML.includes(`3 Snap Points`));
  await a.node("#confirm-guide").click();
  assert.match(a.node("#announcement").textContent, /3 Snap Points deducted so far/);
  a.run(`elapsed = 60;
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
  await a.run("completeGame();");
  const record = engine.validateData(JSON.parse(a.storage.get(KEY))).records[0];
  assert.equal(record.points, 34);
  assert.equal(record.guideUses, 1);
  assert.ok(a.node("#modal-content").innerHTML.includes(`<span class="sr-only">+${(79).toLocaleString()}</span>`));
  await a.node("#win-stats-button").click();
  const content = a.node("#modal-content").innerHTML;
  assert.ok(content.includes(`Picture guide (1 use)</dt><dd>−${(3).toLocaleString()}</dd>`));
  assert.ok(content.includes(`Time bonus</dt><dd>+${(12).toLocaleString()}</dd>`));
  assert.ok(content.includes("Achievement bonus</dt><dd>+45</dd>"));
  assert.equal(a.node("#total-points").textContent, (84).toLocaleString());
});

test("Snappy guide announces a zero reward once rounded deductions exhaust it", async () => {
  const a = app(new Map());
  a.node('[name=difficulty]:checked').value = "snappy";
  a.run(`showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5 }); startGame();
    elapsed = 1200; game.guideUses = 8;`);
  await a.node("#reference-button").click();
  assert.equal(a.run("game.guideUses"), 9);
  assert.match(a.node("#announcement").textContent, /This puzzle will earn no points/);
});

test("legacy fractional rewards become whole in loaded totals, galleries, exports, and restored backups", async () => {
  const legacy = savedProgress();
  legacy.active = null;
  const record = legacy.records[0];
  legacy.records = [
    { ...record, points: 13.8 },
    { ...record, id: "guided-snappy", difficulty: "snappy", guideUses: 1, points: 33.8 },
    { ...record, id: "exhausted-snappy", difficulty: "snappy", seconds: 600, guideUses: 9, points: 2.5 },
  ];
  const backup = JSON.stringify(legacy);
  const loaded = app(new Map([[KEY, backup]]));
  const restored = app(new Map());
  await restored.node("#import-input").emit("change", {
    target: { files: [{ size: backup.length, text: async () => backup }], value: "" },
  });
  await restored.node("#confirm-import").click();
  for (const a of [loaded, restored, app(restored.storage)]) {
    assert.equal(a.node("#total-points").textContent, "87");
    a.run('switchView("gallery");');
    for (const points of [14, 34, 4]) {
      assert.ok(a.node("#gallery-content").innerHTML.includes(`<span>+${points}</span>`));
    }
    await a.node("#export-button").click();
    const exported = JSON.parse(await a.blobs.at(-1).text());
    assert.deepEqual(exported.records.map((r) => r.points), [14, 34, 4]);
    assert.equal(engine.achievementProgress(exported.records, exported).totalPoints, 87);
  }
});

test("zero-point completions still award achievements once and replays only add the puzzle reward", async () => {
  const saved = savedProgress();
  saved.records = [];
  saved.active.guideUses = 10;
  const a = app(new Map([[KEY, JSON.stringify(saved)]]));
  assert.equal(a.node("#total-points").textContent, "10");
  a.run(`game = data.active; elapsed = 60;
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
  await a.run("completeGame();");
  assert.equal(JSON.parse(a.storage.get(KEY)).records[0].points, 0);
  assert.match(a.node("#modal-content").innerHTML, /<span class="sr-only">\+30<\/span>/);
  assert.match(a.node("#modal-content").innerHTML, /<h4>First Chomp<\/h4>/);
  await a.node("#win-stats-button").click();
  assert.ok(a.node("#modal-content").innerHTML.includes("Achievement bonus</dt><dd>+30</dd>"));
  assert.equal(a.node("#total-points").textContent, "40");
  assert.equal(app(a.storage).node("#total-points").textContent, "40");

  a.node('[name=difficulty]:checked').value = "breezy";
  a.run(`closeModal();
    showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: false }); startGame();
    elapsed = 60;
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));`);
  await a.run("completeGame();");
  assert.doesNotMatch(a.node("#modal-content").innerHTML, /achievement bonus|New achievements/);
  assert.ok(a.node("#modal-content").innerHTML.includes(`<span class="sr-only">+${(14).toLocaleString()}</span>`));
  assert.equal(a.node("#total-points").textContent, (54).toLocaleString());
  assert.equal(app(a.storage).node("#total-points").textContent, (54).toLocaleString());
  assert.match(a.node("#announcement").textContent, /Puzzle complete!/);
  await a.node("#win-stats-button").click();
  assert.doesNotMatch(a.node("#modal-content").innerHTML, /Achievement bonus/);
});

test("completion Stats replaces the celebration and Back restores it without awarding again", async () => {
  for (const [action, destination] of [["#play-again", "play"], ["#see-trophy", "gallery"]]) {
    const saved = savedProgress();
    saved.records = [];
    const a = app(new Map([[KEY, JSON.stringify(saved)]]));
    a.run(`game = data.active; elapsed = 60;
      game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
      prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
    await a.run("completeGame();");
    const stored = a.storage.get(KEY), total = a.node("#total-points").textContent;
    const announcement = a.node("#announcement").textContent;
    const celebration = a.node("#modal-content").innerHTML;
    assert.equal(a.document.activeElement, a.node("#play-again"));
    assert.doesNotMatch(celebration, /Snap Points earned|Points breakdown|<details|achievement-reward|win-achievement-description/);
    assert.match(celebration, /<h4>First Chomp<\/h4>/);
    for (let visit = 0; visit < 3; visit++) {
      await a.node("#win-stats-button").click();
      assert.equal(a.node("#modal").open, true);
      assert.equal(a.node("#modal").getAttribute("aria-labelledby"), "win-stats-title");
      assert.equal(a.document.activeElement, a.node("#win-stats-back"));
      assert.doesNotMatch(a.node("#modal-content").innerHTML, /id="win-title"|win-achievements/);
      assert.match(a.node("#modal-content").innerHTML, /<dt>Time<\/dt><dd>1:00<\/dd>/);
      assert.ok(a.node("#modal-content").innerHTML.includes(`Total</dt><dd>+${(44).toLocaleString()}`));
      await a.node("#win-stats-back").click();
      assert.equal(a.node("#modal").getAttribute("aria-labelledby"), "win-title");
      assert.equal(a.document.activeElement, a.node("#win-stats-button"));
      assert.equal(a.node("#modal-content").innerHTML.replace('class="win win-returned"', 'class="win"'), celebration);
      assert.equal(a.storage.get(KEY), stored);
      assert.equal(a.node("#total-points").textContent, total);
      assert.equal(a.node("#announcement").textContent, announcement);
    }
    await a.node(action).click();
    assert.equal(a.node("#modal").open, false);
    assert.equal(a.run("view"), destination);
    assert.equal(a.storage.get(KEY), stored);
  }
});

test("score reels settle on the exact accessible reward, including zero and grouped whole numbers", () => {
  const a = app();
  for (const points of [0, 10, 78, 144, 1234]) {
    const markup = a.run(`scoreReels(${points})`);
    assert.ok(markup.includes(`<span class="sr-only">+${points.toLocaleString()}</span>`));
    const visual = markup.split('<span class="score-reels" aria-hidden="true">')[1];
    // Read the last cell of each reel, which is the resting position both
    // after animation and when reduced motion disables the animation.
    const settled = visual.replace(
      /<span class="score-reel"><span class="score-reel-strip"[^>]*>((?:<span>[^<]*<\/span>)+)<\/span><\/span>/g,
      (_, strip) => [...strip.matchAll(/<span>([^<]*)<\/span>/g)].at(-1)[1],
    ).replace(/<[^>]+>/g, "");
    assert.equal(settled, `+${points.toLocaleString()}`);
  }
});

test("first guide use can unlock a point milestone and synchronizes totals, cards, and notifications", async () => {
  const saved = savedProgress();
  saved.records = [["legend", 4114], ["bold", 1200], ["bold", 0], ["snappy", 2400]]
    .map(([difficulty, seconds], i) => ({
      id: `guide-milestone-${i}`, name: "Memory", difficulty, seconds,
      points: engine.score(difficulty, seconds).total,
      date: "2026-10-01T12:00:00Z", thumbnail: null,
    }));
  const a = app(new Map([[KEY, JSON.stringify(saved)]]));
  assert.equal(a.node("#total-points").textContent, "495");
  a.run("resumeSavedGame();");
  await a.node("#reference-button").click();
  await a.node("#confirm-guide").click();
  assert.equal(a.node("#total-points").textContent, "525");
  assert.equal(a.node("#achievement-count").textContent, "6");
  assert.match(a.node("#toast").textContent, /A Little Guidance \(\+5 Snap Points\)/);
  assert.match(a.node("#toast").textContent, /Orange & Blue Ribbon \(\+25 Snap Points\)/);
  assert.match(a.node("#announcement").textContent, /Orange & Blue Ribbon/);
  assert.ok(a.node("#achievement-content").innerHTML.includes(`525 / ${(1000).toLocaleString()} points`));
  assert.equal(app(a.storage).node("#total-points").textContent, "525");
});

test("a random picture keeps its identity through renaming, resume, completion, and backup restore", async () => {
  const a = app(new Map());
  a.run(`let loadedSource;
    prepareImage = async (src) => {
      loadedSource = src;
      return { image: "data:image/jpeg;base64,AAAA", ratio: 1.5 };
    };`);
  await a.node("#sample-button").click();
  const sampleId = a.run("selectedPhoto.sampleId");
  assert.ok(engine.SAMPLE_SNAPSCAPES.includes(sampleId));
  assert.equal(a.run("loadedSource"), `./assets/snapscape-${sampleId}.png`);
  await a.node("#edit-setup-name-button").click();
  a.node("#rename-input").value = "A completely different name";
  await a.node("#rename-form").emit("submit");
  a.node('[name=difficulty]:checked').value = "breezy";
  await a.node("#start-button").click();
  assert.equal(JSON.parse(a.storage.get(KEY)).active.sampleId, sampleId);
  const explorer = engine.ACHIEVEMENTS.find((entry) => entry.id === "explorer");
  assert.equal(explorer.progress(JSON.parse(a.storage.get(KEY)).records), "0 / 15 pictures");

  const resumed = app(a.storage);
  resumed.run(`resumeSavedGame();
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
  assert.equal(resumed.run("game.sampleId"), sampleId);
  await resumed.run("completeGame();");
  const completed = JSON.parse(resumed.storage.get(KEY));
  assert.equal(completed.records[0].sampleId, sampleId);
  assert.equal(completed.records[0].name, "A completely different name");
  assert.equal(explorer.progress(completed.records), "1 / 15 pictures");

  await resumed.node("#export-button").click();
  const backup = await resumed.blobs.at(-1).text();
  const restored = app(new Map());
  await restored.node("#import-input").emit("change", {
    target: { files: [{ size: backup.length, text: async () => backup }], value: "" },
  });
  await restored.node("#confirm-import").click();
  const imported = JSON.parse(restored.storage.get(KEY));
  assert.equal(imported.records[0].sampleId, sampleId);
  assert.equal(explorer.progress(imported.records), "1 / 15 pictures");
  assert.match(restored.node("#achievement-content").innerHTML, /1 \/ 15 pictures/);
  assert.match(restored.node("#achievement-progress").innerHTML, /of 20 achievements earned/);
});

test("replacing a sample with an upload clears its identity even when the filename matches", async () => {
  const a = app(new Map());
  a.run('prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5 });');
  await a.node("#sample-button").click();
  assert.ok(a.run("selectedPhoto.sampleId"));
  await a.run('useFile({ size: 100, type: "image/png", name: "snapscape-beach.png" });');
  a.node('[name=difficulty]:checked').value = "breezy";
  await a.node("#start-button").click();
  assert.equal(a.run("game.sampleId"), null);
  assert.equal(a.run("game.ownPhoto"), true);
  a.run('game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));');
  await a.run("completeGame();");
  const records = JSON.parse(a.storage.get(KEY)).records;
  assert.equal(records[0].sampleId, null);
  assert.equal(engine.ACHIEVEMENTS.find((entry) => entry.id === "explorer").progress(records), "0 / 15 pictures");
});

test("the fifteenth distinct picture unlocks Sunshine Explorer and a replay does not unlock it again", async () => {
  const saved = savedProgress();
  saved.records = engine.SAMPLE_SNAPSCAPES.slice(0, -1).map((sampleId, i) => {
    const level = engine.DIFFICULTIES[i % engine.DIFFICULTIES.length];
    return {
      id: `sample-finish-${i}`, name: "Renamed memory", sampleId,
      difficulty: level.id, seconds: 60, points: engine.score(level.id, 60).total,
      date: "2026-10-01T12:00:00Z", thumbnail: null, ownPhoto: false,
    };
  });
  saved.active.sampleId = engine.SAMPLE_SNAPSCAPES.at(-1);
  saved.active.ownPhoto = false;
  const a = app(new Map([[KEY, JSON.stringify(saved)]]));
  const previousCount = Number(a.node("#achievement-count").textContent);
  assert.match(a.node("#achievement-content").innerHTML, /14 \/ 15 pictures/);
  a.run(`game = data.active; elapsed = 60;
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
  await a.run("completeGame();");
  assert.match(a.node("#modal-content").innerHTML, /Sunshine Explorer/);
  assert.equal(Number(a.node("#achievement-count").textContent), previousCount + 1);
  assert.ok(engine.ACHIEVEMENTS.find((entry) => entry.id === "explorer").test(JSON.parse(a.storage.get(KEY)).records));

  a.node('[name=difficulty]:checked').value = "breezy";
  a.run(`closeModal();
    showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: false, sampleId: SAMPLE_SNAPSCAPES.at(-1) });
    startGame();
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));`);
  await a.run("completeGame();");
  assert.doesNotMatch(a.node("#modal-content").innerHTML, /Sunshine Explorer/);
  assert.equal(Number(a.node("#achievement-count").textContent), previousCount + 1);
  assert.equal(JSON.parse(a.storage.get(KEY)).records.length, 16);
});

test("the first guide achievement unlocks immediately, survives replacement and backup, and resets on erase", async () => {
  const saved = savedProgress();
  saved.records = [];
  const a = app(new Map([[KEY, JSON.stringify(saved)]]));
  a.run("resumeSavedGame();");
  await a.node("#reference-button").click();
  await a.node("#cancel-guide").click();
  assert.equal(a.node("#achievement-count").textContent, "0");
  assert.equal(a.node("#total-points").textContent, "0");
  assert.equal(a.run("data.guideUsed"), false);
  await a.node("#reference-button").click();
  await a.node("#confirm-guide").click();
  assert.equal(a.node("#achievement-count").textContent, "1");
  assert.match(a.node("#toast").textContent, /Achievement earned: A Little Guidance/);
  assert.match(a.node("#toast").textContent, /\+5 Snap Points/);
  assert.equal(a.node("#total-points").textContent, "5");
  assert.equal(JSON.parse(a.storage.get(KEY)).guideUsed, true);
  a.node("#toast").textContent = "No new achievement";
  await a.node("#reference-button").click();
  await a.node("#reference-button").click();
  assert.equal(a.node("#toast").textContent, "No new achievement");
  assert.equal(a.node("#achievement-count").textContent, "1");
  assert.equal(a.node("#total-points").textContent, "5");

  a.node('[name=difficulty]:checked').value = "breezy";
  a.run('showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: true }); startGame();');
  assert.equal(a.run("game.guideUses"), 0);
  assert.equal(a.node("#achievement-count").textContent, "1");
  assert.equal(a.node("#total-points").textContent, "5");
  await a.node("#export-button").click();
  const backup = await a.blobs.at(-1).text();
  const restored = app(new Map());
  restored.run("loadImage = async () => ({});");
  await restored.node("#import-input").emit("change", {
    target: { files: [{ size: backup.length, text: async () => backup }], value: "" },
  });
  await restored.node("#confirm-import").click();
  const reloaded = app(restored.storage);
  assert.equal(reloaded.run("data.guideUsed"), true);
  assert.equal(reloaded.node("#achievement-count").textContent, "1");
  assert.equal(reloaded.node("#total-points").textContent, "5");
  assert.match(reloaded.node("#achievement-progress").innerHTML, /<strong>1<\/strong> of 20/);

  reloaded.run(`resumeSavedGame();
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
  await reloaded.run("completeGame();");
  assert.doesNotMatch(reloaded.node("#modal-content").innerHTML, /A Little Guidance/);
  assert.equal(JSON.parse(reloaded.storage.get(KEY)).guideUsed, true);
  reloaded.run("closeModal();");
  await reloaded.node("#erase-button").click();
  await reloaded.node("#confirm-erase").click();
  assert.equal(reloaded.run("data.guideUsed"), false);
  assert.equal(reloaded.node("#achievement-count").textContent, "0");
  assert.equal(reloaded.node("#total-points").textContent, "0");
  assert.equal(reloaded.storage.has(KEY), false);
});

test("Peek-a-Broke unlocks at zero reward during play and survives replacement, backup, and reload until erasure", async () => {
  for (const [difficulty, seconds, twist, threshold] of [
    ["breezy", 0, false, 10], ["snappy", 1200, false, 9], ["snappy", 1200, true, 9],
  ]) {
    const a = app(new Map());
    a.node('[name=difficulty]:checked').value = difficulty;
    a.node("#random-rotation").setAttribute("aria-pressed", String(twist));
    a.run('showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: false }); startGame();');
    a.run(`elapsed = ${seconds};`);
    await a.node("#reference-button").click();
    await a.node("#cancel-guide").click();
    assert.equal(a.run("data.guideExhausted"), false);
    await a.node("#reference-button").click();
    await a.node("#confirm-guide").click();
    for (let use = 2; use <= threshold; use++) {
      assert.equal(a.run("data.guideExhausted"), false);
      assert.equal(a.node("#total-points").textContent, "5");
      await a.node("#reference-button").click();
      await a.node("#reference-button").click();
    }
    assert.equal(a.run("game.guideUses"), threshold);
    assert.equal(JSON.parse(a.storage.get(KEY)).guideExhausted, true);
    assert.equal(a.node("#total-points").textContent, "10");
    assert.match(a.node("#toast").textContent, /Achievement earned: Peek-a-Broke \(\+5 Snap Points\)/);
    assert.match(a.node("#announcement").textContent, /This puzzle will earn no points/);
    assert.match(a.node("#achievement-content").innerHTML, /<article class="achievement-card unlocked">(?:(?!<\/article>)[\s\S])*<h2>Peek-a-Broke<\/h2>/);
    a.node("#toast").textContent = "No new achievement";
    await a.node("#reference-button").click();
    await a.node("#reference-button").click();
    assert.equal(a.node("#toast").textContent, "No new achievement");
    assert.equal(a.node("#total-points").textContent, "10");

    a.run('showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: false }); startGame();');
    assert.equal(a.run("game.guideUses"), 0);
    await a.node("#export-button").click();
    const backup = await a.blobs.at(-1).text();
    const restored = app(new Map());
    restored.run("loadImage = async () => ({});");
    await restored.node("#import-input").emit("change", {
      target: { files: [{ size: backup.length, text: async () => backup }], value: "" },
    });
    await restored.node("#confirm-import").click();
    const reloaded = app(restored.storage);
    assert.equal(reloaded.run("data.guideExhausted"), true);
    assert.equal(reloaded.node("#total-points").textContent, "10");
    assert.equal(reloaded.node("#achievement-count").textContent, "2");
    await reloaded.node("#erase-button").click();
    await reloaded.node("#confirm-erase").click();
    assert.equal(reloaded.run("data.guideExhausted"), false);
    assert.equal(reloaded.node("#achievement-count").textContent, "0");
    assert.equal(reloaded.storage.has(KEY), false);
  }
});

test("a guide reward exhausted by a fading time bonus is recognized at completion", async () => {
  const a = app(new Map());
  a.node('[name=difficulty]:checked').value = "snappy";
  a.run(`showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: false }); startGame();
    elapsed = 600; game.guideUses = 9; data.guideUsed = true; save(); updateAll();`);
  assert.equal(a.run("data.guideExhausted"), false);
  assert.equal(a.node("#total-points").textContent, "5");
  a.run(`elapsed = 1200;
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
  await a.run("completeGame();");
  assert.match(a.node("#modal-content").innerHTML, /<h4>Peek-a-Broke<\/h4>/);
  assert.match(a.node("#modal-content").innerHTML, /<span class="sr-only">\+15<\/span>/);
  assert.equal(a.node("#total-points").textContent, "20");
  assert.equal(app(a.storage).node("#total-points").textContent, "20");
});

test("achievement details flip independently, dismiss with Escape, and preserve earned progress", async () => {
  const a = app(), before = a.storage.get(KEY);
  const count = a.node("#achievement-count").textContent;
  const grid = a.node("#achievement-content");
  const markup = [...grid.innerHTML.matchAll(/<article class="achievement-card[^"]*">[\s\S]*?<\/article>/g)];
  assert.equal(markup.length, engine.ACHIEVEMENTS.length);
  for (const [i, [html]] of markup.entries()) {
    const [front, back] = html.split('<div class="achievement-face achievement-back"');
    assert.ok(front.includes(`--achievement-icon: url('./assets/${engine.ACHIEVEMENTS[i].icon}_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg')`));
    assert.doesNotMatch(front, /achievement-reward|snap-coin\.png/);
    assert.ok(back.includes(`<span class="achievement-reward"><span class="achievement-points"><span>+${engine.ACHIEVEMENTS[i].points.toLocaleString()}</span>`));
    assert.match(back, /<img class="achievement-coin" src="\.\/assets\/snap-coin\.png" alt="Snap Points" width="20" height="20">/);
    assert.ok(back.includes(`<span>${html.includes("achievement-card unlocked") ? "earned" : "on unlock"}</span>`));
  }
  const cards = markup.slice(0, 2).map(([html], i) => {
    const button = a.node(`#flip-${i}`), card = a.node(`#card-${i}`);
    const front = a.node(`#front-${i}`), back = a.node(`#back-${i}`);
    button.dataset.label = html.match(/data-label="([^"]+)"/)[1];
    button.setAttribute("aria-expanded", "false");
    back.setAttribute("aria-hidden", "true");
    button.closest = (selector) => selector === ".achievement-flip" ? button : card;
    card.querySelector = (selector) => selector === ".achievement-front" ? front : back;
    return { button, front, back };
  });
  const [{ button, front, back }, other] = cards;
  button.focus();
  await grid.emit("click", { target: button });
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(front.getAttribute("aria-hidden"), "true");
  assert.equal(back.getAttribute("aria-hidden"), "false");
  assert.match(button.getAttribute("aria-label"), /Show front of First Chomp \(earned\)/);
  assert.equal(other.button.getAttribute("aria-expanded"), "false");
  assert.equal(other.back.getAttribute("aria-hidden"), "true");
  await grid.emit("keydown", { target: button, key: "ArrowRight" });
  assert.equal(button.getAttribute("aria-expanded"), "true");
  await grid.emit("keydown", { target: button, key: "Escape" });
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(front.getAttribute("aria-hidden"), "false");
  assert.equal(back.getAttribute("aria-hidden"), "true");
  assert.match(button.getAttribute("aria-label"), /Show details for First Chomp \(earned\)/);
  assert.equal(a.document.activeElement, button);
  await grid.emit("click", { target: other.button });
  await grid.emit("click", { target: other.button });
  assert.equal(other.button.getAttribute("aria-expanded"), "false");
  assert.equal(a.node("#achievement-count").textContent, count);
  assert.equal(a.storage.get(KEY), before);
});

test("existing completed history unlocks its milestones and unguided Legend achievement on load", () => {
  const saved = savedProgress();
  saved.records = Array.from({ length: 50 }, (_, i) => {
    const difficulty = engine.DIFFICULTIES[i % 4].id, guideUses = i === 0 ? 1 : 0;
    return {
      id: `existing-finish-${i}`, name: "Old memory", difficulty, guideUses,
      seconds: 2400, points: engine.score(difficulty, 2400, guideUses).total,
      date: "2026-10-01T12:00:00Z", thumbnail: null,
    };
  });
  const a = app(new Map([[KEY, JSON.stringify(saved)]]));
  const unlocked = [...a.node("#achievement-content").innerHTML.matchAll(
    /<article class="achievement-card unlocked">[\s\S]*?<h2>([^<]+)<\/h2>/g,
  )].map((match) => match[1]);
  for (const name of ["A Little Guidance", "Swamp Regular", "Chomp Champion", "Golden Gator", "Every Kind of Chomp", "Look Ma, No Peeks!"]) {
    assert.ok(unlocked.includes(name), name);
  }
  assert.ok(unlocked.includes("Quick on the Chomp"));
  assert.equal(a.node("#achievement-count").textContent, "12");
  assert.match(a.node("#achievement-progress").innerHTML, /<strong>12<\/strong> of 20/);
});

test("older completed history earns the Twist, zero-point, and 5,000-point achievements on load", () => {
  const saved = savedProgress();
  saved.records = Array.from({ length: 40 }, (_, i) => ({
    id: `old-legend-finish-${i}`, name: "Old memory", difficulty: "legend",
    seconds: 0, twist: i === 0, guideUses: i === 0 ? 10 : 0,
    date: "2026-10-01T12:00:00Z", thumbnail: null,
  }));
  const a = app(new Map([[KEY, JSON.stringify(saved)]]));
  const unlocked = [...a.node("#achievement-content").innerHTML.matchAll(
    /<article class="achievement-card unlocked">[\s\S]*?<h2>([^<]+)<\/h2>/g,
  )].map((match) => match[1]);
  for (const name of ["Plot Twist", "Peek-a-Broke", "Swamp Tycoon", "Golden Gator"]) {
    assert.ok(unlocked.includes(name), name);
  }
  const restored = engine.validateData(saved);
  const total = engine.achievementProgress(restored.records, restored).totalPoints;
  assert.equal(a.node("#total-points").textContent, total.toLocaleString());
  assert.equal(app(a.storage).node("#total-points").textContent, total.toLocaleString());
});

test("new completion milestones are announced on crossing their thresholds and only once", async () => {
  const record = (difficulty, i, seconds = 2400) => ({
    id: `milestone-finish-${i}`, name: "Finished memory", difficulty, seconds,
    points: engine.score(difficulty, seconds).total,
    date: "2026-10-01T12:00:00Z", thumbnail: null,
  });
  const cases = [
    ["twenty-five", Array.from({ length: 24 }, (_, i) => record("breezy", i))],
    ["fifty", Array.from({ length: 49 }, (_, i) => record("breezy", i))],
    ["points-5000", [
      ...Array.from({ length: 2 }, (_, i) => record("legend", i, 0)), record("legend", 2, 4800),
      record("legend", 3, 2880), record("bold", 4),
    ]],
    ["points-5k", Array.from({ length: 32 }, (_, i) => record("legend", i, i === 0 ? 2060 : i === 1 ? 343 : 4800))],
    ["all-difficulties", [record("snappy", 0), record("bold", 1), record("legend", 2)]],
  ];
  for (const [id, records] of cases) {
    const achievement = engine.ACHIEVEMENTS.find((entry) => entry.id === id);
    const saved = { ...savedProgress(), records };
    assert.equal(achievement.test(records), false);
    const a = app(new Map([[KEY, JSON.stringify(saved)]]));
    const previousCount = Number(a.node("#achievement-count").textContent);
    a.run(`resumeSavedGame(); elapsed = 2400;
      game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
      prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
    await a.run("completeGame();");
    assert.ok(achievement.test(JSON.parse(a.storage.get(KEY)).records), id);
    assert.ok(a.node("#modal-content").innerHTML.includes(achievement.name), id);
    assert.ok(Number(a.node("#achievement-count").textContent) > previousCount);

    a.node('[name=difficulty]:checked').value = "breezy";
    a.run(`closeModal();
      showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: false }); startGame();
      game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));`);
    await a.run("completeGame();");
    assert.equal(a.node("#modal-content").innerHTML.includes(achievement.name), false, id);
  }
});

function startTwist(a, difficulty = "breezy") {
  a.node('[name=difficulty]:checked').value = difficulty;
  a.node("#random-rotation").setAttribute("aria-pressed", "true");
  a.run('selectedPhoto = { image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: true }; startGame();');
}

test("Twist milestones and an unguided Legend finish award once and survive backup restore", async () => {
  const a = app(new Map());
  const milestones = ["Full Circle", "Twist and Shout", "Look Ma, No Peeks!"];
  for (const [index, difficulty] of ["breezy", "snappy", "bold", "legend", "legend", "legend"].entries()) {
    startTwist(a, difficulty);
    if (index < 4) {
      await a.node("#reference-button").click();
      await a.node("#confirm-guide").click();
    }
    a.run(`elapsed = 2400; game.rotations.fill(0);
      game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
      prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
    await a.run("completeGame();");
    const expectedUnlocks = index === 3 ? ["Full Circle"] : index === 4 ? ["Twist and Shout", "Look Ma, No Peeks!"] : [];
    for (const name of milestones) {
      assert.equal(a.node("#modal-content").innerHTML.includes(`<h4>${name}</h4>`), expectedUnlocks.includes(name), name);
    }
    const saved = engine.validateData(JSON.parse(a.storage.get(KEY)));
    assert.equal(a.node("#total-points").textContent, engine.achievementProgress(saved.records, saved).totalPoints.toLocaleString());
    a.run("closeModal();");
  }
  const before = a.node("#total-points").textContent;
  await a.node("#export-button").click();
  const backup = await a.blobs.at(-1).text();
  const restored = app(new Map());
  restored.run("loadImage = async () => ({});");
  await restored.node("#import-input").emit("change", {
    target: { files: [{ size: backup.length, text: async () => backup }], value: "" },
  });
  await restored.node("#confirm-import").click();
  const reloaded = app(restored.storage);
  assert.equal(reloaded.node("#total-points").textContent, before);
  const unlocked = [...reloaded.node("#achievement-content").innerHTML.matchAll(
    /<article class="achievement-card unlocked">[\s\S]*?<h2>([^<]+)<\/h2>/g,
  )].map((match) => match[1]);
  for (const name of milestones) assert.ok(unlocked.includes(name), name);
});

test("Twist toggle starts random orientations, resumes them, and allows a normal next puzzle", async () => {
  const a = app();
  await a.node("#random-rotation").click();
  assert.equal(a.node("#random-rotation").getAttribute("aria-pressed"), "true");
  startTwist(a);
  const saved = JSON.parse(a.storage.get(KEY)).active;
  assert.equal(saved.twist, true);
  assert.equal(saved.rotations.length, 24);
  assert.ok(saved.rotations.some((angle) => angle !== 0));
  assert.ok(saved.rotations.every((angle) => Number.isInteger(angle) && angle >= 0 && angle <= 3));
  assert.equal(a.node("#rotation-controls").hidden, true);
  assert.equal(a.node("#rotate-left").disabled, true);
  assert.equal(a.node("#rotate-right").disabled, true);
  const resumed = app(a.storage);
  resumed.run("resumeSavedGame();");
  assert.deepEqual(JSON.parse(resumed.run("JSON.stringify(game.rotations)")), saved.rotations);
  assert.equal(resumed.node("#rotation-controls").hidden, true);
  a.run("leaveGame();");
  await a.node("#random-rotation").click();
  a.run("startGame();");
  assert.equal(a.run("game.twist"), false);
  assert.equal(a.run("game.rotations.every((angle) => angle === 0)"), true);
  a.run("selectPiece(2);");
  assert.equal(a.node("#rotation-controls").hidden, true);
});

test("left, right, and keyboard rotation save angles, update the preview, and follow selection, pause, and dragging", async () => {
  const a = app();
  startTwist(a);
  a.run("game.rotations[2] = 0; selectPiece(2); setPictureGuide(true);");
  assert.equal(a.node("#rotation-controls").hidden, false);
  assert.equal(a.node("#rotate-left").disabled, false);
  assert.equal(a.node("#rotate-right").disabled, false);
  await a.node("#rotate-left").click();
  assert.equal(a.run("game.rotations[2]"), 3);
  assert.equal(a.run("showGuide"), false);
  assert.match(a.node("#clear-selection").innerHTML, /rotate\(270 /);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.rotations[2], 3);
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[2]"), 0);
  a.run("setPictureGuide(true);");
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[2]"), 1);
  assert.equal(a.run("showGuide"), false);
  assert.match(a.node("#clear-selection").innerHTML, /rotate\(90 /);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.rotations[2], 1);
  await a.node("#puzzle-board").emit("keydown", { key: "R", shiftKey: true });
  assert.equal(a.run("game.rotations[2]"), 0);
  await a.node("#puzzle-board").emit("keydown", { key: "r", ctrlKey: true });
  assert.equal(a.run("game.rotations[2]"), 0);
  for (const id of ["#rotate-left", "#rotate-right"]) {
    await a.node(id).emit("keydown", { key: "r" });
    assert.equal(a.run("game.rotations[2]"), 1);
    await a.node(id).emit("keydown", { key: "R", shiftKey: true });
    assert.equal(a.run("game.rotations[2]"), 0);
  }
  a.run("pause();");
  assert.equal(a.node("#rotation-controls").hidden, true);
  assert.equal(a.node("#rotate-left").disabled, true);
  assert.equal(a.node("#rotate-right").disabled, true);
  await a.node("#rotate-left").click();
  assert.equal(a.run("game.rotations[2]"), 0);
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[2]"), 0);
  a.run("resume(); drag = { pointerId: 1, moving: false }; updateRotationControl();");
  assert.equal(a.node("#rotation-controls").hidden, false);
  assert.equal(a.node("#rotate-left").disabled, true);
  assert.equal(a.node("#rotate-right").disabled, true);
  await a.node("#rotate-left").click();
  assert.equal(a.run("game.rotations[2]"), 0);
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[2]"), 0);
  a.run("cancelDrag();");
  assert.equal(a.node("#rotate-left").disabled, false);
  assert.equal(a.node("#rotate-right").disabled, false);
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[2]"), 1);
  await a.node("#clear-selection").click();
  assert.equal(a.node("#rotation-controls").hidden, true);
  a.run("selectPiece(2);");
  assert.equal(a.node("#rotation-controls").hidden, false);
  a.run("selectPiece(2);");
  assert.equal(a.node("#rotation-controls").hidden, true);
  a.run("selectPiece(2);");
  await a.node("#pan-button").click();
  assert.equal(a.node("#rotation-controls").hidden, true);
});

test("rotation buttons follow the selected outline through rotation, scrolling, resizing, zoom, and dragging", async () => {
  const a = app();
  startTwist(a);
  const controls = a.node("#rotation-controls"),
    area = a.node(".table-area"),
    outline = a.node('#puzzle-board [data-piece="2"] .piece-outline');
  area.rect = { left: 40, top: 100 };
  a.node(".tray-return-preview .piece-outline").rect = { left: 1000, top: 400, width: 100, height: 90 };
  a.run("game.rotations[2] = 0; selectPiece(2);");
  assert.equal(controls.style.left, "1010px");
  assert.equal(controls.style.top, "288px");

  outline.rect = { left: 240, top: 360, width: 160, height: 100 };
  a.run("positionPiece(2, 420, 310); renderGame();");
  assert.equal(controls.style.left, "280px");
  assert.equal(controls.style.top, "248px");

  // Supply the new rendered bounds of the rotated rectangle.
  outline.rect = { left: 270, top: 330, width: 100, height: 160 };
  await a.node("#rotate-right").click();
  assert.equal(controls.style.left, "280px");
  assert.equal(controls.style.top, "218px");

  outline.rect = { left: 200, top: 270, width: 100, height: 160 };
  await a.node("#table-scroll").emit("scroll");
  assert.equal(controls.style.left, "210px");
  assert.equal(controls.style.top, "158px");

  area.rect = { left: 60, top: 120 };
  outline.rect = { left: 300, top: 410, width: 120, height: 192 };
  await a.window.emit("resize");
  assert.equal(controls.style.left, "300px");
  assert.equal(controls.style.top, "278px");

  outline.rect = { left: 180, top: 700, width: 240, height: 384 };
  await a.node('[data-zoom="2"]').click();
  assert.equal(controls.style.left, "240px");
  assert.equal(controls.style.top, "568px");

  a.run("boardPoint = (x, y) => ({ x, y });");
  await a.node("#puzzle-board").emit("pointerdown", {
    target: { closest: () => ({ dataset: { piece: "2" } }) },
    isPrimary: true, button: 0, pointerId: 7, clientX: 500, clientY: 500,
  });
  outline.rect = { left: 400, top: 500, width: 240, height: 384 };
  await a.window.emit("pointermove", { pointerId: 7, clientX: 520, clientY: 520 });
  assert.equal(controls.style.left, "460px");
  assert.equal(controls.style.top, "368px");
  outline.rect = { left: 450, top: 540, width: 240, height: 384 };
  await a.window.emit("pointermove", { pointerId: 7, clientX: 530, clientY: 530 });
  assert.equal(controls.style.left, "510px");
  assert.equal(controls.style.top, "408px");
});

test("a backwards piece stays loose on placement, then rotates home and persists its lock", async () => {
  const a = app();
  startTwist(a);
  a.run("game.rotations[0] = 2; selectPiece(0); keyboardCell = 0;");
  await a.node("#puzzle-board").emit("keydown", { key: "Enter" });
  assert.equal(a.run("game.pieces[0].locked"), false);
  assert.equal(a.node("#rotation-controls").hidden, true);
  a.run("selectPiece(0);");
  assert.equal(a.node("#rotation-controls").hidden, false);
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.pieces[0].locked"), false);
  a.node("#rotate-right").focus();
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.pieces[0].locked"), true);
  assert.equal(a.run("selected"), null);
  assert.equal(a.node("#rotation-controls").hidden, true);
  assert.equal(a.node("#rotate-left").disabled, true);
  assert.equal(a.node("#rotate-right").disabled, true);
  assert.equal(a.document.activeElement, a.node("#puzzle-board"));
  const saved = engine.validateData(JSON.parse(a.storage.get(KEY))).active;
  assert.equal(saved.pieces[0].locked, true);
  assert.equal(saved.rotations[0], 0);
});

test("Twist guide costs, completed rewards, gallery and backup restores agree", async () => {
  const a = app();
  startTwist(a, "snappy");
  await a.node("#reference-button").click();
  assert.match(a.node("#modal-content").innerHTML, /6 Snap Points/);
  assert.match(a.node("#modal-content").innerHTML, /−6<\/span>/);
  await a.node("#confirm-guide").click();
  a.run('elapsed = 60; runStart = performance.now(); prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });');
  await a.run("completeGame();");
  const saved = JSON.parse(a.storage.get(KEY)), record = saved.records.at(-1);
  assert.equal(record.twist, true);
  assert.equal(record.guideUses, 1);
  assert.equal(record.points, engine.score("snappy", 60, 1).total * 2);
  assert.match(a.node("#modal-content").innerHTML, /<h4>Plot Twist<\/h4>/);
  assert.match(a.node("#modal-content").innerHTML, /--achievement-icon: url\('\.\/assets\/rotate_right_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg'\)/);
  assert.match(a.node("#gallery-content").innerHTML, /Twist 2×/);
  await a.node("#win-stats-button").click();
  assert.match(a.node("#modal-content").innerHTML, /Puzzle points \(Twist 2×\)/);
  assert.match(a.node("#modal-content").innerHTML, /−6/);
  const restored = engine.validateData(saved);
  assert.equal(restored.records.at(-1).points, record.points);
  assert.equal(restored.records.at(-1).twist, true);
  const expected = engine.achievementProgress(restored.records, restored).totalPoints;
  assert.equal(Number(a.node("#total-points").textContent), expected);
});
