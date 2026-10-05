// The tour uses the real controls; the app supplies a disposable practice puzzle.
export function helpSteps(twist = false) {
  const practice = ["#table-scroll", ".tray-body", "#rotation-controls"];
  return [
    {
      id: "setup", title: "Make it your puzzle", targets: ["#upload-zone", "#sample-button"],
      body: '<p>Choose a photo and a difficulty. Your photo keeps its original shape.</p><p>Use the pencil beside the suggested name in setup step 3 to make it yours, or change it later beside the title during play.</p>',
      hint: "Explore the three setup areas below. We’ve added a sample photo for this tour.",
      actions: [
        { label: "1 · Photo", targets: ["#upload-zone", "#sample-button"] },
        { label: "2 · Difficulty", targets: [".challenge-step"] },
        { label: "3 · Name", targets: [".launch-content"] },
      ],
    },
    {
      id: "saving", title: "Your progress stays with you", targets: [".game-info", "#pause-cover"],
      allow: ["#pause-button", "#continue-button"],
      body: '<p><strong>Your puzzle saves automatically in this browser</strong> after every move and regularly while you play. Close the tab and return later.</p><p>The clock counts active play only. Pause anytime; hiding this tab pauses automatically.</p>',
      hint: "Try Pause and Resume. Your own puzzle is on hold throughout the tour.",
    },
    {
      id: "navigation", title: "Find your way around", targets: [".brand", "#main-navigation"],
      body: '<p>Select the <strong>snapscape logo</strong> to return to photo setup, or visit the <strong>Trophy Swamp</strong> and <strong>Chomp Club</strong>.</p><p>Select <strong>Continue puzzle</strong> to pick up where you left off.</p>',
    },
    {
      id: "moving", title: "Bring pieces to the table", targets: ["#table-scroll", ".tray-body"], allow: practice,
      body: '<p>Drag pieces from the tray onto the table. You can also tap a piece, then tap a spot on the table.</p><details><summary>Playing with a keyboard</summary><p>Select a piece with <kbd>Enter</kbd>, use arrow keys on the table, then press <kbd>Enter</kbd> to place it. <kbd>Escape</kbd> puts the selection down.</p></details>',
      hint: "Try moving a piece. This practice puzzle won’t change your memories or points.",
    },
    {
      id: "snapping", title: "A little snap, a perfect fit", targets: ["#table-scroll", "#rotation-controls"], allow: ["#table-scroll", "#rotation-controls"],
      body: '<p>Matching neighbors snap into groups you can move together. Pieces lock when they reach their home in the frame, facing upright.</p>',
      hint: "Move the two pieces together, or use the buttons to see them join and lock.",
      actions: [{ label: "Join neighbors", action: "join" }, { label: "Lock in frame", action: "lock" }],
    },
    ...(twist ? [{
      id: "rotation", title: "Give it a twist", targets: ["#table-scroll", "#rotation-controls"], allow: ["#table-scroll", "#rotation-controls"],
      body: '<p>Select a piece, then use <strong>Rotate left</strong> or <strong>Rotate right</strong> above it to turn it 90°. Or press <kbd>R</kbd> to turn right and <kbd>Shift</kbd> + <kbd>R</kbd> to turn left. Connected groups rotate together.</p><details><summary>Twist points</summary><p>Twist doubles base points, the rounded time bonus, and Picture guide costs. Achievement rewards stay the same.</p></details>',
      hint: "Try turning the selected piece. This step appears when Twist is enabled.",
    }] : []),
    {
      id: "helpers", title: "A little help along the way", targets: ["#reference-button", "#edges-button", "#table-scroll", ".tray-body"],
      allow: [...practice, "#reference-button", "#edges-button"],
      body: '<p><strong>Picture guide</strong> previews the photo until you move a piece. <strong>Edge pieces</strong> filters the border pieces for free.</p>',
      hint: "Try both helpers. Picture guide is free in this practice puzzle.",
    },
    {
      id: "view", title: "Make room to explore", targets: [".view-tools", "#zoom-panel", "#table-scroll"],
      allow: [".view-tools", "#table-scroll"],
      body: '<p><strong>Fit</strong> shows the whole picture. Zoom in to see the details.</p><p><strong>Pan table</strong> lets you swipe around a zoomed table; turn it off to move pieces.</p>',
      hint: "Try a larger zoom, turn on Pan table, and explore. Choose Fit to see everything again.",
    },
    {
      id: "backup", title: "Keep a copy of your memories", targets: ["#export-button", "#options-toggle"],
      body: '<p>Use <strong>Options → Back up memories</strong> to keep a copy or move to another device.</p><p>Your backup includes your photos, saved puzzle, Trophy Swamp, and points. Use <strong>Restore from backup</strong> on the other device.</p>',
      hint: "You’re ready to snap! Finish the tour to return to where you started.",
    },
  ];
}

