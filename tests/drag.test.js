import { test } from "node:test";
import assert from "node:assert/strict";
import { app, KEY, savedProgress } from "./helpers/app.js";
import { BOARD_MARGIN, geometry, pieceBounds } from "../engine.js";

// Screen geometry is supplied explicitly; no browser or layout engine is used.
function dragApp({ group = false, twist = false, scale = 1, tray = false } = {}) {
  const a = app();
  a.run(`
    resumeSavedGame();
    game.twist = ${twist};
    game.rotations = Array(24).fill(${twist ? 1 : 0});
    game.pieces[0] = ${tray ? "null" : "{ id: 0, group: 0, x: 300, y: 250, locked: false }"};
    ${group ? `game.pieces[1] = { id: 1, group: 0, x: ${twist ? 300 : 450}, y: ${twist ? 400 : 250}, locked: false };` : ""}
    game.pieces[23] = { id: 23, group: 23, x: 750, y: 450, locked: true };
    renderGame();
    save();
  `);
  const board = a.node("#puzzle-board");
  const matrix = { a: scale, b: 0, c: 0, d: scale, e: 40, f: 60 };
  matrix.inverse = () => ({ a: 1 / scale, d: 1 / scale, e: -40 / scale, f: -60 / scale });
  board.getScreenCTM = () => matrix;
  board.createSVGPoint = () => ({
    x: 0, y: 0,
    matrixTransform(m) { return { x: this.x * m.a + m.e, y: this.y * m.d + m.f }; },
  });
  let capture = null;
  board.setPointerCapture = (id) => { capture = id; };
  board.hasPointerCapture = (id) => capture === id;
  board.releasePointerCapture = (id) => { assert.equal(capture, id); capture = null; };
  const tableRect = { left: 40, top: 60, right: 980, bottom: 700, width: 940, height: 640 };
  const trayRect = { left: 1020, top: 100, right: 1240, bottom: 680, width: 220, height: 580 };
  a.node("#table-scroll").getBoundingClientRect = () => tableRect;
  a.node(".tray-body").getBoundingClientRect = () => trayRect;
  a.node("#drag-preview").hidden = true;
  const source = a.node(tray ? "#piece-tray" : "#puzzle-board");
  const start = tray ? { x: 1120, y: 200 } : { x: 40 + scale * 330, y: 60 + scale * 295 };
  const event = (x, y, pointerId = 7) => ({ pointerId, clientX: x, clientY: y });
  return Object.assign(a, {
    board, start, tableRect, trayRect,
    pieces: () => JSON.parse(a.run("JSON.stringify(game.pieces)")),
    down: (extra = {}) => source.emit("pointerdown", {
      target: { closest: () => ({ dataset: { piece: "0" } }) },
      isPrimary: true, button: 0, ...event(start.x, start.y), ...extra,
    }),
    move: (x, y, pointerId) => a.window.emit("pointermove", event(x, y, pointerId)),
    up: (x, y, pointerId) => a.window.emit("pointerup", event(x, y, pointerId)),
  });
}

function previewMatrix(a) {
  return a.node("#drag-preview-pieces").getAttribute("transform")
    .slice(7, -1).split(" ").map(Number);
}
function assertDragCleared(a) {
  assert.equal(a.run("drag"), null);
  assert.equal(a.node("#drag-preview").hidden, true);
  assert.equal(a.node("#drag-preview-pieces").innerHTML, "");
  assert.equal(a.board.hasPointerCapture(7), false);
  assert.equal(a.node(".tray-panel").classList.contains("is-drag-over"), false);
  if (a.run("!game || game.pieces.some((p) => p && !p.locked && p.group === 0)")) {
    assert.equal(a.node('#puzzle-board [data-group="0"]').classList.contains("is-dragging"), false);
  } else assert.doesNotMatch(a.board.innerHTML, /data-group="0"/);
  for (const id of [0, 1]) {
    if (a.run(`!game || Boolean(game.pieces[${id}])`)) {
      assert.equal(a.node(`#puzzle-board [data-piece="${id}"]`).classList.contains("is-dragging"), false);
    } else {
      assert.ok(!a.board.innerHTML.includes(`data-piece="${id}"`));
    }
  }
}

