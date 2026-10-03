export const DIFFICULTIES = [
  { id: "breezy", name: "Breezy", cols: 6, rows: 4, points: 10, target: 240 },
  { id: "snappy", name: "Snappy", cols: 8, rows: 6, points: 25, target: 600 },
  { id: "bold", name: "Bold", cols: 12, rows: 8, points: 60, target: 1200 },
  {
    id: "legend",
    name: "Legend",
    cols: 16,
    rows: 12,
    points: 140,
    target: 2400,
  },
];
export const difficulty = (id) => DIFFICULTIES.find((d) => d.id === id);
export const SAMPLE_SNAPSCAPES = [
  "beach",
  "bike",
  "bookstore",
  "diner",
  "fishing",
  "football",
  "interstate-95",
  "kajak",
  "mall",
  "miami",
  "oranges",
  "st-augustine",
];
export const BOARD_MARGIN = 8;
export function boardViewport({
  viewportHeight,
  tableTop,
  mobile = false,
  spaceBelow = mobile ? 210 : 54,
  availableWidth = Infinity,
  frameRatio = 1,
  zoom = 1,
}) {
  const availableHeight = Math.max(240, viewportHeight - tableTop - spaceBelow);
  const width = Math.min(availableWidth, availableHeight * frameRatio);
  return {
    tableWidth: Number.isFinite(availableWidth) ? availableWidth : width,
    tableHeight: availableHeight,
    width,
    height: width / frameRatio,
    availableHeight,
    scale: Number.isFinite(zoom) && zoom >= 0.5 && zoom <= 2 ? zoom : 1,
  };
}
export const pictureGuideCost = (id, twist = false) =>
  Math.round(difficulty(id).points / 10) * (twist ? 2 : 1);
