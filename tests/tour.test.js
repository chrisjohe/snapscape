import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHelpTour, helpSteps } from "../tour.js";

test("the tour adds rotation only for Twist and keeps navigation and backup explanatory", () => {
  const regular = helpSteps(), twist = helpSteps(true);
  assert.equal(regular.some((step) => step.id === "rotation"), false);
  assert.equal(twist.some((step) => step.id === "rotation"), true);
  assert.deepEqual(twist.filter((step) => step.id !== "rotation"), regular);
  // Browsing and backup are explanations, not accidental navigation or downloads.
  assert.equal(regular.find((step) => step.id === "navigation").allow, undefined);
  assert.equal(regular.find((step) => step.id === "backup").allow, undefined);
  assert.ok(regular.find((step) => step.id === "moving").allow.includes("#table-scroll"));
});

// Build the inert/selector tree from the shipped markup. This uses no rendering
// engine and intentionally supplies geometry only for the tour layout callback.
function markupDocument() {
  let document;
  class Element {
    constructor(tag = "div", attributes = {}) {
      this.tag = tag; this.attributes = attributes; this.children = [];
      this.inert = false; this.listeners = new Map();
      this.classes = new Set((attributes.class || "").split(/\s+/));
      this.classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name),
      };
      this.style = { setProperty() {}, removeProperty() {} };
    }
    append(child) { child.parent = this; this.children.push(child); }
    contains(child) { return child === this || this.children.some((el) => el.contains(child)); }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(selector.startsWith("#") ? child.attributes.id === selector.slice(1)
          : selector.startsWith(".") ? child.classes.has(selector.slice(1))
          : child.tag === selector) ? [child] : [],
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    replaceChildren() { this.children = []; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 120 }; }
    get offsetHeight() { return 120; }
    focus() { document.activeElement = this; }
    addEventListener(type, fn, { signal } = {}) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
      signal?.addEventListener("abort", () => this.listeners.get(type).delete(fn), { once: true });
    }
    emit(type, event) { for (const fn of this.listeners.get(type) || []) fn(event); }
  }
  document = new Element("document");
  const stack = [document], voidTags = new Set(["meta", "link", "img", "input", "br", "hr"]);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/<(\/)?([a-z][\w-]*)([^>]*)>/gi)) {
    const [, closing, tag, raw] = match;
    if (closing) {
      while (stack.length > 1 && stack.pop().tag !== tag) {}
    } else {
      const attributes = Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
      const element = new Element(tag, attributes);
      stack.at(-1).append(element);
      if (!voidTags.has(tag) && !raw.endsWith("/")) stack.push(element);
    }
  }
  document.body = document.querySelector("body");
  document.createElement = (tag) => new Element(tag);
  return document;
}

test("the real tour keeps notifications accessible and its selectors match shipped markup", (t) => {
  const document = markupDocument();
  for (const step of helpSteps(true)) {
    for (const selector of [...step.targets, ...(step.allow || [])]) {
      assert.ok(document.querySelector(selector), `Missing tour selector: ${selector}`);
    }
  }
  const globals = {
    document,
    window: { innerWidth: 360, innerHeight: 700, scrollY: 0, scrollTo() {}, addEventListener() {} },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    ResizeObserver: class { observe() {} disconnect() {} },
  };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, globals);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  let closed = 0;
  const tour = createHelpTour({ steps: [helpSteps().find((step) => step.id === "view")],
    onStep() {}, onAction() {}, onLayout() {}, onEscape: () => false, onClose: () => closed++,
  });
  const isInert = (element) => Boolean(element && (element.inert || isInert(element.parent)));
  assert.equal(isInert(document.querySelector("#toast")), false);
  assert.equal(isInert(document.querySelector("#announcement")), false);
  assert.equal(isInert(document.querySelector(".view-tools")), false);
  assert.equal(isInert(document.querySelector("#export-button")), true);
  let blocked = false;
  document.emit("click", { target: document.querySelector("#export-button"),
    preventDefault: () => blocked = true, stopImmediatePropagation() {},
  });
  assert.equal(blocked, true);
  tour.close();
  assert.equal(isInert(document.querySelector("#export-button")), false);
  assert.equal(document.querySelector("#help-tour").hidden, true);
  assert.equal(closed, 1);
});