test("a piece or rotated group follows the grab point beyond the table at every zoom", async () => {
  for (const scale of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
    for (const group of [false, true]) {
      const a = dragApp({ group, twist: true, scale }), before = a.pieces();
      await a.document.emit("keydown", { key: "Tab" });
      a.run("selectPiece(0);");
      assert.equal(a.node("#keyboard-cursor").getAttribute("visibility"), "visible");
      await a.document.emit("pointerdown", { pointerType: "mouse" });
      await a.down();
      await a.move(995, 340); // Gap between the table and tray.
      assert.equal(a.node("#keyboard-cursor").getAttribute("visibility"), "hidden");
      await a.document.emit("keydown", { key: "ArrowRight" });
      await a.board.emit("keydown", { key: "ArrowRight" });
      assert.equal(a.node("#keyboard-cursor").getAttribute("visibility"), "hidden");
      const [sx, , , sy, x, y] = previewMatrix(a);
      assert.equal(sx, scale);
      assert.equal(sy, scale);
      assert.ok(Math.abs(x + scale * 30 - 995) < 1e-7);
      assert.ok(Math.abs(y + scale * 45 - 340) < 1e-7);
      assert.equal(a.node("#drag-preview").hidden, false);
      assert.equal(a.node('#puzzle-board [data-piece="0"]').classList.contains("is-dragging"), true);
      assert.equal(a.node('#puzzle-board [data-piece="1"]').classList.contains("is-dragging"), group);
      assert.equal(a.node('#puzzle-board [data-group="0"]').classList.contains("is-dragging"), true);
      const markup = a.node("#drag-preview-pieces").innerHTML;
      assert.equal((markup.match(/class="loose-piece-group is-held"/g) || []).length, 1);
      assert.equal((markup.match(/<image /g) || []).length, group ? 2 : 1);
      assert.match(markup, /rotate\(90 /);
      if (group) assert.match(markup, /translate\(0,150\)/);
      assert.doesNotMatch(a.node("#clear-selection").innerHTML, /<svg/);
      assert.equal(a.node("#rotation-controls").hidden, true);
      assert.deepEqual(a.pieces(), before);
      a.run("save();"); // Saving during a drag must never persist its preview.
      assert.deepEqual(JSON.parse(a.storage.get(KEY)).active.pieces, before);
      await a.move(1110, 340);
      assert.equal(a.node(".tray-panel").classList.contains("is-drag-over"), true);
      assert.match(a.node("#clear-selection").innerHTML, /release to put back/);
      await a.move(995, 340);
      assert.equal(a.node(".tray-panel").classList.contains("is-drag-over"), false);
      await a.up(995, 340);
      assert.deepEqual(a.pieces(), before);
      assertDragCleared(a);
    }
  }
});

test("dropping into either tray layout returns the whole group and persists its angles", async () => {
  for (const group of [false, true]) {
    for (const stacked of [false, true]) {
      const a = dragApp({ group, twist: true });
      if (stacked) Object.assign(a.trayRect, { left: 40, right: 980, top: 750, bottom: 950 });
      await a.down({ pointerType: stacked ? "touch" : "mouse" });
      await a.move(500, 400);
      // The final pointerup location, even without another move event, decides.
      await a.up(stacked ? 500 : 1110, stacked ? 800 : 340);
      const saved = JSON.parse(a.storage.get(KEY)).active;
      assert.equal(saved.pieces[0], null);
      assert.equal(saved.pieces[1], null);
      assert.equal(saved.pieces[23].locked, true);
      assert.equal(saved.rotations[0], 1);
      assert.equal(saved.rotations[1], 1);
      assert.match(a.node("#announcement").textContent, group ? /2 pieces returned/ : /Piece returned/);
      assert.match(a.node("#piece-tray").innerHTML, /data-piece="0"/);
      assertDragCleared(a);
    }
  }
});

test("a tray piece appears only in the drag preview and returns on invalid or tray drops", async () => {
  for (const x of [995, 1110]) {
    const a = dragApp({ tray: true, twist: true }), before = a.pieces();
    await a.down();
    await a.move(995, 340);
    assert.doesNotMatch(a.node("#piece-tray").innerHTML, /data-piece="0"/);
    assert.doesNotMatch(a.node("#clear-selection").innerHTML, /<svg/);
    assert.equal(a.pieces()[0], null);
    assert.match(a.node("#drag-preview-pieces").innerHTML, /drag-clip-0/);
    await a.up(x, 340);
    assert.deepEqual(a.pieces(), before);
    assert.match(a.node("#piece-tray").innerHTML, /data-piece="0"/);
    assertDragCleared(a);
  }
});

test("table placement uses the release coordinates, preserves group offsets and constrains all members", async () => {
  for (const twist of [false, true]) {
    const a = dragApp({ group: true, twist });
    await a.down();
    await a.move(1110, 340);
    await a.up(600, 380);
    let pieces = a.pieces();
    assert.equal(pieces[0].x, 530);
    assert.equal(pieces[0].y, 275);
    assert.equal(pieces[1].x - pieces[0].x, twist ? 0 : 150);
    assert.equal(pieces[1].y - pieces[0].y, twist ? 150 : 0);
    assertDragCleared(a);
    await a.down({ clientX: pieces[0].x + 70, clientY: pieces[0].y + 105 });
    await a.move(1110, 340);
    await a.up(970, 690);
    pieces = a.pieces();
    const game = JSON.parse(a.run("JSON.stringify(game)")), { w, h } = geometry(game);
    for (const p of pieces.filter((p) => p?.group === 0)) {
      const bounds = pieceBounds(game, p.id);
      assert.ok(p.x + bounds.x >= -BOARD_MARGIN);
      assert.ok(p.y + bounds.y >= -BOARD_MARGIN);
      assert.ok(p.x + bounds.x + bounds.width <= w + BOARD_MARGIN);
      assert.ok(p.y + bounds.y + bounds.height <= h + BOARD_MARGIN);
    }
    assert.deepEqual(JSON.parse(a.storage.get(KEY)).active.pieces, pieces);
    assertDragCleared(a);
  }
});

test("dragging from the tray onto its home still snaps and saves the piece", async () => {
  const a = dragApp({ tray: true });
  await a.down();
  await a.move(995, 340);
  await a.up(115, 135); // Board origin (40, 60), plus half a 150 x 150 piece.
  assert.deepEqual(a.pieces()[0], { id: 0, group: 0, x: 0, y: 0, locked: true });
  assert.equal(JSON.parse(a.storage.get(KEY)).active.pieces[0].locked, true);
  assertDragCleared(a);
});

test("pointer cancellation, lost capture, Escape, pause, blur and pagehide clear a drag without moving pieces", async () => {
  const cancellations = [
    (a) => a.window.emit("pointercancel", { pointerId: 7 }),
    (a) => a.board.emit("lostpointercapture", { pointerId: 7 }),
    (a) => a.window.emit("keydown", { key: "Escape" }),
    (a) => a.node("#pause-button").click(),
    (a) => a.window.emit("blur"),
    (a) => a.window.emit("pagehide"),
  ];
  for (const cancel of cancellations) {
    for (const tray of [false, true]) {
      const a = dragApp({ group: !tray, tray }), before = a.pieces();
      await a.down();
      await a.move(1110, 340);
      await a.board.emit("keydown", { key: "Enter" });
      assert.deepEqual(a.pieces(), before);
      await cancel(a);
      assert.deepEqual(a.pieces(), before);
      assert.deepEqual(JSON.parse(a.storage.get(KEY)).active.pieces, before);
      assertDragCleared(a);
    }
  }
});

test("external progress replacement removes the floating preview and capture", async () => {
  const a = dragApp({ group: true });
  await a.down();
  await a.move(1110, 340);
  const incoming = savedProgress();
  incoming.revision = "another-tab";
  await a.window.emit("storage", { key: KEY, newValue: JSON.stringify(incoming) });
  assert.equal(a.run("game"), null);
  assertDragCleared(a);
});

test("small movements remain clicks and unrelated pointers cannot move or end a drag", async () => {
  const a = dragApp(), before = a.pieces();
  await a.down();
  await a.move(a.start.x + 3, a.start.y + 3);
  assert.equal(a.node("#drag-preview").hidden, true);
  await a.up(a.start.x + 3, a.start.y + 3);
  assert.equal(a.run("ignoreClick"), false);
  assert.deepEqual(a.pieces(), before);
  await a.down();
  await a.move(1110, 340, 8);
  assert.equal(a.node("#drag-preview").hidden, true);
  await a.move(1110, 340);
  const matrix = previewMatrix(a);
  await a.move(100, 100, 8);
  await a.up(100, 100, 8);
  await a.window.emit("pointercancel", { pointerId: 8 });
  assert.deepEqual(previewMatrix(a), matrix);
  assert.equal(a.run("drag.pointerId"), 7);
  await a.up(995, 340);
  assert.deepEqual(a.pieces(), before);
  assertDragCleared(a);
});
