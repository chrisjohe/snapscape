import {
  DIFFICULTIES,
  difficulty,
  pictureGuideCost,
  score,
  achievementProgress,
  formatTime,
  randomId,
  shuffled,
  geometry,
  boardViewport,
  BOARD_MARGIN,
  target,
  edges,
  piecePath,
  pieceRotation,
  pieceBounds,
  rotateGroup,
  constrainGroup,
  placeGroup,
  returnGroupToTray,
  ACHIEVEMENTS,
  SAMPLE_SNAPSCAPES,
  validateData,
} from "./engine.js?v=20261002-21";
import { helpSteps, createHelpTour } from "./tour.js?v=20261002-23";
const $ = (s) => document.querySelector(s),
  KEY = "snapscape.v1";
const PUZZLE_TITLES = [
  "A little Florida sunshine",
  "Gator state of mind",
  "Sunshine on my mind",
  "Orange and blue bliss",
  "Stay snappy",
  "Chomp, smile, repeat",
  "A little chomp of happiness",
  "Meet me in the sunshine",
  "Florida feels like home",
  "On gator time",
  "Sunshine, one piece at a time",
  "A sunny state of mind",
  "Swamp sweet swamp",
  "Keep calm and chomp on",
  "Good times, gator style",
  "A little southern daydream",
  "Gator heart, happy soul",
  "Snapping up the good times",
  "A sunshine kind of day",
  "Orange, blue, and you",
  "Life in the sunshine lane",
  "Chasing that Florida feeling",
  "Take it easy, gator",
  "A pocketful of sunshine",
  "Swamp-side state of mind",
  "Just another day in paradise",
  "Small pieces, big gator energy",
  "Sunshine with a little bite",
  "Home is where the gator is",
  "A snappy little escape",
  "Forever Florida at heart",
  "Happiness with a chomp",
];
const emptyData = () => ({
  version: 1,
  records: [],
  active: null,
  guideUsed: false,
  guideExhausted: false,
  revision: "",
});
let data = emptyData(),
  game = null,
  selectedPhoto = null,
  selected = null,
  drag = null,
  ignoreClick = false,
  paused = true,
  runStart = 0,
  elapsed = 0,
  view = "play",
  showGuide = false,
  onlyEdges = false,
  keyboardCell = 0,
  toastTimeout,
  loadToken = 0,
  importToken = 0,
  photoLoading = false,
  storageBlocked = false,
  gameImageUrl = null,
  panMode = false,
  zoomLevel = 1,
  helpSession = null,
  helpTour = null;
