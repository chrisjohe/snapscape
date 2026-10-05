import { test } from "node:test";
import assert from "node:assert/strict";
import { app, KEY, savedProgress } from "./helpers/app.js";

function completedPuzzle(a) {
  a.run(`resumeSavedGame();
    game.pieces = game.pieces.map((_, id) => ({ id, group: id, ...target(game, id), locked: true }));
    prepareImage = () => new Promise(resolve => { globalThis.finishThumbnail = resolve; });`);
}

test("a tour cannot suspend a pending completion, and duplicate completion awards only once", async () => {
  const a = app();
  completedPuzzle(a);
  const finishing = a.run("completeGame();");
  await a.node("#help-button").click();
  assert.equal(a.run("helpSession"), null);
  assert.match(a.node("#toast").textContent, /Finishing your puzzle/);
  await a.run("completeGame();");
  a.run('finishThumbnail({ image: "data:image/jpeg;base64,AAAA" });');
  await finishing;
  assert.equal(JSON.parse(a.storage.get(KEY)).records.length, 2);
  assert.equal(a.run("game"), null);
  assert.equal(a.run("completingGame"), null);
  assert.match(a.node("#modal-content").innerHTML, /Well snapped!/);
  await a.node("#help-button").click();
  assert.notEqual(a.run("helpSession"), null);
});

test("a completion conflict does not present rewards discarded by the other tab", async () => {
  const a = app();
  completedPuzzle(a);
  const finishing = a.run("completeGame();");
  const incoming = savedProgress();
  incoming.revision = "other-tab-finished";
  incoming.active.name = "Other tab's puzzle";
  a.storage.set(KEY, JSON.stringify(incoming));
  a.run('finishThumbnail({ image: "data:image/jpeg;base64,AAAA" });');
  await finishing;
  assert.equal(a.run("data.active.name"), "Other tab's puzzle");
  assert.equal(a.run("data.records.length"), 1);
  assert.equal(a.node("#modal").open, false);
  assert.equal(a.node("#game").hidden, true);
  assert.equal(a.node("#setup").hidden, false);
  assert.match(a.node("#toast").textContent, /finish could not be saved/);
  assert.doesNotMatch(a.node("#announcement").textContent, /Puzzle complete! You earned/);
});

test("a completion write failure retains the rewards for backup and explains they are unsaved", async () => {
  const a = app();
  completedPuzzle(a);
  const before = a.storage.get(KEY);
  a.localStorage.setItem = () => { throw new Error("Storage full"); };
  const finishing = a.run("completeGame();");
  a.run('finishThumbnail({ image: "data:image/jpeg;base64,AAAA" });');
  await finishing;
  assert.equal(a.storage.get(KEY), before);
  assert.equal(a.run("data.records.length"), 2);
  assert.match(a.node("#modal-content").innerHTML, /rewards could not be saved/);
  assert.match(a.node("#announcement").textContent, /only in this tab/);
  await a.node("#export-button").click();
  const exported = JSON.parse(await a.blobs.at(-1).text());
  assert.equal(exported.records.length, 2);
});

test("selection and keyboard moves reuse board and tray SVGs, while placements invalidate the board", () => {
  const a = app();
  a.run("resumeSavedGame(); positionPiece(2, 420, 310); renderGame();");
  const board = a.node("#puzzle-board"), tray = a.node("#piece-tray");
  const boardWrites = board.innerHTMLWrites, trayWrites = tray.innerHTMLWrites;
  a.run("selectPiece(2); keyboardCell = 9; renderBoard();");
  assert.equal(board.innerHTMLWrites, boardWrites);
  assert.equal(tray.innerHTMLWrites, trayWrites);
  assert.equal(a.node('#puzzle-board [data-piece="2"]').classList.contains("selected"), true);
  assert.equal(a.node("#keyboard-cursor").getAttribute("visibility"), "visible");
  a.run("selected = null; renderGame();");
  assert.equal(a.node("#keyboard-cursor").getAttribute("visibility"), "hidden");
  a.run("positionPiece(2, 450, 330); renderGame();");
  assert.equal(board.innerHTMLWrites, boardWrites + 1);
  assert.equal(tray.innerHTMLWrites, trayWrites);
  a.run("positionPiece(3, 460, 340); renderGame();");
  assert.equal(tray.innerHTMLWrites, trayWrites + 1);
});

test("Twist rotation and edge filters invalidate tray markup without losing selection", async () => {
  const a = app();
  a.run("resumeSavedGame(); game.twist = true; game.rotations = Array(24).fill(0); selected = 0; renderGame();");
  const tray = a.node("#piece-tray"), before = tray.innerHTMLWrites;
  await a.run("rotateSelectedPiece();");
  assert.equal(tray.innerHTMLWrites, before + 1);
  assert.match(tray.innerHTML, /rotate\(90/);
  await a.node("#edges-button").click();
  assert.equal(tray.innerHTMLWrites, before + 2);
  a.run("selectPiece(0); selectPiece(0);");
  assert.equal(a.node('#piece-tray [data-piece="0"]').getAttribute("aria-pressed"), "true");
});
