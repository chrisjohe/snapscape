import { test } from "node:test";
import assert from "node:assert/strict";
import { app, KEY, savedProgress } from "./helpers/app.js";
import { SAMPLE_SNAPSCAPES, ACHIEVEMENTS } from "../engine.js";

function stubPhotos(a) {
  a.run(`let loadedSources = [];
    prepareImage = async (src) => {
      loadedSources.push(src);
      return { image: "data:image/jpeg;base64,AAAA", ratio: 4 / 3 };
    };`);
}

test("opening and dismissing the picker preserves the photo, challenge and saved puzzle", async () => {
  const a = app(), saved = a.storage.get(KEY);
  stubPhotos(a);
  a.run('showPhoto({ image: "my-photo.jpg", ratio: 1.5, ownPhoto: true });');
  a.node('[name=difficulty]:checked').value = "legend";
  a.node("#random-rotation").setAttribute("aria-pressed", "true");
  const photo = a.run("JSON.stringify(selectedPhoto)");
  await a.node("#sample-button").click();
  const markup = a.node("#modal-content").innerHTML;
  assert.equal(a.node("#modal").open, true);
  assert.equal(a.node("#modal").getAttribute("aria-labelledby"), "sample-picker-title");
  assert.equal(a.node("#modal").classList.contains("sample-picker-dialog"), true);
  assert.equal(a.document.activeElement, a.node("#sample-picker-title"));
  assert.equal((markup.match(/<button /g) || []).length, 16);
  assert.ok(markup.indexOf('id="sample-surprise"') < markup.indexOf('id="sample-choice-beach"'));
  assert.match(markup, /gator-surprise\.png/);
  assert.match(markup, /0 of 15 completed/);
  assert.doesNotMatch(markup, /undefined|assets\/snapscape-/);
  for (const id of SAMPLE_SNAPSCAPES) {
    assert.equal(markup.split(`id="sample-choice-${id}"`).length - 1, 1);
    assert.ok(markup.includes(`thumbnails/picker/snapscape-${id}.jpg`));
  }
  await a.node("#modal-close").click();
  assert.equal(a.node("#modal").open, false);
  assert.equal(a.run("loadedSources.length"), 0);
  assert.equal(a.run("JSON.stringify(selectedPhoto)"), photo);
  assert.equal(a.node('[name=difficulty]:checked').value, "legend");
  assert.equal(a.node("#random-rotation").getAttribute("aria-pressed"), "true");
  assert.equal(a.storage.get(KEY), saved);
  await a.node("#edit-setup-name-button").click();
  assert.equal(a.node("#modal").classList.contains("sample-picker-dialog"), false);
});

test("every picture can be selected directly without starting or replacing an unfinished puzzle", async () => {
  const a = app(), saved = a.storage.get(KEY);
  stubPhotos(a);
  a.node('[name=difficulty]:checked').value = "snappy";
  a.node("#random-rotation").setAttribute("aria-pressed", "true");
  for (const id of SAMPLE_SNAPSCAPES) {
    await a.node("#sample-button").click();
    await a.node(`#sample-choice-${id}`).click();
    assert.equal(a.run("selectedPhoto.sampleId"), id);
    assert.equal(a.run("selectedPhoto.ownPhoto"), false);
    assert.equal(a.run("loadedSources.at(-1)"), `./assets/snapscape-${id}.jpg`);
    assert.equal(a.node("#modal").open, false);
    assert.equal(a.document.activeElement, a.node("#sample-button"));
    assert.equal(a.node("#start-button").disabled, false);
    assert.equal(a.node('[name=difficulty]:checked').value, "snappy");
    assert.equal(a.node("#random-rotation").getAttribute("aria-pressed"), "true");
    assert.equal(a.run("game"), null);
    assert.equal(a.storage.get(KEY), saved);
    assert.match(a.node("#announcement").textContent, /is ready/);
    await a.node("#sample-button").click();
    assert.ok(a.node("#modal-content").innerHTML.includes(`id="sample-choice-${id}" type="button" aria-current="true"`));
    await a.node("#modal-close").click();
  }
});

test("completed badges match Sunshine Explorer across replays, difficulties, Twist and legacy records", async () => {
  const saved = savedProgress(), record = saved.records[0];
  saved.active.sampleId = "diner";
  saved.records = [
    { ...record, id: "beach-breezy", sampleId: "beach", ownPhoto: false },
    { ...record, id: "beach-legend", sampleId: "beach", difficulty: "legend", twist: true },
    { ...record, id: "tennis-finish", sampleId: "tennis", thumbnail: null },
    { ...record, id: "own-photo-id", name: "snapscape-bike.jpg", ownPhoto: true },
    { ...record, id: "legacy-finish", name: "snapscape-oranges.jpg" },
  ];
  const a = app(new Map([[KEY, JSON.stringify(saved)]]));
  stubPhotos(a);
  await a.node("#sample-button").click();
  const markup = a.node("#modal-content").innerHTML;
  assert.match(markup, /2 of 15 completed/);
  const buttons = [...markup.matchAll(/<button[\s\S]*?<\/button>/g)].map(([button]) => button);
  assert.doesNotMatch(buttons[0], /sample-completed/);
  for (const id of SAMPLE_SNAPSCAPES) {
    const button = buttons.find((html) => html.includes(`id="sample-choice-${id}"`));
    assert.equal(button.includes('class="sample-completed">'), ["beach", "tennis"].includes(id));
    assert.doesNotMatch(button, /disabled/);
  }
  const explorer = ACHIEVEMENTS.find(({ id }) => id === "explorer");
  assert.equal(explorer.progress(saved.records), "2 / 15 pictures");
  await a.node("#sample-choice-beach").click();
  assert.equal(a.run("selectedPhoto.sampleId"), "beach");
});