// A luminance mask joins overlapping spotlights without dimming their overlap.
export function spotlightMask(rects, width, height) {
  const holes = rects.filter((r) => r.width > 0 && r.height > 0).map((r) =>
    `<rect x="${r.left - 5}" y="${r.top - 5}" width="${r.width + 10}" height="${r.height + 10}" rx="12" fill="black"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><mask id="spotlight"><rect width="100%" height="100%" fill="white"/>${holes}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#spotlight)"/></svg>`;
}

export function createHelpTour({ steps, onStep, onAction, onClose, onEscape, onLayout }) {
  const root = document.querySelector("#help-tour");
  const card = root.querySelector(".tour-card");
  const title = root.querySelector("#tour-title");
  const actions = root.querySelector("#tour-actions");
  const back = root.querySelector("#tour-back");
  const next = root.querySelector("#tour-next");
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let index = 0, targets = [], frame = 0, closed = false, excluded = [];
  const elements = (selectors) => selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
  const allowed = () => [root, ...elements(["#announcement", "#toast", ...(steps[index].allow || [])])];
  const canUse = (target) => allowed().some((element) => element.contains(target));
  const restoreAccess = () => {
    for (const element of excluded) element.inert = false;
    excluded = [];
  };
  function limitAccess() {
    const roots = allowed();
    function visit(element) {
      if (roots.includes(element)) return;
      if (roots.some((root) => element.contains(root))) {
        for (const child of element.children) visit(child);
      } else if (!element.inert) {
        element.inert = true;
        excluded.push(element);
      }
    }
    for (const element of document.body.children) visit(element);
  }
  function layout() {
    frame = 0;
    if (closed) return;
    const height = card.getBoundingClientRect().height;
    document.body.style.setProperty("--tour-space", `${height + 28}px`);
    onLayout();
    const rects = elements(targets).map((element) => element.getBoundingClientRect());
    const mask = `url("data:image/svg+xml,${encodeURIComponent(spotlightMask(rects, window.innerWidth, window.innerHeight))}")`;
    root.querySelector(".tour-shade").style.maskImage = mask;
    root.querySelector(".tour-shade").style.webkitMaskImage = mask;
    root.querySelector(".tour-rings").innerHTML = rects.filter((r) => r.width && r.height).map((r) =>
      `<rect x="${r.left - 5}" y="${r.top - 5}" width="${r.width + 10}" height="${r.height + 10}" rx="12"/>`,
    ).join("");
  }
  function refresh() {
    if (!closed && !frame) frame = requestAnimationFrame(layout);
  }
  function reveal() {
    layout();
    const element = elements(targets).find((element) => element.getBoundingClientRect().height);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const top = steps[index].id === "navigation" ? 12 : 96;
    const room = Math.max(80, window.innerHeight - card.offsetHeight - top - 32);
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - top - Math.max(0, (room - rect.height) / 2)), behavior: "instant" });
    refresh();
  }
  function show() {
    restoreAccess();
    const step = steps[index];
    targets = step.targets;
    title.textContent = step.title;
    root.querySelector("#tour-progress").textContent = `HOW TO PLAY · ${index + 1} OF ${steps.length}`;
    root.querySelector("#tour-copy").innerHTML = step.body;
    root.querySelector(".tour-content").scrollTop = 0;
    root.querySelector("#tour-hint").textContent = step.hint || "Follow the highlighted areas, then continue the tour.";
    actions.replaceChildren();
    for (const [i, action] of (step.actions || []).entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tour-action";
      button.textContent = action.label;
      if (action.targets) button.setAttribute("aria-pressed", String(i === 0));
      button.addEventListener("click", () => {
        if (action.targets) {
          targets = action.targets;
          for (const sibling of actions.children) sibling.setAttribute("aria-pressed", String(sibling === button));
          reveal();
        } else {
          onAction(action.action);
          refresh();
        }
      }, options);
      actions.append(button);
    }
    actions.hidden = !step.actions?.length;
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? "Finish tour" : "Next →";
    onStep(step);
    title.focus({ preventScroll: true });
    limitAccess();
    reveal();
  }
  function close() {
    if (closed) return;
    closed = true;
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    restoreAccess();
    root.hidden = true;
    document.body.classList.remove("tour-active");
    document.body.style.removeProperty("--tour-space");
    onClose();
  }
  back.addEventListener("click", () => { if (index > 0) { index--; show(); } }, options);
  next.addEventListener("click", () => { if (index < steps.length - 1) { index++; show(); } else close(); }, options);
  root.querySelector("#tour-close").addEventListener("click", close, options);
  // Keep keyboard, pointer and assistive-technology activation within this step.
  for (const type of ["click", "pointerdown", "drop"]) {
    document.addEventListener(type, (event) => {
      if (!canUse(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { ...options, capture: true });
  }
  document.addEventListener("focusin", (event) => {
    if (!canUse(event.target)) title.focus({ preventScroll: true });
  }, { ...options, capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // Escape first releases a carried practice piece; a second press exits.
      if (onEscape()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      event.preventDefault(); event.stopImmediatePropagation(); close();
    } else if (event.key === "Tab") {
      const focusable = [...document.querySelectorAll('button, a[href], input, summary, [tabindex="0"]')]
        .filter((el) => !el.disabled && !el.closest("[inert]") && el.getClientRects().length && canUse(el));
      const current = focusable.indexOf(document.activeElement);
      const destination = current < 0 ? (event.shiftKey ? focusable.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[destination]?.focus({ preventScroll: true });
    } else if (!canUse(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, { ...options, capture: true });
  window.addEventListener("resize", refresh, options);
  window.visualViewport?.addEventListener("resize", refresh, options);
  document.addEventListener("scroll", refresh, { ...options, capture: true, passive: true });
  const observer = new ResizeObserver(refresh);
  observer.observe(card);
  document.body.classList.add("tour-active");
  root.hidden = false;
  try { show(); }
  catch (error) { close(); throw error; }
  return { close, refresh, get step() { return steps[index]; } };
}
