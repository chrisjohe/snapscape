import { test } from "node:test";
import assert from "node:assert/strict";
import { app, KEY } from "./helpers/app.js";
import { geometry, piecePath, puzzleCornerRadius } from "../engine.js";

test("corner contours stay identical in the tray, on the table, while held and when locked", () => {
  const a = app();
  a.run("resumeSavedGame(); game.twist = true; game.rotations = Array(24).fill(0);");
  for (const ratio of [0.15, 1, 1.5, 7]) {
    a.run(`game.ratio = ${ratio}; renderedPieces.delete(game);`);
    for (const id of [0, 5, 18, 23]) for (let turn = 0; turn < 4; turn++) {
      a.run(`game.rotations[${id}] = ${turn};`);
      const g = JSON.parse(a.run("JSON.stringify(game)")), expected = piecePath(g, id);
      for (const prefix of ["tray", "held", "drag", "board"]) {
        const markup = a.run(`pieceMarkup(${id}, "${prefix}")`);
        assert.ok(markup.includes(`<path id="${prefix}-shape-${id}" d="${expected}"/>`));
        assert.ok(markup.includes(`rotate(${turn * 90} `));
      }
      a.run(`game.pieces[${id}] = { id: ${id}, group: ${id}, ...target(game, ${id}), locked: true };`);
      assert.ok(a.run(`pieceMarkup(${id}, "board")`).includes(`<path id="board-shape-${id}" d="${expected}"/>`));
    }
    a.run("renderBoard();");
    const radius = puzzleCornerRadius(JSON.parse(a.run("JSON.stringify(game)"))), board = a.node("#puzzle-board").innerHTML;
    assert.match(board, new RegExp(`<clipPath id="board-photo-clip"><rect [^>]*rx="${radius}"`));
    assert.match(board, /<image id="guide-image"[^>]*clip-path="url\(#board-photo-clip\)"/);
    assert.equal((board.match(/clip-path="url\(#board-photo-clip\)"/g) || []).length, 1);
  }
});

test("the preview photo rounds its frame to match its loose corner", () => {
  const a = app(), cornerGame = { difficulty: "breezy", ratio: 1.5, seed: 0 };
  for (const ratio of [0.15, 1, 1.5, 7]) {
    a.run(`renderPhotoPreview({ ratio: ${ratio}, image: "test.jpg" });`);
    const markup = a.node("#preview-image").innerHTML,
      radius = Number(markup.match(/<rect[^>]*rx="([^"]+)"/)[1]),
      scale = Number(markup.match(/id="preview-corner"[^>]*scale\(([^)]+)\)/)[1]);
    assert.ok(Math.abs(radius - puzzleCornerRadius(cornerGame) * scale) < 1e-9);
    assert.ok(markup.includes(`d="${piecePath(cornerGame, geometry(cornerGame).cols * 3)}"`));
  }
});