const safe = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const announce = (message) => {
  $("#announcement").textContent = message;
};
function toast(message) {
  clearTimeout(toastTimeout);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  toastTimeout = setTimeout(() => ($("#toast").hidden = true), 5500);
}
function storageWarning(message) {
  $("#storage-warning").textContent = message;
  $("#storage-warning").hidden = false;
}
try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = validateData(JSON.parse(raw));
} catch {
  storageBlocked = true;
  storageWarning(
    "Saved data could not be opened. You can still play, but changes cannot be saved. Restore a Snapscape backup to recover your progress.",
  );
}
function seconds() {
  return elapsed + (!paused ? (performance.now() - runStart) / 1000 : 0);
}
function captureTime() {
  if (helpSession) return;
  if (game) game.seconds = seconds();
}
function save() {
  if (helpSession) return true;
  captureTime();
  if (storageBlocked) return false;
  try {
    const stored = localStorage.getItem(KEY);
    if ((stored ? (JSON.parse(stored).revision ?? "") : "") !== data.revision) {
      adoptExternal(stored);
      return false;
    }
    // Leave erased storage empty until the user creates or restores progress.
    if (!data.active && !data.records.length && !data.revision) return true;
    const previousRevision = data.revision;
    data.revision = randomId();
    let raw = JSON.stringify(data);
    while (raw.length > 1900000) {
      const old = data.records.find((r) => r.thumbnail);
      if (!old) break;
      old.thumbnail = null;
      raw = JSON.stringify(data);
    }
    try {
      localStorage.setItem(KEY, raw);
    } catch (error) {
      const thumbs = data.records.filter((r) => r.thumbnail);
      if (!thumbs.length) {
        data.revision = previousRevision;
        throw error;
      }
      for (const record of thumbs) record.thumbnail = null;
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (retryError) {
        data.revision = previousRevision;
        throw retryError;
      }
      toast(
        "Your scores are safe. Older thumbnails were cleared to make room.",
      );
    }
    $("#storage-warning").hidden = true;
    return true;
  } catch {
    storageWarning(
      "This browser could not save your latest progress. Keep this tab open and use “Back up memories” to save a copy.",
    );
    return false;
  }
}
function adoptExternal(raw) {
  helpTour?.close();
  try {
    if (!raw) {
      resetBrowserProgress();
      toast("Snapscape data was erased in another tab.");
      return;
    }
    data = validateData(JSON.parse(raw));
    game = null;
    drag = null;
    paused = true;
    selected = null;
    $("#game").hidden = true;
    $("#setup").hidden = false;
    updateAll();
    toast(
      "Progress changed in another tab. Your latest saved puzzle is ready to resume.",
    );
  } catch {
    storageWarning(
      "Another tab changed the saved data. Please reload before continuing.",
    );
    storageBlocked = true;
  }
}
window.addEventListener("storage", (e) => {
  if (e.key === KEY) adoptExternal(e.newValue);
});
$("#difficulty-options").innerHTML = DIFFICULTIES.map(
  (d) =>
    `<label class="difficulty-option"><input type="radio" name="difficulty" value="${d.id}" ${d.id === "snappy" ? "checked" : ""}><img class="difficulty-gator" src="./assets/${d.id === "snappy" ? "mascot" : `gator-${d.id}`}.png" alt="" width="64" height="64" aria-hidden="true"><span class="difficulty-copy"><strong>${d.name}</strong><span><b>${d.cols * d.rows}</b> pieces</span></span><small class="difficulty-points"><span data-base-points="${d.points}">${d.points.toLocaleString()}</span> <img class="difficulty-coin" src="./assets/snap-coin.png" alt="Snap Points" width="18" height="18"></small></label>`,
).join("");
$("#random-rotation").addEventListener("click", () => {
  const enabled = $("#random-rotation").getAttribute("aria-pressed") !== "true";
  $("#random-rotation").setAttribute("aria-pressed", String(enabled));
  document.querySelectorAll("[data-base-points]").forEach((label) => {
    label.textContent = (Number(label.dataset.basePoints) * (enabled ? 2 : 1)).toLocaleString();
  });
  announce(enabled ? "Twist on. Rotate pieces to solve the puzzle and earn double puzzle points." : "Twist off. Pieces start upright.");
});
function puzzleName() {
  return selectedPhoto?.name || selectedPhoto?.suggestedName || "Your favorite memory";
}
function renderSetupTitle() {
  $("#launch-tagline").hidden = Boolean(selectedPhoto);
  $("#setup-title").hidden = !selectedPhoto;
  $("#setup-puzzle-name").textContent = selectedPhoto ? puzzleName() : "";
  $("#edit-setup-name-button").disabled = photoLoading || !selectedPhoto;
}
function setPhotoLoading(loading) {
  photoLoading = loading;
  $("#upload-zone").setAttribute("aria-busy", String(loading));
  $("#photo-loading").hidden = !loading;
  $("#start-button").disabled = loading || !selectedPhoto;
  $("#start-hint").textContent = loading
    ? "Getting your picture ready…"
    : selectedPhoto
      ? "Your puzzle is ready when you are."
      : "Choose a picture to get started.";
  renderSetupTitle();
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "This picture could not be opened. Try a JPG, PNG, or WebP copy.",
        ),
      );
    image.src = src;
  });
}
async function prepareImage(src, max = 1120, quality = 0.8) {
  const image = await loadImage(src);
  if (image.width * image.height > 80000000)
    throw new Error(
      "That photo is very large. Choose a smaller copy under 80 megapixels.",
    );
  const ratio = image.width / image.height;
  if (ratio < 0.15 || ratio > 7)
    throw new Error(
      "Choose a photo with a less extreme shape so its pieces are comfortable to play.",
    );
  const scale = Math.min(1, max / Math.max(image.width, image.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffefa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    image: canvas.toDataURL("image/jpeg", quality),
    ratio: canvas.width / canvas.height,
  };
}
function renderPhotoPreview(photo) {
  const width = 900,
    height = width / photo.ratio,
    pieceSize = Math.min(width, height) * 0.26,
    viewHeight = height + pieceSize * 0.64,
    preview = $("#preview-image");
  // Reuse a square bottom-left corner from the game's puzzle-piece geometry.
  const level = difficulty("breezy"),
    cornerGame = { difficulty: level.id, ratio: level.cols / level.rows, seed: 0 },
    corner = piecePath(cornerGame, level.cols * (level.rows - 1)),
    cornerWidth = geometry(cornerGame).cw;
  // Center the photo itself; the loose piece overflows to the left without shifting it.
  preview.setAttribute("viewBox", `0 ${-pieceSize * 0.04} ${width} ${viewHeight}`);
  $("#photo-preview").style.setProperty("--preview-width", `${280 * width / viewHeight}px`);
  // Both parts reference the same image, keeping the cutout and loose piece aligned.
  preview.innerHTML = `<defs>
    <image id="preview-photo-source" href="${safe(photo.image)}" width="${width}" height="${height}"/>
    <path id="preview-corner" d="${corner}" transform="translate(0 ${height - pieceSize}) scale(${pieceSize / cornerWidth})"/>
    <mask id="preview-photo-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type: luminance">
      <rect width="${width}" height="${height}" fill="white"/>
      <use href="#preview-corner" fill="black"/>
    </mask>
    <clipPath id="preview-piece-clip" clipPathUnits="userSpaceOnUse"><use href="#preview-corner"/></clipPath>
    <filter id="preview-piece-shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="${pieceSize * 0.035}" stdDeviation="${pieceSize * 0.025}" flood-color="#173f52" flood-opacity="0.24"/>
    </filter>
  </defs>
  <use href="#preview-photo-source" mask="url(#preview-photo-mask)"/>
  <g transform="translate(${-pieceSize * 0.22} ${pieceSize * 0.32}) rotate(-14 ${pieceSize / 2} ${height - pieceSize / 2})" filter="url(#preview-piece-shadow)">
    <use href="#preview-photo-source" clip-path="url(#preview-piece-clip)"/>
    <use href="#preview-corner" fill="none" stroke="#fffefa" stroke-opacity="0.65" stroke-width="${pieceSize * 0.012}"/>
  </g>`;
}
function showPhoto(photo) {
  const focusWasOnUpload = document.activeElement === $("#photo-input");
  const titles = PUZZLE_TITLES.filter(
    (title) => title !== selectedPhoto?.suggestedName,
  );
  const name = titles[Math.floor(Math.random() * titles.length)];
  selectedPhoto = { ...photo, suggestedName: name };
  renderPhotoPreview(photo);
  $("#photo-preview").hidden = false;
  $("#upload-prompt").hidden = true;
  $("#remove-photo-button").hidden = false;
  $("#upload-zone").classList.add("has-photo");
  setPhotoLoading(false);
  if (focusWasOnUpload)
    $("#remove-photo-button").focus({ preventScroll: true });
}
function resetPhoto() {
  ++loadToken;
  selectedPhoto = null;
  $("#photo-preview").hidden = true;
  $("#preview-image").innerHTML = "";
  $("#upload-prompt").hidden = false;
  $("#remove-photo-button").hidden = true;
  $("#upload-zone").classList.remove("has-photo", "drag-over");
  $("#photo-input").value = "";
  setPhotoLoading(false);
}
function removePhoto() {
  resetPhoto();
  $("#photo-input").focus({ preventScroll: true });
  announce("Photo removed. Choose another picture for your puzzle.");
}
async function useSample() {
  const token = ++loadToken;
  const sampleId = SAMPLE_SNAPSCAPES[Math.floor(Math.random() * SAMPLE_SNAPSCAPES.length)];
  setPhotoLoading(true);
  try {
    const photo = await prepareImage(`./assets/snapscape-${sampleId}.png`);
    if (token !== loadToken) return;
    showPhoto({ ...photo, ownPhoto: false, sampleId });
  } catch (error) {
    if (token === loadToken) {
      toast(error.message);
      setPhotoLoading(false);
    }
  }
}
async function useFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    toast("Choose a photo smaller than 20 MB.");
    return;
  }
  if (
    !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) &&
    !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
  ) {
    toast("Please choose a JPG, PNG, or WebP photo.");
    return;
  }
  const token = ++loadToken;
  setPhotoLoading(true);
  const url = URL.createObjectURL(file);
  try {
    const photo = await prepareImage(url);
    if (token !== loadToken) return;
    showPhoto({ ...photo, ownPhoto: true });
    toast("Your photo is ready. Pick a challenge and start snapping.");
  } catch (error) {
    if (token === loadToken) {
      toast(error.message);
      setPhotoLoading(false);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
$("#photo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  useFile(file);
});
$("#remove-photo-button").addEventListener("click", removePhoto);
$("#upload-zone").addEventListener("dragover", (e) => {
  e.preventDefault();
  $("#upload-zone").classList.add("drag-over");
});
$("#upload-zone").addEventListener("dragleave", () =>
  $("#upload-zone").classList.remove("drag-over"),
);
$("#upload-zone").addEventListener("drop", (e) => {
  e.preventDefault();
  $("#upload-zone").classList.remove("drag-over");
  useFile(e.dataTransfer.files[0]);
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
$("#sample-button").disabled = false;
$("#sample-button").addEventListener("click", useSample);
function modal(html, labelledBy) {
  $("#modal-content").innerHTML = html;
  if (labelledBy) $("#modal").setAttribute("aria-labelledby", labelledBy);
  else $("#modal").removeAttribute("aria-labelledby");
  if (!$("#modal").open) $("#modal").showModal();
}
function closeModal() {
  $("#modal").close();
}
$("#modal-close").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
function confirmNew() {
  if (!selectedPhoto || photoLoading) return;
  if (data.active) {
    modal(
      `<div class="new-puzzle-dialog">
        <img class="new-puzzle-mascot" src="./assets/gator-peek.png" alt="" width="160" height="160" aria-hidden="true">
        <h2 id="new-puzzle-title">Start a new puzzle?</h2>
        <p>This will replace your unfinished puzzle.</p>
        <div class="dialog-actions">
          <button id="confirm-new" class="button primary" type="button">Start a new puzzle</button>
          <button id="keep-old" class="button secondary" type="button">Keep my saved puzzle</button>
        </div>
      </div>`,
      "new-puzzle-title",
    );
    $("#confirm-new").onclick = () => {
      closeModal();
      startGame();
    };
    $("#keep-old").onclick = closeModal;
  } else startGame();
}
$("#start-button").addEventListener("click", confirmNew);
function startGame() {
  const d = difficulty($("[name=difficulty]:checked").value),
    count = d.cols * d.rows,
    twist = $("#random-rotation").getAttribute("aria-pressed") === "true",
    rotations = Array.from({ length: count }, () => twist ? Math.floor(Math.random() * 4) : 0);
  if (twist && rotations.every((turns) => turns === 0)) rotations[0] = 1;
  game = {
    id: randomId(),
    name: puzzleName(),
    image: selectedPhoto.image,
    ratio: selectedPhoto.ratio,
    ownPhoto: selectedPhoto.ownPhoto,
    sampleId: selectedPhoto.sampleId ?? null,
    difficulty: d.id,
    twist,
    rotations,
    seed: Math.floor(Math.random() * 1000000),
    seconds: 0,
    guideUses: 0,
    pieces: Array(count).fill(null),
    order: shuffled(Array.from({ length: count }, (_, i) => i)),
    resumed: false,
  };
  data.active = game;
  openGame();
  save();
}
function openGame() {
  panMode = false;
  $("#pan-button").setAttribute("aria-pressed", "false");
  $("#puzzle-board").classList.remove("pan-mode");
  if (gameImageUrl?.startsWith("blob:") && gameImageUrl !== helpSession?.imageUrl)
    URL.revokeObjectURL(gameImageUrl);
  if (helpSession) gameImageUrl = game.image;
  else {
    const bytes = Uint8Array.from(atob(game.image.split(",")[1]), (c) => c.charCodeAt(0));
    gameImageUrl = URL.createObjectURL(
      new Blob([bytes], { type: game.image.split(";")[0].slice(5) }),
    );
  }
  selected = null;
  showGuide = false;
  onlyEdges = false;
  keyboardCell = 0;
  elapsed = game.seconds;
  paused = false;
  runStart = performance.now();
  $("#setup").hidden = true;
  $("#game").hidden = false;
  $("#pause-cover").hidden = true;
  updatePauseButton();
  $("#reference-button").setAttribute("aria-pressed", "false");
  $("#edges-button").setAttribute("aria-pressed", "false");
  zoomLevel = 1;
  updateZoomLabel();
  setZoomOpen(false);
  $("#table-scroll").scrollTo(0, 0);
  $("#game-name").textContent = game.name;
  tick();
  renderGame();
  updatePlayNavigation();
  window.scrollTo({ top: 0, behavior: "auto" });
  $("#puzzle-board").focus({ preventScroll: true });
}
function resumeSavedGame() {
  if (!data.active) return;
  game = data.active;
  game.resumed = true;
  openGame();
  if (game.pieces.every((p) => p?.locked)) completeGame();
  else save();
}
function editPuzzleName(name, onSave) {
  modal(
    '<h2>Edit puzzle name</h2><form id="rename-form"><label class="field-label" for="rename-input">Puzzle name</label><input id="rename-input" type="text" maxlength="60" required><div class="dialog-actions"><button class="button primary" type="submit">Save name</button><button class="button secondary" id="cancel-rename" type="button">Cancel</button></div></form>',
  );
  const input = $("#rename-input");
  input.value = name;
  input.focus();
  input.select();
  input.addEventListener("input", () => input.setCustomValidity(""));
  $("#cancel-rename").onclick = closeModal;
  $("#rename-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.setCustomValidity("Please enter a puzzle name.");
      input.reportValidity();
      return;
    }
    onSave(name);
    closeModal();
  });
}
$("#edit-setup-name-button").addEventListener("click", () => {
  if (!selectedPhoto || photoLoading) return;
  const editingPhoto = selectedPhoto;
  editPuzzleName(puzzleName(), (name) => {
    if (selectedPhoto !== editingPhoto || photoLoading) return;
    editingPhoto.name = name;
    renderSetupTitle();
    announce("Puzzle name updated.");
  });
});
$("#edit-name-button").addEventListener("click", () => {
  if (!game) return;
  const editingGame = game,
    wasRunning = !paused;
  pause();
  if (game !== editingGame) return;
  editPuzzleName(editingGame.name, (name) => {
    if (game !== editingGame || data.active !== editingGame) return;
    editingGame.name = name;
    $("#game-name").textContent = name;
    if (save()) announce("Puzzle name updated.");
  });
  $("#modal").addEventListener(
    "close",
    () => {
      if (wasRunning && game === editingGame && view === "play" && !document.hidden)
        resume();
    },
    { once: true },
  );
});
function updatePauseButton() {
  const button = $("#pause-button"),
    label = paused ? "Resume" : "Pause";
  button.dataset.paused = String(paused);
  button.setAttribute("aria-label", label);
  button.title = label;
  $("#reference-button").disabled = paused;
  updateRotationControl();
  $("#table-scroll").inert = paused;
  helpTour?.refresh();
}
function pause() {
  if (!game || paused) return;
  elapsed = seconds();
  paused = true;
  game.seconds = elapsed;
  tick();
  cancelDrag();
  save();
  $("#pause-cover").hidden = false;
  updatePauseButton();
  $("#piece-tray").inert = true;
}
function resume() {
  if (!game || !paused) return;
  const returnToBoard = document.activeElement === $("#continue-button");
  paused = false;
  runStart = performance.now();
  tick();
  $("#pause-cover").hidden = true;
  updatePauseButton();
  updateTrayReturnState();
  if (returnToBoard) $("#puzzle-board").focus({ preventScroll: true });
}
$("#pause-button").addEventListener("click", () =>
  paused ? resume() : pause(),
);
$("#continue-button").addEventListener("click", resume);
function leaveGame() {
  if (!game) return;
  pause();
  game = null;
  selected = null;
  $("#game").hidden = true;
  $("#setup").hidden = false;
  updateAll();
}
document.addEventListener("visibilitychange", () => {
  if (helpSession) {
    if (document.hidden) {
      helpSession.paused = true;
      helpSession.demoWasRunning = Boolean(game && !paused);
    } else if (helpSession.demoWasRunning) {
      helpSession.demoWasRunning = false;
      resume();
    }
  }
  if (document.hidden) pause();
});
window.addEventListener("pagehide", () => {
  captureTime();
  save();
});
setInterval(() => {
  if (game && !paused) tick();
}, 300);
setInterval(() => {
  if (game && !paused && !drag) save();
}, 10000);
function tick() {
  if (!game) return;
  const time = formatTime(seconds());
  $("#timer").textContent = time;
  $("#timer").dataset.long = String(time.length > 5);
}
const navToggle = $("#nav-toggle"),
  siteHeader = $(".site-header"),
  compactNavigation = window.matchMedia("(max-width: 960px)");
function setNavigationOpen(open) {
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
}
navToggle.addEventListener("click", () => {
  setNavigationOpen(navToggle.getAttribute("aria-expanded") !== "true");
});
siteHeader.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    navToggle.getAttribute("aria-expanded") === "true"
  ) {
    event.preventDefault();
    setNavigationOpen(false);
    navToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (helpSession) return;
  if (!siteHeader.contains(event.target)) setNavigationOpen(false);
});
document.addEventListener("focusin", (event) => {
  if (helpSession) return;
  if (!siteHeader.contains(event.target)) setNavigationOpen(false);
});
compactNavigation.addEventListener("change", () => {
  if (helpSession) {
    setNavigationOpen(helpTour?.step.id === "navigation");
    return;
  }
  const focused = document.activeElement;
  setNavigationOpen(false);
  if (compactNavigation.matches && $("#main-navigation").contains(focused)) {
    navToggle.focus();
  } else if (!compactNavigation.matches && focused === navToggle) {
    $(".nav-button.active").focus();
  }
});
function switchView(next, { showSetup = false } = {}) {
  if (!["play", "gallery", "achievements"].includes(next)) return;
  if ((next !== view || showSetup) && game) leaveGame();
  view = next;
  document
    .querySelectorAll(".view")
    .forEach((el) => (el.hidden = el.id !== `${next}-view`));
  document.querySelectorAll("[data-view]").forEach((button) => {
    const current = button.dataset.view === next;
    button.classList.toggle("active", current);
    if (current) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const focusContent =
    compactNavigation.matches &&
    $("#main-navigation").contains(document.activeElement);
  setNavigationOpen(false);
  updateAll();
  if (next === "play" && !showSetup && data.active && !game) {
    resumeSavedGame();
  } else if (focusContent) {
    $("#main").focus({ preventScroll: true });
  }
  if (next === "play") window.scrollTo({ top: 0, behavior: "auto" });
}
document
  .querySelectorAll("[data-view]")
  .forEach((b) =>
    b.addEventListener("click", () => switchView(b.dataset.view)),
  );
$(".brand").addEventListener("click", (e) => {
  e.preventDefault();
  switchView("play", { showSetup: true });
});
function pieceMarkup(id, prefix) {
  const { w, h, cw, ch } = geometry(game),
    t = target(game, id),
    path = piecePath(game, id),
    clip = `${prefix}-clip-${id}`;
  return `<g transform="rotate(${pieceRotation(game, id) * 90} ${cw / 2} ${ch / 2})"><defs><clipPath id="${clip}"><path d="${path}"/></clipPath></defs><path d="${path}" fill="#f8f5e9"/><image href="${gameImageUrl}" x="${-t.x}" y="${-t.y}" width="${w}" height="${h}" preserveAspectRatio="none" clip-path="url(#${clip})"/><path class="piece-outline" d="${path}" fill="none" stroke="#153c5260" stroke-width="1.2" vector-effect="non-scaling-stroke"/></g>`;
}
function renderGame() {
  if (!game) return;
  renderBoard();
  renderTray();
  updateGameProgress();
  updateRotationControl();
  helpTour?.refresh();
}
function renderBoard() {
  const { w, h, cw, ch, cols, rows } = geometry(game),
    margin = BOARD_MARGIN,
    board = $("#puzzle-board");
  board.setAttribute(
    "viewBox",
    `${-margin} ${-margin} ${w + margin * 2} ${h + margin * 2}`,
  );
  sizeBoard();
  let markup = `<rect x="0" y="0" width="${w}" height="${h}" rx="2" fill="#fbfaf4" stroke="#9eaf9a" stroke-width="2"/><image id="guide-image" href="${gameImageUrl}" width="${w}" height="${h}" opacity="${showGuide ? 0.4 : 0}" preserveAspectRatio="none" pointer-events="none"/>`;
  for (let r = 1; r < rows; r++)
    markup += `<path d="M0 ${r * ch}H${w}" stroke="#d4dcce" stroke-width="1" stroke-dasharray="3 8" pointer-events="none"/>`;
  for (let c = 1; c < cols; c++)
    markup += `<path d="M${c * cw} 0V${h}" stroke="#d4dcce" stroke-width="1" stroke-dasharray="3 8" pointer-events="none"/>`;
  for (const p of [
    ...game.pieces.filter((p) => p?.locked),
    ...game.pieces.filter((p) => p && !p.locked),
  ])
    markup += `<g class="board-piece ${p.locked ? "locked" : ""} ${selected === p.id ? "selected" : ""}" data-piece="${p.id}" ${p.locked ? "" : 'tabindex="0" role="button"'} transform="translate(${p.x},${p.y})" aria-label="${p.locked ? "Placed" : "Loose"} piece ${p.id + 1}">${pieceMarkup(p.id, "board")}</g>`;
  if (selected !== null) {
    const t = target(game, keyboardCell);
    markup += `<rect id="keyboard-cursor" x="${t.x + 2}" y="${t.y + 2}" width="${cw - 4}" height="${ch - 4}" fill="none" stroke="#bd4b23" stroke-width="3" stroke-dasharray="10 6" pointer-events="none"/>`;
  }
  board.innerHTML = markup;
}
function trayPieceSvg(id, prefix) {
  const { cw, ch } = geometry(game),
    pad = Math.min(cw, ch) * 0.29,
    box = pieceBounds(game, id);
  return `<svg viewBox="${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}" aria-hidden="true">${pieceMarkup(id, prefix)}</svg>`;
}
function renderTray() {
  const ids = game.order.filter(
    (id) => !game.pieces[id] && (!onlyEdges || edges(game, id).includes(0)),
  );
  $("#piece-tray").innerHTML =
    ids
      .map(
        (id) =>
          `<button class="tray-piece ${selected === id ? "selected" : ""}" data-piece="${id}" aria-label="Select piece ${id + 1}" aria-pressed="${selected === id}">${trayPieceSvg(id, "tray")}</button>`,
      )
      .join("") ||
    `<p style="grid-column:1/-1;padding:16px;font-size:14px;line-height:1.5">${onlyEdges ? "All edge pieces are on the table. Turn off “Edge pieces” to see the rest." : "All pieces are on the table. Keep joining them together!"}</p>`;
  updateTrayReturnState();
}
function updateTrayReturnState() {
  const carrying = selected !== null && !paused;
  $(".tray-panel").classList.toggle("is-return-target", carrying);
  if (!drag?.moving) $(".tray-panel").classList.remove("is-drag-over");
  $("#clear-selection").hidden = !carrying;
  $("#clear-selection").classList.toggle("with-preview", Boolean(carrying && game?.twist));
  $("#clear-selection").innerHTML = `${carrying && game?.twist ? `<span class="tray-return-preview">${trayPieceSvg(selected, "held")}</span>` : ""}<span>put piece back</span>`;
  $("#piece-tray").inert = paused || carrying;
}
function updateRotationControl() {
  const visible = Boolean(game?.twist && !paused && selected !== null && !game.pieces[selected]?.locked),
    buttons = [$("#rotate-left"), $("#rotate-right")];
  $("#rotation-controls").hidden = !visible;
  for (const button of buttons) button.disabled = !visible || Boolean(drag) || panMode;
  if (visible) positionRotationControls();
  if (!visible && !paused && buttons.includes(document.activeElement))
    $("#puzzle-board").focus({ preventScroll: true });
}
function positionRotationControls() {
  const controls = $("#rotation-controls");
  if (controls.hidden || !game || selected === null) return;
  // Measure the outline, since the clipped image extends beyond the piece.
  // Its screen bounds include rotation, zoom, and the table's scroll offset.
  const outline = game.pieces[selected]
    ? $(`#puzzle-board [data-piece="${selected}"] .piece-outline`)
    : $(".tray-return-preview .piece-outline");
  if (!outline) return;
  const piece = outline.getBoundingClientRect(),
    area = $(".table-area").getBoundingClientRect();
  controls.style.left = `${piece.left + piece.width / 2 - area.left}px`;
  controls.style.top = `${piece.top - area.top - 12}px`;
}
$("#table-scroll").addEventListener("scroll", positionRotationControls, { passive: true });
async function rotateSelectedPiece(turns = 1) {
  if (!game?.twist || paused || selected === null || drag || panMode) return;
  const id = selected, count = rotateGroup(game, id, turns);
  if (!count) return;
  setPictureGuide(false);
  if (game.pieces[id]) placeGroup(game, id);
  const locked = game.pieces[id]?.locked;
  if (locked) selected = null;
  renderGame();
  announce(locked ? "Nice snap! Pieces home." : `${count > 1 ? "Group" : "Piece"} rotated ${turns > 0 ? "clockwise" : "counterclockwise"}.`);
  if (game.pieces.every((p) => p?.locked)) await completeGame();
  else save();
}
$("#rotate-left").addEventListener("click", () => rotateSelectedPiece(-1));
$("#rotate-right").addEventListener("click", () => rotateSelectedPiece(1));
function rotationKey(event) {
  if (event.key.toLowerCase() !== "r" || event.ctrlKey || event.metaKey || event.altKey || !game?.twist || selected === null || paused) return false;
  event.preventDefault();
  if (!event.repeat) rotateSelectedPiece(event.shiftKey ? -1 : 1);
  return true;
}
$("#rotate-left").addEventListener("keydown", rotationKey);
$("#rotate-right").addEventListener("keydown", rotationKey);
function putPieceBack(id) {
  if (!game || paused || id === null || game.pieces[id]?.locked) return;
  const count = returnGroupToTray(game, id);
  if (count) setPictureGuide(false);
  selected = null;
  renderGame();
  if (count) save();
  announce(
    count > 1
      ? `${count} pieces returned to the tray.`
      : "Piece returned to the tray.",
  );
}
function updateGameProgress() {
  const count = game.pieces.filter((p) => p?.locked).length;
  const total = game.pieces.length;
  $("#placed-count").textContent = `${count} / ${total}`;
  const progress = $("#piece-progress");
  progress.setAttribute("aria-valuemax", total);
  progress.setAttribute("aria-valuenow", count);
  progress.setAttribute("aria-valuetext", `${count} of ${total} pieces placed`);
  $("#piece-progress-fill").setAttribute(
    "stroke-dashoffset",
    100 - (count / total) * 100,
  );
}
function selectPiece(id) {
  if (panMode) {
    toast("Turn off Pan table to pick up a piece.");
    return;
  }
  if (paused || !game || game.pieces[id]?.locked) return;
  selected = selected === id ? null : id;
  renderGame();
  if (selected !== null) {
    announce(
      `Piece ${id + 1} selected. Tap the table to place it, or use arrow keys, then Enter.${game.twist ? " Use Rotate left or Rotate right to turn it; R turns right and Shift+R turns left." : ""}`,
    );
    $("#puzzle-board").focus({ preventScroll: true });
  }
}
$("#pan-button").addEventListener("click", () => {
  panMode = !panMode;
  cancelDrag();
  selected = null;
  $("#pan-button").setAttribute("aria-pressed", String(panMode));
  $("#puzzle-board").classList.toggle("pan-mode", panMode);
  if (panMode)
    toast(
      "Swipe or scroll to move around the enlarged table. Turn off Pan table to place pieces.",
    );
  if (game) renderGame();
});
$("#clear-selection").addEventListener("click", () => {
  if (ignoreClick || drag?.moving) return;
  putPieceBack(selected);
  $("#puzzle-board").focus({ preventScroll: true });
});
function setPictureGuide(visible) {
  showGuide = visible;
  $("#reference-button").setAttribute("aria-pressed", String(showGuide));
  if (game) $("#guide-image")?.setAttribute("opacity", showGuide ? ".4" : "0");
}
function usePictureGuide() {
  if (!game || paused || drag || showGuide) return;
  if (helpSession) {
    setPictureGuide(true);
    announce("Practice Picture guide shown. No points deducted.");
    return;
  }
  const previewGame = game;
  const previously = achievementProgress(data.records, data).earned;
  game.guideUses = Math.min(Number.MAX_SAFE_INTEGER, (game.guideUses || 0) + 1);
  data.guideUsed = true;
  const award = score(game.difficulty, seconds(), game.guideUses, game.twist);
  if (award.total === 0) data.guideExhausted = true;
  // Save the charge immediately so leaving or reloading cannot reset it.
  save();
  if (game !== previewGame) return;
  setPictureGuide(true);
  const progress = achievementProgress(data.records, data);
  const unlocks = progress.earned.filter((a) => !previously.includes(a));
  $("#total-points").textContent = progress.totalPoints.toLocaleString();
  renderAchievements(progress);
  const rewardMessage = unlocks.length
    ? `Achievement${unlocks.length === 1 ? "" : "s"} earned: ${unlocks.map((a) => `${a.name} (+${a.points.toLocaleString()} Snap Points)`).join(" · ")}.`
    : "";
  if (rewardMessage) toast(rewardMessage);
  const guideMessage = award.total === 0
    ? "Picture guide shown. This puzzle will earn no points."
    : `Picture guide shown. ${award.guidePenalty.toLocaleString()} Snap Points deducted so far.`;
  announce([guideMessage, rewardMessage].filter(Boolean).join(" "));
}
$("#reference-button").addEventListener("click", () => {
  if (!game || paused || drag) return;
  if (showGuide) {
    setPictureGuide(false);
    return;
  }
  if (helpSession || game.guideUses > 0) {
    usePictureGuide();
    return;
  }
  const previewGame = game;
  pause();
  if (game !== previewGame) return;
  const cost = pictureGuideCost(game.difficulty, game.twist).toLocaleString();
  let confirmed = false;
  modal(
    `<div class="picture-guide-dialog">
      <img class="picture-guide-mascot" src="./assets/gator-peek.png" alt="" width="160" height="160" aria-hidden="true">
      <h2 id="picture-guide-title">A little peek?</h2>
      <p class="picture-guide-cost">Each use <span class="picture-guide-points"><span class="sr-only">${cost} Snap Points deducted</span><span aria-hidden="true">−${cost}</span><img class="difficulty-coin" src="./assets/snap-coin.png" alt="" width="18" height="18" aria-hidden="true"></span></p>
      <p>Disappears with your next move.</p>
      <div class="dialog-actions">
        <button id="confirm-guide" class="button primary" type="button">Use Picture guide</button>
        <button id="cancel-guide" class="button secondary" type="button">Keep puzzling</button>
      </div>
    </div>`,
    "picture-guide-title",
  );
  $("#modal").addEventListener("close", () => {
    if (game !== previewGame || data.active !== previewGame) return;
    if (view === "play" && !document.hidden) {
      resume();
      if (confirmed) usePictureGuide();
      $("#reference-button").focus({ preventScroll: true });
    }
  }, { once: true });
  $("#confirm-guide").onclick = () => {
    if (game !== previewGame || data.active !== previewGame) return;
    confirmed = true;
    closeModal();
  };
  $("#cancel-guide").onclick = closeModal;
  $("#cancel-guide").focus();
});
$("#edges-button").addEventListener("click", () => {
  onlyEdges = !onlyEdges;
  $("#edges-button").setAttribute("aria-pressed", String(onlyEdges));
  if (game) renderTray();
});
function updateZoomLabel() {
  const value = zoomLevel === 1 ? "Fit" : `${zoomLevel * 100}%`;
  $("#zoom-button").title = `Zoom: ${value}`;
  $("#zoom-button").setAttribute("aria-label", `Zoom: ${value}`);
  document.querySelectorAll("[data-zoom]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.zoom) === zoomLevel));
  });
}
function setZoomOpen(open) {
  $("#zoom-panel").hidden = !open;
  $("#zoom-button").setAttribute("aria-expanded", String(open));
  helpTour?.refresh();
}
$("#zoom-button").addEventListener("click", () => {
  const open = $("#zoom-panel").hidden;
  setZoomOpen(open);
  if (open) $(`[data-zoom="${zoomLevel}"]`).focus({ preventScroll: true });
});
$("#zoom-control").addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#zoom-panel").hidden) {
    event.preventDefault();
    setZoomOpen(false);
    $("#zoom-button").focus({ preventScroll: true });
  }
});
document.addEventListener("click", (event) => {
  if (helpSession) return;
  if (!$("#zoom-control").contains(event.target)) setZoomOpen(false);
});
document.addEventListener("focusin", (event) => {
  if (helpSession) return;
  if (!$("#zoom-control").contains(event.target)) setZoomOpen(false);
});
document.querySelectorAll("[data-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    zoomLevel = Number(button.dataset.zoom);
    updateZoomLabel();
    sizeBoard();
    if (zoomLevel <= 1) $("#table-scroll").scrollTo(0, 0);
    setZoomOpen(false);
    $("#zoom-button").focus({ preventScroll: true });
  });
});
function boardPoint(x, y) {
  const p = $("#puzzle-board").createSVGPoint();
  p.x = x;
  p.y = y;
  return p.matrixTransform($("#puzzle-board").getScreenCTM().inverse());
}
function withinBoard(x, y) {
  const r = $("#table-scroll").getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function withinTray(x, y) {
  const r = $(".tray-body").getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function boundedLocation(x, y) {
  const { w, h, cw, ch } = geometry(game);
  return {
    x: Math.max(-BOARD_MARGIN, Math.min(w - cw + BOARD_MARGIN, x)),
    y: Math.max(-BOARD_MARGIN, Math.min(h - ch + BOARD_MARGIN, y)),
  };
}
function positionPiece(id, x, y) {
  if (game.twist) {
    const piece = game.pieces[id];
    if (piece) {
      const dx = x - piece.x, dy = y - piece.y;
      game.pieces.filter((p) => p && p.group === piece.group).forEach((p) => {
        p.x += dx;
        p.y += dy;
      });
    } else game.pieces[id] = { id, x, y, group: id, locked: false };
    constrainGroup(game, id);
    setPictureGuide(false);
    return;
  }
  const loc = boundedLocation(x, y),
    piece = game.pieces[id];
  if (piece) {
    const members = game.pieces.filter((p) => p && p.group === piece.group),
      { w, h, cw, ch } = geometry(game);
    const dx = Math.max(
        -BOARD_MARGIN - Math.min(...members.map((p) => p.x)),
        Math.min(
          w - cw + BOARD_MARGIN - Math.max(...members.map((p) => p.x)),
          loc.x - piece.x,
        ),
      ),
      dy = Math.max(
        -BOARD_MARGIN - Math.min(...members.map((p) => p.y)),
        Math.min(
          h - ch + BOARD_MARGIN - Math.max(...members.map((p) => p.y)),
          loc.y - piece.y,
        ),
      );
    if (dx || dy) setPictureGuide(false);
    members.forEach((p) => {
      p.x += dx;
      p.y += dy;
    });
  } else {
    setPictureGuide(false);
    game.pieces[id] = { id, x: loc.x, y: loc.y, group: id, locked: false };
  }
}
async function finishPlacement(id) {
  const before = game.pieces.filter((p) => p?.locked).length;
  placeGroup(game, id);
  selected = null;
  renderGame();
  const after = game.pieces.filter((p) => p?.locked).length;
  if (after > before)
    announce(`${after} of ${game.pieces.length} pieces home. Nice snap!`);
  if (after === game.pieces.length) await completeGame();
  else save();
}
function pointerDown(e) {
  if (panMode || drag || !game || paused || !e.isPrimary || e.button !== 0)
    return;
  const el = e.target.closest("[data-piece]");
  if (!el) return;
  const id = Number(el.dataset.piece);
  if (game.pieces[id]?.locked) return;
  const pt = boardPoint(e.clientX, e.clientY),
    piece = game.pieces[id],
    { cw, ch } = geometry(game);
  drag = {
    id,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    offsetX: piece ? pt.x - piece.x : cw / 2,
    offsetY: piece ? pt.y - piece.y : ch / 2,
    original: game.pieces.map((p) => (p ? { ...p } : null)),
    moving: false,
  };
  updateRotationControl();
}
function pointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId || !game) return;
  if (
    !drag.moving &&
    Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 7
  )
    return;
  e.preventDefault();
  const first = !drag.moving;
  if (first) setPictureGuide(false);
  drag.moving = true;
  selected = drag.id;
  const pt = boardPoint(e.clientX, e.clientY);
  positionPiece(drag.id, pt.x - drag.offsetX, pt.y - drag.offsetY);
  if (first) {
    try {
      $("#puzzle-board").setPointerCapture(e.pointerId);
    } catch {}
    renderGame();
  } else
    for (const p of game.pieces) {
      if (p && p.group === game.pieces[drag.id].group) {
        const node = $(`#puzzle-board [data-piece="${p.id}"]`);
        if (node) node.setAttribute("transform", `translate(${p.x},${p.y})`);
      }
    }
  positionRotationControls();
  $(".tray-panel").classList.toggle(
    "is-drag-over",
    withinTray(e.clientX, e.clientY),
  );
}
async function pointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const old = drag;
  drag = null;
  updateRotationControl();
  if (!old.moving) return;
  ignoreClick = true;
  setTimeout(() => (ignoreClick = false), 0);
  if (!game) return;
  if (withinTray(e.clientX, e.clientY)) putPieceBack(old.id);
  else if (withinBoard(e.clientX, e.clientY)) await finishPlacement(old.id);
  else {
    game.pieces = old.original;
    selected = null;
    renderGame();
  }
}
function cancelDrag(e) {
  if (e && drag && e.pointerId !== drag.pointerId) return;
  const old = drag;
  drag = null;
  if (old && $("#puzzle-board").hasPointerCapture(old.pointerId))
    $("#puzzle-board").releasePointerCapture(old.pointerId);
  if (old?.moving && game) {
    game.pieces = old.original;
    selected = null;
    renderGame();
  }
  updateTrayReturnState();
  updateRotationControl();
}
$("#piece-tray").addEventListener("pointerdown", pointerDown);
$("#puzzle-board").addEventListener("pointerdown", pointerDown);
window.addEventListener("pointermove", pointerMove, { passive: false });
window.addEventListener("pointerup", pointerUp);
window.addEventListener("pointercancel", cancelDrag);
$("#piece-tray").addEventListener("click", (e) => {
  if (ignoreClick) return;
  const el = e.target.closest("[data-piece]");
  if (el) selectPiece(Number(el.dataset.piece));
});
$("#puzzle-board").addEventListener("click", (e) => {
  if (panMode || ignoreClick || !game || paused) return;
  const el = e.target.closest("[data-piece]");
  if (el && !game.pieces[Number(el.dataset.piece)].locked) {
    selectPiece(Number(el.dataset.piece));
    return;
  }
  if (selected !== null) {
    const pt = boardPoint(e.clientX, e.clientY),
      { cw, ch } = geometry(game);
    positionPiece(selected, pt.x - cw / 2, pt.y - ch / 2);
    finishPlacement(selected);
  }
});
$("#puzzle-board").addEventListener("keydown", (e) => {
  if (!game || paused) return;
  if (rotationKey(e)) return;
  if (e.key === "Escape") {
    cancelDrag();
    selected = null;
    renderGame();
    return;
  }
  if (selected === null) {
    const el = e.target.closest("[data-piece]");
    if (el && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      selectPiece(Number(el.dataset.piece));
    }
    return;
  }
  const { cols, rows } = geometry(game);
  let r = Math.floor(keyboardCell / cols),
    c = keyboardCell % cols;
  if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
  else if (e.key === "ArrowRight") c = Math.min(cols - 1, c + 1);
  else if (e.key === "ArrowUp") r = Math.max(0, r - 1);
  else if (e.key === "ArrowDown") r = Math.min(rows - 1, r + 1);
  else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const t = target(game, keyboardCell);
    positionPiece(selected, t.x, t.y);
    finishPlacement(selected);
    return;
  } else return;
  e.preventDefault();
  keyboardCell = r * cols + c;
  renderBoard();
  announce(`Table row ${r + 1}, column ${c + 1}.`);
});
function scoreReels(points) {
  const formatted = points.toLocaleString();
  const digits = Array.from({ length: 10 }, (_, digit) => digit.toLocaleString());
  let reel = 0;
  const characters = Array.from(formatted, (character) => {
    const digit = digits.indexOf(character);
    if (digit < 0) return `<span class="score-separator">${safe(character)}</span>`;
    // Two full turns, then land on the final digit. CSS keeps that same final
    // position when reduced motion disables the animation; no timers needed.
    const strip = Array.from({ length: 21 + digit }, (_, i) =>
      `<span>${safe(digits[i % 10])}</span>`,
    ).join("");
    const duration = 1050 + reel++ * 160;
    return `<span class="score-reel"><span class="score-reel-strip" style="--reel-duration: ${duration}ms">${strip}</span></span>`;
  }).join("");
  return `<span class="sr-only">+${safe(formatted)}</span><span class="score-reels" aria-hidden="true"><span class="score-plus">+</span>${characters}</span>`;
}
async function completeGame() {
  if (helpSession) {
    announce("Practice puzzle complete. Nice snapping! Your memories and points are unchanged.");
    return;
  }
  captureTime();
  elapsed = game.seconds;
  paused = true;
  tick();
  const completed = game,
    previously = achievementProgress(data.records, data).earned,
    award = score(completed.difficulty, completed.seconds, completed.guideUses, completed.twist);
  let thumbnail = null;
  try {
    thumbnail = (await prepareImage(completed.image, 260, 0.6)).image;
  } catch {}
  if (game !== completed) return;
  if (!data.records.some((r) => r.id === completed.id))
    data.records.push({
      id: completed.id,
      name: completed.name,
      difficulty: completed.difficulty,
      seconds: completed.seconds,
      points: award.total,
      guideUses: completed.guideUses || 0,
      twist: completed.twist === true,
      date: new Date().toISOString(),
      thumbnail,
      resumed: completed.resumed,
      ownPhoto: completed.ownPhoto,
      sampleId: completed.sampleId ?? null,
    });
  data.active = null;
  game = null;
  resetPhoto();
  save();
  const unlocks = achievementProgress(data.records, data).earned.filter(
    (a) => !previously.includes(a),
  );
  const achievementBonus = unlocks.reduce((sum, a) => sum + a.points, 0);
  const totalAward = award.total + achievementBonus;
  updateAll();
  $("#game").hidden = true;
  $("#setup").hidden = false;
  showCompletion({ completed, award, unlocks, achievementBonus, totalAward });
  announce(`Puzzle complete! You earned ${totalAward.toLocaleString()} Snap Points.${achievementBonus ? ` Includes ${achievementBonus.toLocaleString()} achievement bonus points.` : ""}`);
}
function showCompletion({ completed, award, unlocks, achievementBonus, totalAward }) {
  function showWin(returning = false) {
    modal(
      `<div class="win${returning ? " win-returned" : ""}">
      <img class="win-mascot" src="./assets/gator-celebrate.png" alt="" width="128" height="128" aria-hidden="true">
      <h2 id="win-title"><span class="sr-only">Well snapped!</span><span class="win-title-letters" aria-hidden="true">${Array.from("Well snapped!", (character, index) => `<span class="win-title-letter" style="--letter-index: ${index}">${safe(character)}</span>`).join("")}</span></h2>
      <p class="win-memory">“${safe(completed.name)}” is headed to the Trophy Swamp.</p>
      <div class="win-reward">
        <div class="win-score">${scoreReels(totalAward)}<img class="win-coin" src="./assets/snap-coin.png" alt="Snap Points" width="48" height="48"></div>
        <button class="button secondary guide-button win-stats-button" id="win-stats-button" type="button"><span class="toolbar-icon icon-leaderboard" aria-hidden="true"></span><span>Stats</span></button>
      </div>
      ${unlocks.length ? `<section class="win-unlocks" aria-labelledby="win-unlocks-title">
        <h3 id="win-unlocks-title">New achievements <span>${unlocks.length}</span></h3>
        <div class="win-achievements">${unlocks.map((a) => `<article class="achievement-card unlocked win-achievement">
          <div class="achievement-face win-achievement-details">
            <div class="achievement-icon" style="--achievement-icon: url('./assets/${safe(a.icon)}_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg')" aria-hidden="true"></div>
            <h4>${safe(a.name)}</h4>
          </div>
        </article>`).join("")}</div>
      </section>` : ""}
      <div class="dialog-actions win-actions">
        <button class="button primary" id="play-again" type="button">One more puzzle <span aria-hidden="true">→</span></button>
        <button class="button secondary" id="see-trophy" type="button">Visit the Trophy Swamp</button>
      </div>
      </div>`,
      "win-title",
    );
    $("#win-stats-button").onclick = showStats;
    $("#see-trophy").onclick = () => {
      closeModal();
      switchView("gallery");
    };
    $("#play-again").onclick = () => {
      closeModal();
      switchView("play");
    };
    $("#modal").scrollTop = 0;
    $(returning ? "#win-stats-button" : "#play-again").focus({ preventScroll: true });
  }
  function showStats() {
    modal(
      `<div class="win win-stats">
        <button class="button secondary guide-button win-stats-back" id="win-stats-back" type="button" aria-label="Back to Well snapped!"><span aria-hidden="true">←</span> Back</button>
        <h2 id="win-stats-title"><span class="toolbar-icon icon-leaderboard" aria-hidden="true"></span>Stats</h2>
        <p class="win-memory">${safe(completed.name)}</p>
        <dl class="win-stats-list">
          <div><dt>Time</dt><dd>${formatTime(completed.seconds)}</dd></div>
          <div><dt>Puzzle points${completed.twist ? " (Twist 2×)" : ""}</dt><dd>${award.base.toLocaleString()}</dd></div>
          <div><dt>Time bonus</dt><dd>+${award.bonus.toLocaleString()}</dd></div>
          ${completed.guideUses ? `<div><dt>Picture guide (${completed.guideUses} ${completed.guideUses === 1 ? "use" : "uses"})</dt><dd>−${award.guidePenalty.toLocaleString()}</dd></div>` : ""}
          ${achievementBonus ? `<div><dt>Achievement bonus</dt><dd>+${achievementBonus.toLocaleString()}</dd></div>` : ""}
          <div class="win-stats-total"><dt>Total</dt><dd>+${totalAward.toLocaleString()} <img class="achievement-coin" src="./assets/snap-coin.png" alt="Snap Points" width="20" height="20"></dd></div>
        </dl>
      </div>`,
      "win-stats-title",
    );
    $("#win-stats-back").onclick = () => showWin(true);
    $("#modal").scrollTop = 0;
    $("#win-stats-back").focus({ preventScroll: true });
  }
  showWin();
}
function updatePlayNavigation() {
  const canResume = Boolean(data.active && !game);
  $('[data-view="play"]').classList.toggle("can-resume", canResume);
  $("#play-nav-label").textContent = canResume ? "Continue puzzle" : "Puzzle Table";
  $("#play-nav-icon").hidden = !canResume;
}
function updateAll() {
  const progress = achievementProgress(data.records, data);
  $("#total-points").textContent = progress.totalPoints.toLocaleString();
  $("#gallery-count").textContent = data.records.length;
  updatePlayNavigation();
  renderGallery();
  renderAchievements(progress);
}
function renderGallery() {
  const count = data.records.length;
  $("#gallery-content").innerHTML = count
    ? [...data.records]
        .reverse()
        .map((r) => {
          const level = difficulty(r.difficulty);
          const date = new Date(r.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `<article class="trophy-card">
            ${r.thumbnail ? `<img class="trophy-image" src="${safe(r.thumbnail)}" alt="" loading="lazy" decoding="async">` : '<div class="archived-thumbnail" role="img" aria-label="Thumbnail archived to save space"><span aria-hidden="true">✦</span><small>A memory worth keeping</small></div>'}
            <strong class="trophy-points"><span>+${r.points.toLocaleString()}</span> <img class="trophy-coin" src="./assets/snap-coin.png" alt="Snap Points" width="20" height="20"></strong>
            <div class="trophy-body">
              <h2>${safe(r.name)}</h2>
              <time class="trophy-date" datetime="${safe(r.date)}"><span class="sr-only">Completed </span>${date}</time>
              <div class="trophy-meta">
                <span class="trophy-difficulty"><span class="sr-only">Difficulty: </span>${level.name}<span class="trophy-pieces"> · ${level.cols * level.rows} pieces${r.twist ? " · Twist 2×" : ""}</span></span>
                <span class="trophy-time"><span class="stat-icon icon-time" aria-hidden="true"></span><span class="sr-only">Time: </span>${formatTime(r.seconds)}</span>
              </div>
            </div>
          </article>`;
        })
        .join("") +
      `<div id="gallery-summary" class="gallery-summary">
        <img class="gallery-mascot" src="./assets/gator-collection-v2.png" width="112" height="112" alt="" aria-hidden="true" loading="lazy" decoding="async">
        <p><strong>${count.toLocaleString()}</strong> ${count === 1 ? "puzzle" : "puzzles"} finished. A lovely little collection, gator.</p>
      </div>`
    : `<div class="empty-state">
        <img class="gallery-mascot" src="./assets/gator-collection-v2.png" width="112" height="112" alt="" aria-hidden="true" decoding="async">
        <h2>Your first trophy is waiting.</h2>
        <p>Finish a puzzle and give your favorite memories a home.</p>
        <button class="button primary" id="empty-play">Head to the Puzzle Table →</button>
      </div>`;
  $("#gallery-content").classList.toggle("has-trophies", count > 0);
  scheduleGalleryScroll();
  $("#empty-play")?.addEventListener("click", () => switchView("play"));
}
const galleryGrid = $("#gallery-content"),
  reducedGalleryMotion = window.matchMedia("(prefers-reduced-motion: reduce)"),
  singleGalleryColumn = window.matchMedia("(max-width: 600px)");
let galleryFrame = 0;
function scheduleGalleryScroll() {
  if (galleryFrame) return;
  galleryFrame = requestAnimationFrame(() => {
    galleryFrame = 0;
    if (view !== "gallery") return;
    // Follow page scrolling until the untransformed grid's bottom is in view.
    const gridTop = galleryGrid.getBoundingClientRect().top + window.scrollY;
    const range = Math.max(
      0,
      gridTop + galleryGrid.offsetHeight - window.innerHeight,
    );
    const progress = range
      ? Math.min(1, Math.max(0, window.scrollY / range))
      : 0;
    const travel =
      reducedGalleryMotion.matches || singleGalleryColumn.matches
        ? 0
        : Math.min(96, range * 0.25);
    galleryGrid.style.setProperty("--gallery-shift", `${progress * travel}px`);
  });
}
window.addEventListener("scroll", scheduleGalleryScroll, { passive: true });
window.addEventListener("resize", scheduleGalleryScroll);
new ResizeObserver(scheduleGalleryScroll).observe(galleryGrid);
reducedGalleryMotion.addEventListener("change", scheduleGalleryScroll);
singleGalleryColumn.addEventListener("change", scheduleGalleryScroll);
function renderAchievements(progress = achievementProgress(data.records, data)) {
  const count = progress.earned.length;
  $("#achievement-count").textContent = count.toLocaleString();
  $("#achievement-progress").innerHTML =
    `<strong>${count.toLocaleString()}</strong> of ${ACHIEVEMENTS.length.toLocaleString()} achievements earned.`;
  $("#achievement-content").innerHTML = ACHIEVEMENTS.map((a) => {
    const unlocked = progress.earned.includes(a);
    const label = `${a.name} (${unlocked ? "earned" : "not earned"})`;
    return `<article class="achievement-card${unlocked ? " unlocked" : ""}">
      <button class="achievement-flip" type="button" aria-label="Show details for ${safe(label)}" aria-expanded="false" aria-controls="achievement-${a.id}-details" data-label="${safe(label)}"></button>
      <div class="achievement-card-inner">
        <div class="achievement-face achievement-front">
          <div class="achievement-icon" style="--achievement-icon: url('./assets/${safe(a.icon)}_24dp_FFFFFF_FILL0_wght400_GRAD0_opsz24.svg')" aria-hidden="true"></div>
          <h2>${safe(a.name)}</h2>
          <span class="achievement-status">${unlocked ? "✓ Earned" : '<span class="sr-only">Not earned yet</span>'}</span>
          <span class="achievement-cue" aria-hidden="true">View details <span>↻</span></span>
        </div>
        <div class="achievement-face achievement-back" id="achievement-${a.id}-details" aria-hidden="true">
          <p class="achievement-description">${safe(a.description)}</p>
          <span class="achievement-reward"><span class="achievement-points"><span>+${a.points.toLocaleString()}</span> <img class="achievement-coin" src="./assets/snap-coin.png" alt="Snap Points" width="20" height="20"></span> <span>${unlocked ? "earned" : "on unlock"}</span></span>
          <div class="achievement-attainment">
            <span class="achievement-detail-label">${unlocked ? "Complete" : "Progress"}</span>
            <p>${unlocked ? "✓ Earned" : safe(a.progress(data.records, data))}</p>
          </div>
          <span class="achievement-cue" aria-hidden="true">Back to card <span>↻</span></span>
        </div>
      </div>
    </article>`;
  }).join("");
}
function flipAchievement(button, flipped) {
  const card = button.closest(".achievement-card");
  card.classList.toggle("is-flipped", flipped);
  button.setAttribute("aria-expanded", String(flipped));
  button.setAttribute(
    "aria-label",
    `${flipped ? "Show front of" : "Show details for"} ${button.dataset.label}`,
  );
  card.querySelector(".achievement-front").setAttribute("aria-hidden", String(flipped));
  card.querySelector(".achievement-back").setAttribute("aria-hidden", String(!flipped));
}
$("#achievement-content").addEventListener("click", (event) => {
  const button = event.target.closest(".achievement-flip");
  if (button) flipAchievement(button, button.getAttribute("aria-expanded") !== "true");
});
$("#achievement-content").addEventListener("keydown", (event) => {
  const button = event.target.closest(".achievement-flip");
  if (button && event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
    event.preventDefault();
    flipAchievement(button, false);
  }
});
const PRACTICE_PHOTO = {
  image: "./assets/snapscape-beach.png", ratio: 4 / 3, ownPhoto: false, sampleId: "beach",
};
function practicePuzzle(twist) {
  return {
    ...PRACTICE_PHOTO, id: "practice-only", name: "A little practice sunshine",
    difficulty: "breezy", twist, seed: 104, seconds: 42, guideUses: 0,
    rotations: Array(24).fill(0), pieces: Array(24).fill(null),
    order: Array.from({ length: 24 }, (_, id) => id), resumed: false,
  };
}
function prepareHelpStep(step) {
  cancelDrag();
  setNavigationOpen(false);
  setOptionsOpen(false);
  setZoomOpen(false);
  if (step.id === "setup") {
    game = null;
    selected = null;
    paused = true;
    $("#setup").hidden = false;
    $("#game").hidden = true;
    return;
  }
  game = practicePuzzle(helpSession.twist);
  openGame();
  if (step.id === "snapping") {
    const { cw, ch } = geometry(game);
    game.pieces[0] = { id: 0, group: 0, x: cw, y: ch * 1.5, locked: false };
    game.pieces[1] = { id: 1, group: 1, x: cw * 2.5, y: ch * 1.5, locked: false };
    renderGame();
  } else if (step.id === "rotation") {
    const { cw, ch } = geometry(game);
    game.pieces[7] = { id: 7, group: 7, x: cw * 2, y: ch * 1.5, locked: false };
    game.rotations[7] = 1;
    selected = 7;
    renderGame();
  } else if (step.id === "view") {
    setPictureGuide(true);
    setZoomOpen(true);
  } else if (step.id === "navigation") {
    setNavigationOpen(true);
  } else if (step.id === "backup") {
    setOptionsOpen(true);
  }
}
function demonstrateSnap(action) {
  // Reset the two neighbors so either demonstration can be replayed in any order.
  const { cw, ch } = geometry(game);
  cancelDrag();
  game.pieces[0] = { id: 0, group: 0, x: cw, y: ch * 1.5, locked: false };
  game.pieces[1] = { id: 1, group: 1, x: cw * 2, y: ch * 1.5, locked: false };
  game.rotations[0] = game.rotations[1] = 0;
  placeGroup(game, 1);
  if (action === "lock") {
    positionPiece(0, 0, 0);
    placeGroup(game, 0);
  }
  selected = null;
  renderGame();
  announce(action === "lock" ? "Both pieces are upright and home. They are locked in the frame." : "Matching neighbors snapped together. You can move them as a group.");
}
function finishHelpTour() {
  const previous = helpSession;
  if (!previous) return;
  cancelDrag();
  helpTour = null;
  helpSession = null;
  game = previous.game;
  gameImageUrl = previous.imageUrl;
  paused = previous.paused || document.hidden;
  elapsed = previous.elapsed;
  runStart = performance.now();
  selected = previous.selected;
  showGuide = previous.showGuide;
  onlyEdges = previous.onlyEdges;
  keyboardCell = previous.keyboardCell;
  panMode = previous.panMode;
  zoomLevel = previous.zoomLevel;
  view = previous.view;
  if (previous.photo) {
    showPhoto(previous.photo);
    selectedPhoto = previous.photo;
    renderSetupTitle();
  } else resetPhoto();
  $("#game").hidden = !game;
  $("#setup").hidden = Boolean(game);
  setNavigationOpen(false);
  setOptionsOpen(false);
  setZoomOpen(false);
  $("#pan-button").setAttribute("aria-pressed", String(panMode));
  $("#puzzle-board").classList.toggle("pan-mode", panMode);
  $("#edges-button").setAttribute("aria-pressed", String(onlyEdges));
  $("#reference-button").setAttribute("aria-pressed", String(showGuide));
  updateZoomLabel();
  switchView(view, { showSetup: !game });
  if (game) {
    $("#game-name").textContent = game.name;
    $("#pause-cover").hidden = !paused;
    updatePauseButton();
    renderGame();
    tick();
    $("#table-scroll").scrollTo(previous.tableX, previous.tableY);
  }
  window.scrollTo({ left: previous.scrollX, top: previous.scrollY, behavior: "instant" });
  $("#help-button").focus({ preventScroll: true });
  announce("Tour finished. You’re back where you started.");
}
function startHelpTour() {
  if (helpSession) return;
  if (photoLoading) {
    toast("Your photo is still getting ready. Try How to play in a moment.");
    return;
  }
  const wasPaused = paused;
  cancelDrag();
  if (game) pause();
  helpSession = {
    game, imageUrl: gameImageUrl, paused: wasPaused, elapsed, selected,
    showGuide, onlyEdges, keyboardCell, panMode, zoomLevel, view,
    photo: selectedPhoto, scrollX: window.scrollX, scrollY: window.scrollY,
    tableX: $("#table-scroll").scrollLeft, tableY: $("#table-scroll").scrollTop,
    twist: (game || (view !== "play" ? data.active : null))?.twist ??
      ($("#random-rotation").getAttribute("aria-pressed") === "true"),
  };
  ++importToken;
  game = null;
  showPhoto(PRACTICE_PHOTO);
  switchView("play", { showSetup: true });
  try {
    helpTour = createHelpTour({
      steps: helpSteps(helpSession.twist),
      onStep: prepareHelpStep,
      onAction: demonstrateSnap,
      onClose: finishHelpTour,
      onLayout: sizeBoard,
      onEscape: () => {
        if (selected === null && !drag) return false;
        cancelDrag();
        selected = null;
        if (game) renderGame();
        announce("Practice selection put down. Press Escape again to close the tour.");
        return true;
      },
    });
  } catch (error) {
    finishHelpTour();
    throw error;
  }
}
$("#help-button").addEventListener("click", startHelpTour);
const optionsToggle = $("#options-toggle"),
  optionsPanel = $("#options-panel"),
  footerOptions = $("#footer-options");
function setOptionsOpen(open, restoreFocus = false) {
  optionsToggle.setAttribute("aria-expanded", String(open));
  optionsPanel.hidden = !open;
  if (restoreFocus) optionsToggle.focus({ preventScroll: true });
}
optionsToggle.addEventListener("click", () => {
  setOptionsOpen(optionsPanel.hidden);
});
footerOptions.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !optionsPanel.hidden) {
    event.preventDefault();
    setOptionsOpen(false, true);
  }
});
document.addEventListener("click", (event) => {
  if (helpSession) return;
  if (!footerOptions.contains(event.target)) setOptionsOpen(false);
});
document.addEventListener("focusin", (event) => {
  if (helpSession) return;
  if (!footerOptions.contains(event.target)) setOptionsOpen(false);
});
const aboutDialog = $("#about-dialog");
$("#about-button").addEventListener("click", () => {
  setOptionsOpen(false);
  if (game) pause();
  aboutDialog.showModal();
  aboutDialog.scrollTop = 0;
});
$("#about-close").addEventListener("click", () => aboutDialog.close());
$("#about-done").addEventListener("click", () => aboutDialog.close());
aboutDialog.addEventListener("click", (event) => {
  if (event.target !== aboutDialog) return;
  const rect = aboutDialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    aboutDialog.close();
});
$("#export-button").addEventListener("click", () => {
  setOptionsOpen(false, true);
  captureTime();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `snapscape-memories-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
  toast("Your backup includes your Trophy Swamp, points, and saved puzzle.");
});
$("#import-button").addEventListener("click", () => {
  setOptionsOpen(false, true);
  $("#import-input").click();
});
$("#import-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const token = ++importToken;
  e.target.value = "";
  if (!file) return;
  if (file.size > 6000000) {
    toast("That backup is too large. Choose a Snapscape backup under 6 MB.");
    return;
  }
  try {
    const imported = validateData(JSON.parse(await file.text()));
    if (token !== importToken) return;
    if (imported.active) await loadImage(imported.active.image);
    if (token !== importToken) return;
    if (game) pause();
    if (token !== importToken) return;
    modal(
      `<p class="eyebrow">WELCOME BACK, MEMORIES</p><h2>Restore this backup?</h2><p>This backup has ${imported.records.length} finished puzzles${imported.active ? " and an unfinished puzzle" : ""}. Restoring will replace the memories currently saved in this browser. Back up your current memories first if you want to keep them.</p><div class="dialog-actions"><button class="button primary" id="confirm-import">Restore backup</button><button class="button secondary" id="cancel-import">Cancel</button></div>`,
    );
    $("#cancel-import").onclick = closeModal;
    $("#confirm-import").onclick = () => {
      if (token !== importToken) return;
      try {
        imported.revision = randomId();
        localStorage.setItem(KEY, JSON.stringify(imported));
        data = imported;
        storageBlocked = false;
        game = null;
        paused = true;
        drag = null;
        $("#storage-warning").hidden = true;
        $("#game").hidden = true;
        $("#setup").hidden = false;
        closeModal();
        switchView("gallery");
        toast("Welcome back! Your memories have been restored.");
      } catch {
        toast(
          "There is not enough browser space to restore this backup. Your current memories have been kept.",
        );
      }
    };
  } catch (error) {
    if (token !== importToken) return;
    toast(
      error instanceof SyntaxError
        ? "That file is not a valid Snapscape backup."
        : error.message,
    );
  }
});
function resetBrowserProgress() {
  helpTour?.close();
  data = emptyData();
  game = null;
  paused = true;
  selected = null;
  elapsed = 0;
  runStart = 0;
  cancelDrag();
  ++importToken;
  resetPhoto();
  if (gameImageUrl) URL.revokeObjectURL(gameImageUrl);
  gameImageUrl = null;
  $("#puzzle-board").innerHTML = "";
  $("#piece-tray").innerHTML = "";
  $("#game-name").textContent = "";
  $("#game").hidden = true;
  $("#setup").hidden = false;
  $("#import-input").value = "";
  storageBlocked = false;
  $("#storage-warning").hidden = true;
  setOptionsOpen(false);
  closeModal();
  $("#modal-content").innerHTML = "";
  switchView("play", { showSetup: true });
  $("#main").focus({ preventScroll: true });
}
$("#erase-button").addEventListener("click", () => {
  setOptionsOpen(false, true);
  ++importToken;
  if (game) pause();
  modal(
    '<h2>Erase Snapscape data?</h2><p>This permanently deletes your saved puzzle, Trophy Swamp, Snap Points, achievements, and saved photos from Snapscape in this browser.</p><p>Back up your memories first if you want to keep them. Your downloaded backups and original photo files will stay safe.</p><p id="erase-error" role="alert" hidden></p><div class="dialog-actions"><button class="button secondary" id="cancel-erase" type="button">Cancel</button><button class="button danger" id="confirm-erase" type="button">Erase Snapscape data</button></div>',
  );
  $("#cancel-erase").onclick = closeModal;
  $("#confirm-erase").onclick = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      $("#erase-error").textContent =
        "This browser could not erase your Snapscape data. Your memories have been kept. Please try again.";
      $("#erase-error").hidden = false;
      return;
    }
    resetBrowserProgress();
    toast("Snapscape data has been erased from this browser.");
  };
  $("#cancel-erase").focus();
});
if (document.modelContext?.registerTool) {
  try {
    const controller = new AbortController();
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: "read_snapscape_progress",
          description:
            "Read saved Snapscape points, completed puzzle count, and active puzzle progress.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            if (!input || Object.keys(input).length)
              throw new Error("Expected an empty object.");
            return {
              points: achievementProgress(data.records, data).totalPoints,
              completed: data.records.length,
              active: data.active
                ? {
                    name: data.active.name,
                    pieces: data.active.pieces.length,
                    placed: data.active.pieces.filter((p) => p?.locked).length,
                  }
                : null,
            };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    window.addEventListener("pagehide", () => controller.abort(), {
      once: true,
    });
  } catch {}
}
updateAll();

// Fill the available workspace and fit the picture inside it without stretching.
// Keep both SVG dimensions defined so Fit and zoom preserve the photo's shape.
function sizeBoard() {
  if (!game || $("#game").hidden) return;
  const table = $("#table-scroll");
  const layout = $(".game-layout");
  const area = $(".table-area");
  const stacked = window.innerWidth <= 900;
  const { w, h } = geometry(game);
  const availableWidth = area.clientWidth;
  // On narrow screens, reserve the tools and tray below the board, plus both gaps.
  const spaceBelow = stacked
    ? $(".tray-panel").getBoundingClientRect().height +
      $(".table-tools").getBoundingClientRect().height +
      parseFloat(getComputedStyle(layout).rowGap) * 2 +
      12
    : 12;
  const { tableWidth, tableHeight, width, height, scale } = boardViewport({
    viewportHeight: (window.visualViewport?.height || window.innerHeight) -
      (helpSession ? $(".tour-card").getBoundingClientRect().height + 28 : 0),
    tableTop: table.getBoundingClientRect().top + window.scrollY,
    spaceBelow,
    availableWidth: Math.max(1, availableWidth),
    frameRatio: (w + BOARD_MARGIN * 2) / (h + BOARD_MARGIN * 2),
    zoom: zoomLevel,
  });
  layout.style.setProperty("--table-width", `${tableWidth}px`);
  layout.style.setProperty("--table-height", `${tableHeight}px`);
  if (!stacked) {
    // Align the tray with the fitted picture, keeping room for controls and a
    // usable tray on panoramic pictures. Zoom must not resize the sidebar.
    const controlsHeight =
      $(".game-info").getBoundingClientRect().height +
      $(".table-tools").getBoundingClientRect().height +
      parseFloat(getComputedStyle($(".game-sidebar")).rowGap) * 2;
    const sidebarHeight = Math.min(tableHeight, Math.max(height, controlsHeight + 120));
    layout.style.setProperty("--sidebar-height", `${sidebarHeight}px`);
  }
  $("#puzzle-board").style.width = `${width * scale}px`;
  $("#puzzle-board").style.height = `${height * scale}px`;
  positionRotationControls();
}
const boardResizeObserver = new ResizeObserver(sizeBoard);
boardResizeObserver.observe($(".game-layout"));
boardResizeObserver.observe($(".game-heading"));
window.addEventListener("resize", sizeBoard);
window.visualViewport?.addEventListener("resize", sizeBoard);
