import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SAMPLE_SNAPSCAPES, ACHIEVEMENTS, DIFFICULTIES } from "../engine.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("index.html"), app = read("app.js"), tour = read("tour.js"), css = read("styles.css");

test("literal app controls exist in the document or generated markup", () => {
  const ids = new Set(Array.from(`${html}\n${app}\n${tour}`.matchAll(/\bid="([\w-]+)"/g), ([, id]) => id));
  for (const [, id] of app.matchAll(/\$\(["']#([\w-]+)["']\)/g)) {
    assert.ok(ids.has(id), `Missing app control #${id}`);
  }
});

test("bundled assets referenced by markup, styles, and dynamic game lists exist", () => {
  const assets = new Set(Array.from(`${html}\n${app}\n${tour}\n${css}`.matchAll(/(?:\.\/)?assets\/([\w./-]+\.(?:png|jpg|svg|ico))/g), ([, path]) => path));
  for (const id of SAMPLE_SNAPSCAPES) assets.add(`snapscape-${id}.jpg`);
  for (const { icon } of ACHIEVEMENTS) assets.add(`${icon}_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg`);
  for (const { id } of DIFFICULTIES) assets.add(id === "snappy" ? "mascot.png" : `gator-${id}.png`);
  for (const asset of assets) {
    assert.ok(existsSync(new URL(`../assets/${asset}`, import.meta.url)), `Missing asset ${asset}`);
  }
});

test("release version agrees with the About label and browser cache keys", () => {
  const { version } = JSON.parse(read("package.json"));
  assert.ok(html.includes(`Snapscape · Version ${version}`));
  for (const [, versionKey] of `${html}\n${app}`.matchAll(/(?:app\.js|styles\.css|engine\.js|tour\.js)\?v=([^"']+)/g)) {
    assert.equal(versionKey, version);
  }
});