test("loose group surfaces merge even without movement, lift together and flatten when locked", () => {
  const a = app();
  a.run(`resumeSavedGame();
    game.pieces[0] = { id: 0, group: 0, x: 300, y: 300, locked: false };
    game.pieces[1] = { id: 1, group: 1, x: 450, y: 300, locked: false };
    game.pieces[23] = { id: 23, group: 23, ...target(game, 23), locked: true };
    renderGame();`);
  const board = a.node("#puzzle-board");
  assert.equal((board.innerHTML.match(/class="loose-piece-group"/g) || []).length, 2);
  a.run("placeGroup(game, 0); renderGame();");
  assert.equal(a.run("game.pieces[0].group === game.pieces[1].group"), true);
  const group = a.node(`#puzzle-board [data-group="${a.run("game.pieces[0].group")}"]`);
  assert.equal((board.innerHTML.match(/class="loose-piece-group"/g) || []).length, 1);
  const surface = board.innerHTML.slice(board.innerHTML.indexOf('<g class="loose-piece-group"'));
  assert.match(surface, /data-piece="0"/);
  assert.match(surface, /data-piece="1"/);
  assert.doesNotMatch(surface, /data-piece="23"/);
  a.run("selectPiece(1);");
  assert.equal(group.classList.contains("is-held"), true);
  a.run("selected = null; renderGame();");
  assert.equal(group.classList.contains("is-held"), false);
  a.run(`game.pieces[0].x = 0; game.pieces[0].y = 0;
    game.pieces[1].x = 150; game.pieces[1].y = 0;
    placeGroup(game, 0); renderGame();`);
  assert.doesNotMatch(board.innerHTML, /class="loose-piece-group"/);
  assert.equal((board.innerHTML.match(/class="board-piece locked/g) || []).length, 3);
});

test("depth reuses only local contours in a full Legend tray and in rotated groups", () => {
  const a = app();
  a.run(`resumeSavedGame(); game.difficulty = "legend"; game.twist = true;
    game.order = Array.from({ length: 192 }, (_, id) => id);
    game.pieces = Array(192).fill(null);
    game.rotations = game.order.map((id) => id % 4);
    renderedPieces.delete(game); renderGame();`);
  const checkDepth = (markup, groups, pieces) => {
    const layers = [...markup.matchAll(/<g class="piece-depth"[^>]*>([\s\S]*?)<\/g><\/g>/g)];
    assert.equal(layers.length, groups);
    assert.equal((markup.match(/<image /g) || []).length, pieces);
    let contours = 0;
    for (const [, depth] of layers) {
      assert.doesNotMatch(depth, /<image|<filter|filter[:=]|<path/);
      for (const [, shape] of depth.matchAll(/href="#([^"]+)"/g)) {
        contours++;
        assert.ok(markup.includes(`<path id="${shape}"`), `Missing contour ${shape}`);
      }
    }
    assert.equal(contours, pieces * 3);
  };
  checkDepth(a.node("#piece-tray").innerHTML, 192, 192);
  a.run(`game.pieces[0] = { id: 0, group: 0, x: 300, y: 250, locked: false };
    game.pieces[1] = { id: 1, group: 0, x: 300, y: 306.25, locked: false };
    game.rotations[0] = game.rotations[1] = 1; renderGame();`);
  const board = a.node("#puzzle-board").innerHTML;
  // The picture guide is independent of the two piece faces.
  checkDepth(board.replace(/<image id="guide-image"[^>]*\/>/, ""), 1, 2);
  assert.match(board, /href="#board-shape-1" transform="translate\(300,306.25\) rotate\(90 /);
  a.run(`drag = { id: 1, moving: true, members: game.pieces.filter(Boolean) }; renderDragPreview();`);
  const preview = a.node("#drag-preview-pieces").innerHTML;
  checkDepth(preview, 1, 2);
  assert.match(preview, /href="#drag-shape-0" transform="translate\(0,-56.25\) rotate\(90 /);
});

// The DOM doubles do not propagate events; explicitly deliver capture first.
async function keydown(a, node, key, detail = {}) {
  await a.document.emit("keydown", { key, ...detail });
  await node.emit("keydown", { key, ...detail });
}

test("the target marker follows keyboard or pointer input without changing the selected piece", async () => {
  for (const pointerType of ["mouse", "touch", "pen"]) {
    const a = app();
    a.run("resumeSavedGame();");
    const board = a.node("#puzzle-board"), cursor = a.node("#keyboard-cursor");
    const target = { closest: () => ({ dataset: { piece: "0" } }) };
    await a.document.emit("pointerdown", { pointerType });
    await a.node("#piece-tray").emit("click", { target, detail: 1 });
    assert.equal(a.document.activeElement, board);
    assert.equal(cursor.getAttribute("visibility"), "hidden");
    const piece = a.node('#piece-tray [data-piece="0"]');
    assert.equal(piece.classList.contains("selected"), true);
    const before = a.run("JSON.stringify(game.pieces)");
    await keydown(a, board, "ArrowRight");
    assert.equal(cursor.getAttribute("visibility"), "visible");
    assert.equal(cursor.getAttribute("x"), "152");
    assert.equal(cursor.getAttribute("y"), "2");
    await a.document.emit("pointermove", { pointerType });
    assert.equal(cursor.getAttribute("visibility"), "visible");
    // A pointer action on another control also hides the marker immediately.
    await a.document.emit("pointerdown", { pointerType, target: a.node("#edges-button") });
    a.run("renderGame();");
    assert.equal(cursor.getAttribute("visibility"), "hidden");
    assert.equal(a.run("selected"), 0);
    assert.equal(piece.classList.contains("selected"), true);
    assert.equal(piece.getAttribute("aria-pressed"), "true");
    assert.equal(a.run("JSON.stringify(game.pieces)"), before);
    await keydown(a, board, "Shift");
    assert.equal(cursor.getAttribute("visibility"), "hidden");
    await keydown(a, board, "ArrowDown");
    assert.equal(cursor.getAttribute("visibility"), "visible");
    assert.equal(cursor.getAttribute("x"), "152");
    assert.equal(cursor.getAttribute("y"), "152");
    await keydown(a, board, "Escape");
    assert.equal(cursor.getAttribute("visibility"), "hidden");
    assert.equal(a.run("selected"), null);
  }
});

test("keyboard selection from tray and table retains arrow navigation and Enter or Space placement", async () => {
  for (const source of ["tray", "table"]) for (const key of ["Enter", " "]) {
    const a = app();
    a.run(`resumeSavedGame();
      ${source === "table" ? "game.pieces[7] = { id: 7, group: 7, x: 300, y: 250, locked: false }; renderGame();" : ""}`);
    const board = a.node("#puzzle-board"), cursor = a.node("#keyboard-cursor");
    const target = { closest: () => ({ dataset: { piece: "7" } }) };
    if (source === "tray") {
      await keydown(a, a.node("#piece-tray"), key, { target });
      // Native tray buttons dispatch a click on Enter or Space.
      await a.node("#piece-tray").emit("click", { target, detail: 0 });
    } else await keydown(a, board, key, { target });
    assert.equal(a.run("selected"), 7);
    assert.equal(cursor.getAttribute("visibility"), "visible");
    for (const arrow of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"])
      await keydown(a, board, arrow);
    assert.equal(a.run("keyboardCell"), 7);
    assert.equal(a.node("#announcement").textContent, "Table row 2, column 2.");
    await keydown(a, board, key);
    assert.equal(a.run("game.pieces[7].locked"), true);
    assert.equal(JSON.parse(a.storage.get(KEY)).active.pieces[7].locked, true);
    assert.equal(a.run("selected"), null);
    assert.equal(cursor.getAttribute("visibility"), "hidden");
  }
});

test("status notifications join the open modal and survive its closing", async () => {
  for (const selector of ["#modal", "#about-dialog"]) {
    const a = app(), dialog = a.node(selector), toast = a.node("#toast");
    let parent = a.document.body;
    dialog.append = (node) => { assert.equal(node, toast); parent = dialog; };
    dialog.contains = (node) => parent === dialog && node === toast;
    a.document.body.append = (node) => { assert.equal(node, toast); parent = a.document.body; };
    dialog.open = true;
    a.run('toast("Could not restore this backup.");');
    assert.equal(parent, dialog);
    assert.equal(toast.hidden, false);
    assert.equal(toast.textContent, "Could not restore this backup.");
    await dialog.close();
    assert.equal(parent, a.document.body);
    assert.equal(toast.hidden, false);
    a.run('toast("Ready to play.");');
    assert.equal(parent, a.document.body);
  }
});