export function score(id, seconds, guideUses = 0, twist = false) {
  const d = difficulty(id);
  const multiplier = twist ? 2 : 1;
  const base = d.points * multiplier;
  const bonus = Math.round(
    d.points * 0.5 * Math.max(0, 1 - seconds / (d.target * 2)),
  ) * multiplier;
  const gross = base + bonus;
  const guidePenalty = guideUses >= 10
    ? gross
    : Math.min(gross, pictureGuideCost(id, twist) * guideUses);
  return {
    base,
    bonus,
    guidePenalty,
    total: gross - guidePenalty,
  };
}
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return s < 3600
    ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function randomId() {
  return (
    globalThis.crypto.randomUUID?.() ||
    Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function geometry(game) {
  const d = difficulty(game.difficulty);
  return {
    cols: d.cols,
    rows: d.rows,
    w: 900,
    h: 900 / game.ratio,
    cw: 900 / d.cols,
    ch: 900 / game.ratio / d.rows,
  };
}
export function target(game, id) {
  const { cols, cw, ch } = geometry(game);
  return { x: (id % cols) * cw, y: Math.floor(id / cols) * ch };
}
// Rotations are quarter turns, kept separately so tray pieces keep their angle.
export const pieceRotation = (game, id) => game.twist ? game.rotations[id] : 0;
export function rotateVector(x, y, turns) {
  switch ((turns % 4 + 4) % 4) {
    case 1: return { x: -y, y: x };
    case 2: return { x: -x, y: -y };
    case 3: return { x: y, y: -x };
    default: return { x, y };
  }
}
export function pieceBounds(game, id) {
  const { cw, ch } = geometry(game),
    sideways = pieceRotation(game, id) % 2,
    width = sideways ? ch : cw,
    height = sideways ? cw : ch;
  return { x: (cw - width) / 2, y: (ch - height) / 2, width, height };
}
// An oversized rotated group remains centered and reachable; it can be turned
// upright again. This matters for very wide or tall photos.
export function constrainGroup(game, id) {
  const piece = game.pieces[id];
  if (!piece || piece.locked) return;
  const members = game.pieces.filter((p) => p && p.group === piece.group),
    { w, h } = geometry(game),
    boxes = members.map((p) => {
      const box = pieceBounds(game, p.id);
      return { x: p.x + box.x, y: p.y + box.y, width: box.width, height: box.height };
    }),
    left = Math.min(...boxes.map((b) => b.x)),
    right = Math.max(...boxes.map((b) => b.x + b.width)),
    top = Math.min(...boxes.map((b) => b.y)),
    bottom = Math.max(...boxes.map((b) => b.y + b.height));
  const shift = (min, max, size) => max - min > size + 2 * BOARD_MARGIN
    ? (size - min - max) / 2
    : Math.max(-BOARD_MARGIN - min, Math.min(size + BOARD_MARGIN - max, 0));
  const dx = shift(left, right, w), dy = shift(top, bottom, h);
  members.forEach((p) => { p.x += dx; p.y += dy; });
}
export function rotateGroup(game, id, turns = 1) {
  if (!game.twist || game.pieces[id]?.locked) return 0;
  const quarterTurns = (turns % 4 + 4) % 4;
  const piece = game.pieces[id],
    members = piece
      ? game.pieces.filter((p) => p && p.group === piece.group)
      : [];
  if (!piece) {
    game.rotations[id] = (game.rotations[id] + quarterTurns) % 4;
    return 1;
  }
  const pivot = { x: piece.x, y: piece.y };
  for (const p of members) {
    const offset = rotateVector(p.x - pivot.x, p.y - pivot.y, quarterTurns);
    p.x = pivot.x + offset.x;
    p.y = pivot.y + offset.y;
    game.rotations[p.id] = (game.rotations[p.id] + quarterTurns) % 4;
  }
  constrainGroup(game, id);
  return members.length;
}
export function edges(game, id) {
  const { cols, rows } = geometry(game),
    r = Math.floor(id / cols),
    c = id % cols;
  const hash = (n) =>
    (Math.imul(n + game.seed, 2654435761) >>> 0) % 2 ? 1 : -1;
  return [
    r === 0 ? 0 : -hash((r - 1) * cols + c),
    c === cols - 1 ? 0 : hash(1000 + r * cols + c),
    r === rows - 1 ? 0 : hash(r * cols + c),
    c === 0 ? 0 : -hash(1000 + r * cols + c - 1),
  ];
}
// Edges are drawn clockwise. Adjacent pieces share the same curve, reversed.
export function piecePath(game, id) {
  const { cw, ch } = geometry(game),
    tab = Math.min(cw, ch) * 0.22,
    e = edges(game, id);
  let p = "M 0 0";
  function side(x, y, dx, dy, sign) {
    const nx = dy / Math.hypot(dx, dy),
      ny = -dx / Math.hypot(dx, dy);
    const pt = (t, n = 0) => `${x + dx * t + nx * n},${y + dy * t + ny * n}`;
    if (!sign) {
      p += ` L ${pt(1)}`;
      return;
    }
    const t = tab * sign;
    p += ` L ${pt(0.34)} C ${pt(0.45)},${pt(0.42, -t * 0.12)},${pt(0.42, t * 0.25)} C ${pt(0.28, t * 1.2)},${pt(0.72, t * 1.2)},${pt(0.58, t * 0.25)} C ${pt(0.58, -t * 0.12)},${pt(0.55)},${pt(0.66)} L ${pt(1)}`;
  }
  side(0, 0, cw, 0, e[0]);
  side(cw, 0, 0, ch, e[1]);
  side(cw, ch, -cw, 0, e[2]);
  side(0, ch, 0, -ch, e[3]);
  return p + " Z";
}
export function placeGroup(game, id) {
  const { cw, ch, cols } = geometry(game),
    piece = game.pieces[id];
  if (!piece || piece.locked) return 0;
  let members = game.pieces.filter((p) => p && p.group === piece.group);
  const tolerance = Math.min(cw, ch) * 0.27;
  const move = (dx, dy) =>
    members.forEach((p) => {
      p.x += dx;
      p.y += dy;
    });
  const anchor = members.find((p) => {
    const t = target(game, p.id);
    return pieceRotation(game, p.id) === 0 && Math.hypot(p.x - t.x, p.y - t.y) < tolerance;
  });
  if (anchor) {
    const t = target(game, anchor.id);
    move(t.x - anchor.x, t.y - anchor.y);
    members.forEach((p) => (p.locked = true));
  } else {
    let joined = true;
    while (joined) {
      joined = false;
      outer: for (const a of members) {
        for (const b of game.pieces) {
          if (!b || b.group === a.group || pieceRotation(game, a.id) !== pieceRotation(game, b.id)) continue;
          const ac = a.id % cols,
            bc = b.id % cols,
            ar = Math.floor(a.id / cols),
            br = Math.floor(b.id / cols);
          if (Math.abs(ac - bc) + Math.abs(ar - br) !== 1) continue;
          const ta = target(game, a.id),
            tb = target(game, b.id),
            offset = rotateVector(ta.x - tb.x, ta.y - tb.y, pieceRotation(game, a.id)),
            dx = b.x + offset.x - a.x,
            dy = b.y + offset.y - a.y;
          if (Math.hypot(dx, dy) >= tolerance) continue;
          move(dx, dy);
          const oldGroup = piece.group,
            newGroup = b.group;
          members.forEach((p) => (p.group = newGroup));
          members = game.pieces.filter((p) => p && p.group === newGroup);
          if (b.locked) {
            members.forEach((p) => {
              const t = target(game, p.id);
              p.x = t.x;
              p.y = t.y;
              p.locked = true;
            });
            return members.length;
          }
          joined = oldGroup !== newGroup;
          break outer;
        }
      }
    }
  }
  if (game.twist) constrainGroup(game, id);
  return members.filter((p) => p.locked).length;
}
export function returnGroupToTray(game, id) {
  const piece = game.pieces[id];
  if (!piece || piece.locked) return 0;
  const members = game.pieces.filter((p) => p && p.group === piece.group);
  if (members.some((p) => p.locked)) return 0;
  for (const member of members) game.pieces[member.id] = null;
  return members.length;
}
const completedSampleCount = (records) =>
  new Set(
    records
      .filter((r) => !r.ownPhoto && SAMPLE_SNAPSCAPES.includes(r.sampleId))
      .map((r) => r.sampleId),
  ).size;
export const collectedPoints = (records) =>
  records.reduce((sum, record) => sum + Math.round(record.points), 0);
const completedDifficultyCount = (records) =>
  DIFFICULTIES.filter((d) => records.some((r) => r.difficulty === d.id)).length;
const usedPictureGuide = (records, state = {}) =>
  state.guideUsed === true || state.active?.guideUses > 0 || records.some((r) => r.guideUses > 0);
export const ACHIEVEMENTS = [
  {
    id: "first",
    points: 10,
    name: "First Chomp",
    icon: "pediatrics",
    description: "Finish your very first puzzle.",
    test: (r) => r.length >= 1,
    progress: (r) => `${Math.min(1, r.length)} / 1 puzzle`,
  },
  {
    id: "guide",
    points: 5,
    name: "A Little Guidance",
    icon: "support",
    description: "Use Picture guide for the first time.",
    test: usedPictureGuide,
    progress: () => "Take your first peek with Picture guide.",
  },
  {
    id: "later",
    points: 10,
    name: "See You Later, Alligator",
    icon: "waving_hand",
    description: "Return to a saved puzzle and finish it.",
    test: (r) => r.some((x) => x.resumed),
    progress: () => "A little break counts, too.",
  },
  {
    id: "photo",
    points: 15,
    name: "Picture Perfect",
    icon: "camera",
    description: "Complete a puzzle made from your own photo.",
    test: (r) => r.some((x) => x.ownPhoto),
    progress: () => "Make a memory into a masterpiece.",
  },
  {
    id: "quick",
    points: 20,
    name: "Quick on the Chomp",
    icon: "bolt",
    description: "Finish a puzzle within its pace target.",
    test: (r) => r.some((x) => x.seconds <= difficulty(x.difficulty).target),
    progress: () => "Targets: 4, 10, 20, or 40 minutes.",
  },
  {
    id: "scholar",
    points: 25,
    name: "Swamp Scholar",
    icon: "school",
    description: "Piece together five happy memories.",
    test: (r) => r.length >= 5,
    progress: (r) => `${Math.min(5, r.length)} / 5 puzzles`,
  },
  {
    id: "ten",
    points: 50,
    name: "A Lovely Collection",
    icon: "auto_stories",
    description: "Fill the Trophy Swamp with ten finishes.",
    test: (r) => r.length >= 10,
    progress: (r) => `${Math.min(10, r.length)} / 10 puzzles`,
  },
  {
    id: "twenty-five",
    points: 100,
    name: "Swamp Regular",
    icon: "bookmark_star",
    description: "Finish 25 puzzles.",
    test: (r) => r.length >= 25,
    progress: (r) => `${Math.min(25, r.length)} / 25 puzzles`,
  },
  {
    id: "fifty",
    points: 200,
    name: "Chomp Champion",
    icon: "trophy",
    description: "Finish 50 puzzles.",
    test: (r) => r.length >= 50,
    progress: (r) => `${Math.min(50, r.length)} / 50 puzzles`,
  },
  {
    id: "points",
    points: 25,
    pointTarget: 500,
    name: "Orange & Blue Ribbon",
    icon: "social_leaderboard",
    description: "Collect 500 Snap Points.",
    test: (r, state) => achievementProgress(r, state).totalPoints >= 500,
    progress: (r, state) =>
      `${Math.min(500, achievementProgress(r, state).totalPoints).toLocaleString()} / 500 points`,
  },
  {
    id: "points-5000",
    points: 50,
    pointTarget: 1000,
    name: "Golden Gator",
    icon: "star",
    description: "Collect 1,000 Snap Points.",
    test: (r, state) => achievementProgress(r, state).totalPoints >= 1000,
    progress: (r, state) => `${Math.min(1000, achievementProgress(r, state).totalPoints).toLocaleString()} / ${(1000).toLocaleString()} points`,
  },
  {
    id: "legend",
    points: 50,
    name: "Swamp Legend",
    icon: "crown",
    description: "Bring all 192 pieces home on Legend.",
    test: (r) => r.some((x) => x.difficulty === "legend"),
    progress: () => "Your biggest challenge awaits.",
  },
  {
    id: "all-difficulties",
    points: 75,
    name: "Every Kind of Chomp",
    icon: "done_all",
    description: "Finish at least one puzzle on every difficulty.",
    test: (r) => completedDifficultyCount(r) === DIFFICULTIES.length,
    progress: (r) => `${completedDifficultyCount(r)} / ${DIFFICULTIES.length} difficulties`,
  },
  {
    id: "explorer",
    points: 100,
    name: "Sunshine Explorer",
    icon: "explore",
    description: `Finish all ${SAMPLE_SNAPSCAPES.length} included pictures on any difficulty.`,
    test: (r) => completedSampleCount(r) === SAMPLE_SNAPSCAPES.length,
    progress: (r) => `${completedSampleCount(r)} / ${SAMPLE_SNAPSCAPES.length} pictures`,
  },
];
export function achievementProgress(records, state = {}) {
  // Derive each reward once from saved evidence, including older saves.
  const earned = new Set(
    ACHIEVEMENTS.filter((a) => !a.pointTarget && a.test(records, state)),
  );
  const puzzlePoints = collectedPoints(records);
  let achievementPoints = [...earned].reduce((sum, a) => sum + a.points, 0);
  // Bonuses may unlock point milestones, but cannot fund their own unlock.
  let changed;
  do {
    changed = false;
    for (const a of ACHIEVEMENTS) {
      if (a.pointTarget && !earned.has(a) && puzzlePoints + achievementPoints >= a.pointTarget) {
        earned.add(a);
        achievementPoints += a.points;
        changed = true;
      }
    }
  } while (changed);
  return {
    earned: ACHIEVEMENTS.filter((a) => earned.has(a)),
    puzzlePoints,
    achievementPoints,
    totalPoints: puzzlePoints + achievementPoints,
  };
}
const finite = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const image = (s) =>
  typeof s === "string" &&
  s.length < 1500000 &&
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
const identifier = (s) =>
  typeof s === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(s);
const validSample = (record) =>
  record.sampleId == null ||
  (SAMPLE_SNAPSCAPES.includes(record.sampleId) && record.ownPhoto !== true);
export function validateData(value) {
  if (
    !value ||
    value.version !== 1 ||
    (value.guideUsed !== undefined && typeof value.guideUsed !== "boolean") ||
    !Array.isArray(value.records) ||
    value.records.length > 10000
  )
    throw new Error("This is not a supported Snapscape backup.");
  const records = value.records.map((r) => {
    const guideUses = r.guideUses === undefined ? 0 : r.guideUses;
    if (
      !identifier(r.id) ||
      typeof r.name !== "string" ||
      r.name.length > 60 ||
      !difficulty(r.difficulty) ||
      (r.twist !== undefined && typeof r.twist !== "boolean") ||
      !finite(r.seconds, 0, 315360000) ||
      !Number.isSafeInteger(guideUses) ||
      guideUses < 0 ||
      !validSample(r) ||
      !Number.isFinite(Date.parse(r.date)) ||
      (r.thumbnail && !image(r.thumbnail))
    )
      throw new Error("A puzzle record in this backup is damaged.");
    return {
      id: r.id,
      name: r.name,
      difficulty: r.difficulty,
      seconds: r.seconds,
      points: score(r.difficulty, r.seconds, guideUses, r.twist).total,
      twist: r.twist === true,
      guideUses,
      date: r.date,
      thumbnail: r.thumbnail || null,
      resumed: r.resumed === true,
      ownPhoto: r.ownPhoto === true,
      sampleId: r.sampleId ?? null,
    };
  });
  if (new Set(records.map((r) => r.id)).size !== records.length)
    throw new Error("This backup contains duplicate puzzle records.");
  let active = null;
  const savedLevel = difficulty(value.active?.difficulty);
  // A different part count cannot resume on the current grid; keep the trophies.
  const gridChanged = savedLevel && Array.isArray(value.active.pieces) &&
    value.active.pieces.length !== savedLevel.cols * savedLevel.rows;
  if (value.active && !gridChanged) {
    const a = value.active,
      d = savedLevel,
      guideUses = a.guideUses === undefined ? 0 : a.guideUses;
    if (
      !d ||
      !identifier(a.id) ||
      typeof a.name !== "string" ||
      a.name.length > 60 ||
      !finite(a.ratio, 0.15, 7) ||
      !finite(a.seconds, 0, 315360000) ||
      !Number.isSafeInteger(guideUses) ||
      guideUses < 0 ||
      !validSample(a) ||
      (a.twist !== undefined && typeof a.twist !== "boolean") ||
      !Number.isInteger(a.seed) ||
      !image(a.image) ||
      !Array.isArray(a.pieces) ||
      a.pieces.length !== d.cols * d.rows ||
      !Array.isArray(a.order) ||
      a.order.length !== a.pieces.length ||
      new Set(a.order).size !== a.pieces.length ||
      a.order.some(
        (n) => !Number.isInteger(n) || n < 0 || n >= a.pieces.length,
      ) ||
      records.some((r) => r.id === a.id)
    )
      throw new Error("The saved puzzle in this backup is damaged.");
    const rotations = a.rotations === undefined
      ? (a.twist ? null : Array(a.pieces.length).fill(0)) : a.rotations;
    if (
      !Array.isArray(rotations) || rotations.length !== a.pieces.length ||
      rotations.some((turns) => !Number.isInteger(turns) || turns < 0 || turns > 3 || (!a.twist && turns !== 0))
    )
      throw new Error("The saved piece rotations in this backup are damaged.");
    active = {
      id: a.id,
      name: a.name,
      difficulty: a.difficulty,
      ratio: a.ratio,
      seconds: a.seconds,
      guideUses,
      twist: a.twist === true,
      rotations: [...rotations],
      seed: a.seed,
      image: a.image,
      order: a.order,
      resumed: a.resumed === true,
      ownPhoto: a.ownPhoto === true,
      sampleId: a.sampleId ?? null,
      pieces: a.pieces.map((p, i) => {
        if (p === null) return null;
        if (
          p.id !== i ||
          !finite(p.x, -3000, 9000) ||
          !finite(p.y, -3000, 9000) ||
          !Number.isInteger(p.group) ||
          p.group < 0 ||
          p.group >= a.pieces.length ||
          typeof p.locked !== "boolean"
        )
          throw new Error("A puzzle piece in this backup is damaged.");
        return { id: i, x: p.x, y: p.y, group: p.group, locked: p.locked };
      }),
    };
    const groups = new Map();
    const bounds = geometry(active);
    for (const p of active.pieces) {
      if (!p) continue;
      const home = target(active, p.id),
        rotation = pieceRotation(active, p.id),
        expected = rotateVector(home.x, home.y, rotation);
      const offset = {
        x: p.x - expected.x,
        y: p.y - expected.y,
        locked: p.locked,
        rotation,
      };
      const group = groups.get(p.group);
      if (
        group &&
        (Math.abs(group.x - offset.x) > 0.01 ||
          Math.abs(group.y - offset.y) > 0.01 ||
          group.locked !== p.locked || group.rotation !== rotation)
      )
        throw new Error(
          "A puzzle group in this backup has inconsistent positions.",
        );
      const box = pieceBounds(active, p.id);
      groups.set(p.group, {
        ...offset,
        left: Math.min(group?.left ?? Infinity, p.x + box.x),
        right: Math.max(group?.right ?? -Infinity, p.x + box.x + box.width),
        top: Math.min(group?.top ?? Infinity, p.y + box.y),
        bottom: Math.max(group?.bottom ?? -Infinity, p.y + box.y + box.height),
      });
      if (
        !active.twist && (
          p.x < -85 ||
          p.x > bounds.w - bounds.cw + 85 ||
          p.y < -85 ||
          p.y > bounds.h - bounds.ch + 85
        )
      )
        throw new Error("A puzzle piece is outside the table.");
      if (p?.locked) {
        const t = target(active, p.id);
        if (rotation !== 0 || Math.abs(p.x - t.x) > 0.01 || Math.abs(p.y - t.y) > 0.01)
          throw new Error("A placed piece has an invalid position.");
      }
    }
    if (active.twist) {
      const withinTable = (min, max, size) => max - min > size + 2 * BOARD_MARGIN
        ? Math.abs((min + max) / 2 - size / 2) <= 85
        : min >= -85 && max <= size + 85;
      for (const group of groups.values()) {
        if (!withinTable(group.left, group.right, bounds.w) || !withinTable(group.top, group.bottom, bounds.h))
          throw new Error("A puzzle group is outside the table.");
      }
    }
  }
  return {
    version: 1,
    records,
    active,
    guideUsed: usedPictureGuide(records, { guideUsed: value.guideUsed, active }),
    revision: typeof value.revision === "string" ? value.revision : "",
  };
}