test("Surprise me can reach every eligible picture including completed ones and excludes the current picture", async () => {
  const a = app(new Map());
  stubPhotos(a);
  a.run('data.records = SAMPLE_SNAPSCAPES.map((sampleId) => ({ sampleId, ownPhoto: false }));');
  for (const current of [null, "beach", "gymnastics", "tennis"]) {
    const eligible = SAMPLE_SNAPSCAPES.filter((id) => id !== current), seen = new Set();
    for (let index = 0; index < eligible.length; ++index) {
      a.run(`selectedPhoto = ${current ? `{ sampleId: "${current}" }` : "null"};
        Math.random = () => ${(index + 0.5) / eligible.length};`);
      await a.node("#sample-button").click();
      await a.node("#sample-surprise").click();
      const choice = a.run("selectedPhoto.sampleId");
      assert.notEqual(choice, current);
      assert.equal(choice, eligible[index]);
      assert.equal(a.node("#modal").open, false);
      seen.add(choice);
    }
    assert.deepEqual([...seen].sort(), [...eligible].sort());
  }
});

test("failed or invalid choices keep the previous photo and allow another selection", async () => {
  const a = app();
  a.run(`showPhoto({ image: "previous.jpg", ratio: 1.5, ownPhoto: true });
    prepareImage = async () => { throw new Error("Picture unavailable"); };`);
  const before = a.run("JSON.stringify(selectedPhoto)");
  await a.node("#sample-button").click();
  await a.node("#sample-choice-beach").click();
  assert.equal(a.run("JSON.stringify(selectedPhoto)"), before);
  assert.equal(a.run("photoLoading"), false);
  assert.equal(a.node("#start-button").disabled, false);
  assert.equal(a.node("#toast").textContent, "Picture unavailable");
  await a.run('useSample("unknown");');
  assert.equal(a.run("JSON.stringify(selectedPhoto)"), before);
  stubPhotos(a);
  await a.node("#sample-button").click();
  await a.node("#sample-choice-tennis").click();
  assert.equal(a.run("selectedPhoto.sampleId"), "tennis");
});

test("a slow earlier selection cannot overwrite the latest picture or an uploaded photo", async () => {
  const a = app(new Map());
  a.run(`let resolveFirst, resolveSecond;
    prepareImage = (src) => new Promise((resolve) => {
      if (src.includes("beach")) resolveFirst = resolve;
      else resolveSecond = resolve;
    });`);
  await a.node("#sample-button").click();
  const first = a.node("#sample-choice-beach").click();
  await a.node("#sample-button").click();
  const second = a.node("#sample-choice-tennis").click();
  await a.node("#sample-button").click();
  a.run('resolveFirst({ image: "beach.jpg", ratio: 4 / 3 });');
  await first;
  assert.equal(a.run("selectedPhoto"), null);
  assert.equal(a.run("photoLoading"), true);
  a.run('resolveSecond({ image: "tennis.jpg", ratio: 4 / 3 });');
  await second;
  assert.equal(a.run("selectedPhoto.sampleId"), "tennis");
  assert.equal(a.run("photoLoading"), false);
  assert.equal(a.node("#sample-choice-tennis").getAttribute("aria-current"), "true");
  assert.equal(a.node("#sample-choice-beach").getAttribute("aria-current"), null);
  await a.node("#modal-close").click();
  await a.node("#sample-button").click();
  const stale = a.node("#sample-choice-beach").click();
  a.run('prepareImage = async () => ({ image: "upload.jpg", ratio: 1 });');
  await a.run('useFile({ size: 100, type: "image/jpeg", name: "upload.jpg" });');
  a.run('resolveFirst({ image: "beach.jpg", ratio: 4 / 3 });');
  await stale;
  assert.equal(a.run("selectedPhoto.ownPhoto"), true);
  assert.equal(a.run("selectedPhoto.image"), "upload.jpg");
});

test("external progress refreshes an open picker without taking focus, and erasure closes it", async () => {
  const a = app();
  await a.node("#sample-button").click();
  const focus = a.node("#sample-choice-tennis");
  focus.focus();
  const saved = savedProgress();
  saved.records[0].sampleId = "beach";
  saved.revision = "new-revision";
  const raw = JSON.stringify(saved);
  a.storage.set(KEY, raw);
  await a.window.emit("storage", { key: KEY, newValue: raw });
  assert.equal(a.node("#modal").open, true);
  assert.equal(a.document.activeElement, focus);
  assert.equal(a.node("#sample-progress").textContent, "1 of 15 completed");
  assert.equal(a.node("#sample-choice-beach .sample-completed").hidden, false);
  assert.equal(a.node("#sample-choice-tennis .sample-completed").hidden, true);
  a.storage.delete(KEY);
  await a.window.emit("storage", { key: KEY, newValue: null });
  assert.equal(a.node("#modal").open, false);
  await a.node("#sample-button").click();
  assert.match(a.node("#modal-content").innerHTML, /0 of 15 completed/);
});
