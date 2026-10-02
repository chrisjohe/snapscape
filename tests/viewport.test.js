import { test } from "node:test";
import assert from "node:assert/strict";
import { boardViewport, BOARD_MARGIN } from "../engine.js";

test("fit reserves space for the desktop footer or the stacked tablet controls", () => {
  for (const spaceBelow of [54, 420]) {
    const { height } = boardViewport({
      viewportHeight: 1180,
      tableTop: 210,
      spaceBelow,
    });
    assert.ok(height >= 240);
    assert.ok(210 + height + spaceBelow <= 1180);
  }
});
test("the table fills a large workspace even when the fitted picture is narrower", () => {
  const size = boardViewport({
    viewportHeight: 1440,
    tableTop: 88,
    spaceBelow: 14,
    availableWidth: 2200,
    frameRatio: 2 / 3,
  });
  assert.equal(size.tableWidth, 2200);
  assert.equal(size.tableHeight, 1338);
  assert.equal(size.height, 1338);
  assert.equal(size.width, 892);
  assert.ok(size.height > 720);
});
test("zoom presets from 50% to 200% scale the board without resizing the containing table", () => {
  for (const mobile of [false, true]) {
    const options = {
      viewportHeight: 1180,
      tableTop: 320,
      availableWidth: mobile ? 360 : 900,
      frameRatio: 0.7,
      mobile,
    };
    const base = boardViewport(options);
    for (const zoom of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      const scaled = boardViewport({
        ...options,
        zoom,
      });
      assert.equal(scaled.height, base.height);
      assert.equal(scaled.width, base.width);
      assert.equal(scaled.tableHeight, base.tableHeight);
      assert.equal(scaled.tableWidth, base.tableWidth);
      assert.equal(scaled.scale, zoom);
    }
  }
});
test("the picture fits inside the full table without stretching or clipping", () => {
  for (const ratio of [2 / 3, 3 / 20, 1, 3 / 2, 7]) {
    const photoWidth = 900;
    const photoHeight = photoWidth / ratio;
    const frameWidth = photoWidth + BOARD_MARGIN * 2;
    const frameHeight = photoHeight + BOARD_MARGIN * 2;
    for (const availableWidth of [350, 750, 1000]) {
      const size = boardViewport({
        viewportHeight: 900,
        tableTop: 100,
        spaceBelow: 28,
        availableWidth,
        frameRatio: frameWidth / frameHeight,
      });
      const scale = size.width / frameWidth;
      const marginX = (size.width - photoWidth * scale) / 2;
      const marginY = (size.height - photoHeight * scale) / 2;
      assert.equal(size.tableWidth, availableWidth);
      assert.equal(size.tableHeight, 772);
      assert.ok(size.width <= availableWidth);
      assert.ok(size.height <= size.availableHeight + 1e-9);
      assert.ok(marginX > 0 && marginX <= 10);
      assert.ok(Math.abs(marginX - marginY) < 1e-9);
      assert.ok(
        Math.abs(size.width - availableWidth) < 1e-9 ||
          Math.abs(size.height - size.availableHeight) < 1e-9,
      );
    }
  }
});
test("short windows retain a usable table and unknown zoom resets to fit", () => {
  for (const zoom of [0.49, 2.01, 20, 0, -1, NaN, Infinity, "1.5", null]) {
    const small = boardViewport({
      viewportHeight: 400,
      tableTop: 320,
      mobile: true,
      zoom,
    });
    assert.equal(small.height, 240);
    assert.equal(small.scale, 1);
  }
});
