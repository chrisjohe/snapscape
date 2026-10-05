import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./helpers/app.js";

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
