import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./helpers/app.js";

test("rotation controls stay within the visible table and clear the sticky header", async () => {
  const a = app();
  a.run("resumeSavedGame(); game.twist = true; selected = 0;");
  const controls = a.node("#rotation-controls"), table = a.node("#table-scroll"),
    outline = a.node(".tray-return-preview .piece-outline");
  controls.hidden = false;
  controls.rect = { left: 0, top: 0, width: 96, height: 44 };
  a.window.innerWidth = 360;
  a.window.innerHeight = 700;
  a.node(".table-area").rect = { left: 18, top: 60, width: 324, height: 400 };
  table.rect = { left: 18, top: 60, width: 324, height: 400 };
  a.node(".site-header").rect = { left: 18, top: 12, width: 324, height: 64 };
  for (const piece of [
    { left: -500, top: -100, width: 100, height: 90 },
    { left: 500, top: 900, width: 100, height: 90 },
    { left: 160, top: 260, width: 100, height: 90 },
  ]) {
    outline.rect = piece;
    a.run("positionRotationControls();");
    const center = parseFloat(controls.style.left) + 18,
      bottom = parseFloat(controls.style.top) + 60;
    assert.ok(center - 48 >= 26);
    assert.ok(center + 48 <= 334);
    assert.ok(bottom - 44 >= 84);
    assert.ok(bottom <= 452);
  }
  // Window scrolling changes which part of the table is visible.
  table.rect.top = -100;
  outline.rect = { left: 160, top: -50, width: 100, height: 90 };
  await a.document.emit("scroll");
  assert.equal(parseFloat(controls.style.top) + 60 - 44, 84);
  table.rect.top = -600;
  await a.document.emit("scroll");
  assert.equal(controls.style.visibility, "hidden");
  table.rect.top = 60;
  await a.document.emit("scroll");
  assert.equal(controls.style.visibility, "");
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
