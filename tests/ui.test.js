import { test } from "node:test";
import assert from "node:assert/strict";
import { app, KEY } from "./helpers/app.js";

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
