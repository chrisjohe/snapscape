import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./helpers/app.js";

test("a replacement toast stays visible until its own timeout expires", () => {
  const a = app();
  a.run('toast("First notice");');
  a.elapseTimers(5000);
  a.run('toast("Second notice");');
  a.elapseTimers(501);
  assert.equal(a.node("#toast").hidden, false);
  assert.equal(a.node("#toast").textContent, "Second notice");
  a.elapseTimers(4999);
  assert.equal(a.node("#toast").hidden, true);
});

test("downloaded backup URLs are released only after the download grace period", async () => {
  const a = app();
  await a.node("#export-button").click();
  a.elapseTimers(19999);
  assert.equal(a.revoked.length, 0);
  a.elapseTimers(1);
  assert.deepEqual(a.revoked, ["blob:test"]);
});
