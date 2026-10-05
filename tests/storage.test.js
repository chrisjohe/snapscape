import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../engine.js";
import { helpSteps } from "../tour.js";
import { app, KEY, savedProgress } from "./helpers/app.js";

// Detailed scoring and achievement rules live in engine.test.js. These tests
// cover app wiring, saved progress, and recovery from failed or conflicting writes.
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
  await a.node("#sample-surprise").click();
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

test("accessible progress counts only locked pieces and survives resume", () => {
  const a = app();
  a.run("game = data.active; updateGameProgress();");
  const progress = a.node("#piece-progress");
  assert.equal(progress.getAttribute("aria-valuemax"), "24");
  assert.equal(progress.getAttribute("aria-valuenow"), "0");
  // Half locked, one loose piece on the table, and eleven still in the tray.
  a.run(`game.pieces = Array.from({ length: 24 }, (_, i) =>
    i < 12 ? { id: i, group: i, ...target(game, i), locked: true }
      : i === 12 ? { id: i, group: i, x: 50, y: 50, locked: false } : null);
    updateGameProgress();`);
  assert.equal(a.node("#placed-count").textContent, "12 / 24");
  assert.equal(progress.getAttribute("aria-valuetext"), "12 of 24 pieces placed");
  // A fresh app reads the stored state and computes the same progress on resume.
  a.run("save();");
  const resumed = app(a.storage);
  resumed.run("game = data.active; updateGameProgress();");
  assert.equal(resumed.node("#piece-progress").getAttribute("aria-valuenow"), "12");
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

test("completion saves and exports guide-adjusted rewards for normal, zero-point, and Twist finishes", async () => {
  for (const [twist, uses] of [[false, 2], [false, 10], [true, 1]]) {
    const a = app();
    a.run(`game = data.active; game.twist = ${twist}; game.guideUses = ${uses}; paused = false; elapsed = 60; runStart = 1000;
      game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
      prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
    await a.run("completeGame();");
    const saved = JSON.parse(a.storage.get(KEY));
    const record = saved.records.at(-1), award = engine.score("breezy", 60, uses, twist);
    assert.equal(record.twist, twist);
    assert.equal(record.guideUses, uses);
    assert.equal(record.points, award.total);
    assert.equal(saved.active, null);
    assert.equal(a.node("#total-points").textContent, engine.achievementProgress(saved.records, saved).totalPoints.toLocaleString());
    await a.node("#export-button").click();
    const backup = JSON.parse(await a.blobs.at(-1).text());
    assert.equal(backup.records.at(-1).twist, twist);
    assert.equal(backup.records.at(-1).guideUses, uses);
    assert.equal(backup.records.at(-1).points, award.total);
  }
});

test("legacy fractional rewards become whole in loaded totals, exports, and restored backups", async () => {
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
  assert.match(a.node("#modal-content").innerHTML, /First Chomp/);
  assert.equal(a.node("#total-points").textContent, "40");
  assert.equal(app(a.storage).node("#total-points").textContent, "40");

  a.node('[name=difficulty]:checked').value = "breezy";
  a.run(`closeModal();
    showPhoto({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: false }); startGame();
    elapsed = 60;
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));`);
  await a.run("completeGame();");
  assert.doesNotMatch(a.node("#modal-content").innerHTML, /achievement bonus|New achievements/);
  assert.equal(a.node("#total-points").textContent, (54).toLocaleString());
  assert.equal(app(a.storage).node("#total-points").textContent, (54).toLocaleString());
  assert.match(a.node("#announcement").textContent, /Puzzle complete!/);
});

test("a random picture keeps its identity through renaming, resume, completion, and backup restore", async () => {
  const a = app(new Map());
  a.run(`let loadedSource;
    prepareImage = async (src) => {
      loadedSource = src;
      return { image: "data:image/jpeg;base64,AAAA", ratio: 1.5 };
    };`);
  await a.node("#sample-button").click();
  await a.node("#sample-surprise").click();
  const sampleId = a.run("selectedPhoto.sampleId");
  assert.ok(engine.SAMPLE_SNAPSCAPES.includes(sampleId));
  assert.equal(a.run("loadedSource"), `./assets/snapscape-${sampleId}.jpg`);
  await a.node("#edit-setup-name-button").click();
  a.node("#rename-input").value = "A completely different name";
  await a.node("#rename-form").emit("submit");
  a.node('[name=difficulty]:checked').value = "breezy";
  await a.node("#start-button").click();
  assert.equal(JSON.parse(a.storage.get(KEY)).active.sampleId, sampleId);

  const resumed = app(a.storage);
  resumed.run(`resumeSavedGame();
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA" });`);
  assert.equal(resumed.run("game.sampleId"), sampleId);
  await resumed.run("completeGame();");
  const completed = JSON.parse(resumed.storage.get(KEY));
  assert.equal(completed.records[0].sampleId, sampleId);
  assert.equal(completed.records[0].name, "A completely different name");

  await resumed.node("#export-button").click();
  const backup = await resumed.blobs.at(-1).text();
  const restored = app(new Map());
  await restored.node("#import-input").emit("change", {
    target: { files: [{ size: backup.length, text: async () => backup }], value: "" },
  });
  await restored.node("#confirm-import").click();
  const imported = JSON.parse(restored.storage.get(KEY));
  assert.equal(imported.records[0].sampleId, sampleId);
  await restored.node("#sample-button").click();
  assert.match(restored.node("#modal-content").innerHTML, /1 of 15 completed/);
  assert.ok(restored.run(`sampleChoiceMarkup("${sampleId}", completedSampleIds(data.records).has("${sampleId}"))`).includes('class="sample-completed">'));
});

test("replacing a sample with an upload clears its identity even when the filename matches", async () => {
  const a = app(new Map());
  a.run('prepareImage = async () => ({ image: "data:image/jpeg;base64,AAAA", ratio: 1.5 });');
  await a.node("#sample-button").click();
  await a.node("#sample-surprise").click();
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
  assert.match(a.node("#modal-content").innerHTML, /Peek-a-Broke/);
  assert.equal(a.node("#total-points").textContent, "20");
  // Completed records retain the evidence even when no lifetime flag was set during play.
  const reloaded = app(a.storage);
  assert.equal(reloaded.run("data.guideExhausted"), true);
  assert.equal(reloaded.node("#total-points").textContent, "20");
});

function startTwist(a) {
  a.node('[name=difficulty]:checked').value = "breezy";
  a.node("#random-rotation").setAttribute("aria-pressed", "true");
  a.run('selectedPhoto = { image: "data:image/jpeg;base64,AAAA", ratio: 1.5, ownPhoto: true }; startGame();');
}

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

test("button and keyboard rotation persist angles and respect pause and dragging", async () => {
  const a = app();
  startTwist(a);
  a.run("game.rotations[2] = 0; selectPiece(2); setPictureGuide(true);");
  assert.equal(a.node("#rotation-controls").hidden, false);
  assert.equal(a.node("#rotate-left").disabled, false);
  assert.equal(a.node("#rotate-right").disabled, false);
  await a.node("#rotate-left").click();
  assert.equal(a.run("game.rotations[2]"), 3);
  assert.equal(a.run("showGuide"), false);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.rotations[2], 3);
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[2]"), 0);
  a.run("setPictureGuide(true);");
  await a.node("#rotate-right").click();
  assert.equal(a.run("game.rotations[2]"), 1);
  assert.equal(a.run("showGuide"), false);
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

test("legacy saves, missing metadata and failed revision-key writes remain usable", () => {
  for (const failure of ["none", "get", "set"]) {
    const a = app();
    const get = a.localStorage.getItem, set = a.localStorage.setItem;
    a.localStorage.getItem = (key) => {
      if (failure === "get" && key === `${KEY}.revision`) throw new Error("Denied metadata");
      return get(key);
    };
    a.localStorage.setItem = (key, value) => {
      if (failure === "set" && key === `${KEY}.revision`) throw new Error("Denied metadata");
      return set(key, value);
    };
    assert.equal(a.run('data.active.name = "Still saved"; save()'), true, failure);
    assert.equal(JSON.parse(a.storage.get(KEY)).active.name, "Still saved", failure);
    assert.equal(a.run('data.active.name = "Saved again"; save()'), true, failure);
    assert.equal(JSON.parse(a.storage.get(KEY)).active.name, "Saved again", failure);
  }
});

test("stale revision metadata cannot hide a conflict written by a legacy tab", () => {
  const a = app();
  a.run("resumeSavedGame();");
  const oldMetadata = a.storage.get(`${KEY}.revision`);
  const external = JSON.parse(a.storage.get(KEY));
  external.revision = "changed-revision";
  external.active.name = "Other tab's puzzle";
  const raw = JSON.stringify(external);
  a.storage.set(KEY, raw);
  assert.equal(a.storage.get(`${KEY}.revision`), oldMetadata);
  assert.equal(a.run("save()"), false);
  assert.equal(a.storage.get(KEY), raw);
  assert.equal(a.run("game"), null);
  assert.equal(a.run("data.active.name"), "Other tab's puzzle");
});

test("a failed revision-key write safely falls back to the saved payload", () => {
  const a = app(), set = a.localStorage.setItem;
  a.localStorage.setItem = (key, value) => {
    if (key === `${KEY}.revision` && value) throw new Error("Metadata quota");
    return set(key, value);
  };
  assert.equal(a.run("save()"), true);
  assert.equal(a.storage.has(`${KEY}.revision`), false);
  const another = app(a.storage);
  assert.equal(another.run('data.active.name = "Safe fallback"; save()'), true);
  assert.equal(a.run("save()"), false);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.name, "Safe fallback");
});

test("a locked metadata key never prevents saving progress or detecting newer payloads", () => {
  const a = app();
  a.run("save();");
  const metadata = a.storage.get(`${KEY}.revision`), set = a.localStorage.setItem;
  a.localStorage.setItem = (key, value) => {
    if (key === `${KEY}.revision`) throw new Error("Metadata denied");
    return set(key, value);
  };
  a.localStorage.removeItem = () => { throw new Error("Metadata denied"); };
  assert.equal(a.run('data.active.name = "Saved change"; save()'), true);
  assert.equal(JSON.parse(a.storage.get(KEY)).active.name, "Saved change");
  assert.equal(a.storage.get(`${KEY}.revision`), metadata);
  assert.equal(a.run('data.active.name = "Another saved change"; save()'), true);
  const external = app(a.storage);
  assert.equal(external.run('data.active.name = "Changed elsewhere"; save()'), true);
  assert.equal(a.run("save()"), false);
  assert.equal(a.run("data.active.name"), "Changed elsewhere");
});

test("failed quota retries preserve in-memory thumbnails, revision and exported backup", async () => {
  for (const prune of [false, true]) {
    const saved = savedProgress();
    saved.records[0].thumbnail = "data:image/jpeg;base64,AAAA";
    const a = app(new Map([[KEY, JSON.stringify(saved)]]));
    if (prune) a.run('data.records[0].thumbnail = "data:image/jpeg;base64," + "A".repeat(2000000);');
    const thumbnail = a.run("data.records[0].thumbnail"), before = a.storage.get(KEY);
    const revision = a.run("data.revision");
    let writes = 0;
    const set = a.localStorage.setItem;
    a.localStorage.setItem = (key, value) => {
      if (key === KEY) { ++writes; throw new Error("Quota exceeded"); }
      return set(key, value);
    };
    assert.equal(a.run("save()"), false);
    assert.equal(writes, prune ? 1 : 2);
    assert.equal(a.run("data.records[0].thumbnail"), thumbnail);
    assert.equal(a.run("data.revision"), revision);
    assert.equal(a.storage.get(KEY), before);
    await a.node("#export-button").click();
    assert.equal(JSON.parse(await a.blobs.at(-1).text()).records[0].thumbnail, thumbnail);
  }
});

test("a smaller quota retry commits cleared thumbnails only after the write succeeds", () => {
  const saved = savedProgress();
  saved.records[0].thumbnail = "data:image/jpeg;base64,AAAA";
  const a = app(new Map([[KEY, JSON.stringify(saved)]])), set = a.localStorage.setItem;
  a.localStorage.setItem = (key, value) => {
    if (key === KEY && JSON.parse(value).records[0].thumbnail) throw new Error("Quota exceeded");
    return set(key, value);
  };
  assert.equal(a.run("save()"), true);
  assert.equal(a.run("data.records[0].thumbnail"), null);
  assert.equal(JSON.parse(a.storage.get(KEY)).records[0].thumbnail, null);
  assert.match(a.node("#toast").textContent, /scores are safe/);
});

test("idle autosaves adopt resume state without repeated notifications", async () => {
  const a = app();
  const toast = a.node("#toast").textContent;
  for (let i = 1; i <= 3; ++i) {
    const incoming = savedProgress();
    incoming.revision = `autosave-${i}`;
    incoming.active.seconds += i * 10;
    const raw = JSON.stringify(incoming);
    a.storage.set(KEY, raw);
    await a.window.emit("storage", { key: KEY, newValue: raw });
    assert.equal(a.run("data.active.seconds"), incoming.active.seconds);
  }
  assert.equal(a.node("#toast").textContent, toast);
  a.run("resumeSavedGame();");
  assert.equal(a.run("seconds()"), 60);
});

test("a tour opened from setup survives autosaves and adopts visible collection changes silently", async () => {
  const a = app();
  await a.node("#help-button").click();
  const session = a.run("helpSession"), practice = a.run("game");
  const incoming = savedProgress();
  incoming.revision = "external-autosave";
  incoming.active.seconds = 90;
  incoming.records[0].name = "Updated trophy";
  const raw = JSON.stringify(incoming);
  a.storage.set(KEY, raw);
  await a.window.emit("storage", { key: KEY, newValue: raw });
  assert.equal(a.run("helpSession"), session);
  assert.equal(a.run("game"), practice);
  assert.match(a.node("#gallery-content").innerHTML, /Updated trophy/);
  assert.doesNotMatch(a.node("#toast").textContent, /changed in another tab/);
  a.run("helpTour.close(); resumeSavedGame();");
  assert.equal(a.run("seconds()"), 90);
});

test("corrupt JSON and invalid records export the exact original save for recovery", async () => {
  const invalid = savedProgress();
  invalid.records[0].difficulty = "removed-difficulty";
  for (const raw of ["{broken JSON", JSON.stringify(invalid)]) {
    const a = app(new Map([[KEY, raw]]));
    assert.equal(a.run("storageBlocked"), true);
    assert.equal(a.run("save()"), false);
    assert.equal(a.storage.get(KEY), raw);
    await a.node("#export-button").click();
    assert.equal(await a.blobs.at(-1).text(), raw);
    assert.match(a.node("#toast").textContent, /original saved data.*recovery/);
    assert.match(a.node("#storage-warning").textContent, /export the original data/);
    a.run("loadImage = async () => ({});");
    await a.node("#import-input").emit("change", {
      target: { files: [{ size: 100, text: async () => JSON.stringify(savedProgress()) }], value: "" },
    });
    await a.node("#confirm-import").click();
    assert.equal(a.run("storageBlocked"), false);
    await a.node("#export-button").click();
    assert.equal(JSON.parse(await a.blobs.at(-1).text()).records[0].id, "finished-puzzle");
  }
});

test("invalid external progress remains recoverable through raw export", async () => {
  const a = app(), raw = "invalid external JSON";
  a.storage.set(KEY, raw);
  await a.window.emit("storage", { key: KEY, newValue: raw });
  assert.equal(a.run("storageBlocked"), true);
  await a.node("#export-button").click();
  assert.equal(await a.blobs.at(-1).text(), raw);
});

test("invalid JSON, invalid schema and oversized imports preserve current progress", async () => {
  for (const file of [
    { size: 10, text: async () => "{bad JSON" },
    { size: 20, text: async () => '{"version":999}' },
    { size: 6000001, text: () => { throw new Error("Oversized file must not be read"); } },
  ]) {
    const a = app(), before = a.storage.get(KEY), dataBefore = a.run("JSON.stringify(data)");
    await a.node("#import-input").emit("change", { target: { files: [file], value: "" } });
    assert.equal(a.storage.get(KEY), before);
    assert.equal(a.run("JSON.stringify(data)"), dataBefore);
    assert.equal(a.node("#modal").open, false);
    assert.ok(a.node("#toast").textContent);
  }
});

test("failed backup restoration keeps current memories and reports the error inside the open dialog", async () => {
  const a = app(), before = a.storage.get(KEY), dataBefore = a.run("JSON.stringify(data)");
  const backup = { ...savedProgress(), active: null };
  backup.records[0].name = "Replacement memory";
  await a.node("#import-input").emit("change", {
    target: { files: [{ size: 100, text: async () => JSON.stringify(backup) }], value: "" },
  });
  const set = a.localStorage.setItem;
  a.localStorage.setItem = (key, value) => {
    if (key === KEY) throw new Error("Quota exceeded");
    return set(key, value);
  };
  await a.node("#confirm-import").click();
  assert.equal(a.storage.get(KEY), before);
  assert.equal(a.run("JSON.stringify(data)"), dataBefore);
  assert.equal(a.node("#modal").open, true);
  assert.equal(a.node("#import-error").hidden, false);
  assert.match(a.node("#import-error").textContent, /current memories have been kept/);
  assert.match(a.node("#modal-content").innerHTML, /id="import-error" role="alert"/);
});

test("erase also removes the revision key and storage.clear events reset the local state", async () => {
  const a = app();
  a.run("save();");
  await a.node("#erase-button").click();
  await a.node("#confirm-erase").click();
  assert.equal(a.storage.has(`${KEY}.revision`), false);
  const b = app();
  b.storage.clear();
  await b.window.emit("storage", { key: null, newValue: null });
  assert.equal(b.run("data.records.length"), 0);
  assert.equal(b.run("data.active"), null);
});
