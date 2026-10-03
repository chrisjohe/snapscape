import { test } from "node:test";
import assert from "node:assert/strict";
import { helpSteps, spotlightMask } from "../tour.js";

test("the tour groups related topics and adds rotation only for Twist", () => {
  const regular = helpSteps(), twist = helpSteps(true);
  assert.equal(regular.length, 8);
  assert.equal(twist.length, 9);
  assert.deepEqual(twist.filter((step) => step.id !== "rotation"), regular);
  assert.deepEqual(regular.map((step) => step.id), [
    "setup", "saving", "navigation", "moving", "snapping", "helpers", "view", "backup",
  ]);
  assert.equal(regular[0].actions.length, 3);
  // Browsing and backup are explanations, not accidental navigation or downloads.
  assert.equal(regular.find((step) => step.id === "navigation").allow, undefined);
  assert.equal(regular.find((step) => step.id === "backup").allow, undefined);
  assert.ok(regular.find((step) => step.id === "moving").allow.includes("#table-scroll"));
});

test("spotlight masks support offscreen targets, overlapping targets, and hidden controls", () => {
  const mask = spotlightMask([
    { left: -20, top: -50, width: 600, height: 400 },
    { left: 10, top: 20, width: 40, height: 44 },
    { left: 0, top: 0, width: 0, height: 0 },
  ], 360, 640);
  assert.match(mask, /width="360" height="640"/);
  assert.match(mask, /x="-25" y="-55" width="610" height="410"/);
  assert.match(mask, /x="5" y="15" width="50" height="54"/);
  assert.equal((mask.match(/fill="black"/g) || []).length, 2);
  assert.match(mask, /mask="url\(#spotlight\)"/);
});
