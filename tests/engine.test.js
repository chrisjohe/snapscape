import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTIES,
  pictureGuideCost,
  score,
  collectedPoints,
  achievementProgress,
  geometry,
  target,
  edges,
  piecePath,
  placeGroup,
  returnGroupToTray,
  pieceRotation,
  pieceBounds,
  rotateVector,
  rotateGroup,
  constrainGroup,
  validateData,
  ACHIEVEMENTS,
  SAMPLE_SNAPSCAPES,
} from "../engine.js";
function game(id = "breezy", ratio = 1.5) {
  const d = DIFFICULTIES.find((d) => d.id === id);
  return {
    id: "test-puzzle-123",
    name: "Test",
    difficulty: id,
    ratio,
    seed: 123,
    seconds: 0,
    image: "data:image/jpeg;base64,AAAA",
    order: Array.from({ length: d.cols * d.rows }, (_, i) => i),
    pieces: Array(d.cols * d.rows).fill(null),
    ownPhoto: false,
    resumed: false,
  };
}
test("every difficulty has complementary neighbors and flat outer edges", () => {
  for (const d of DIFFICULTIES) {
    const g = game(d.id);
    for (let id = 0; id < g.pieces.length; id++) {
      const e = edges(g, id),
        c = id % d.cols,
        r = Math.floor(id / d.cols);
      if (c < d.cols - 1) assert.equal(e[1], -edges(g, id + 1)[3]);
      else assert.equal(e[1], 0);
      if (r < d.rows - 1) assert.equal(e[2], -edges(g, id + d.cols)[0]);
      else assert.equal(e[2], 0);
      if (c === 0) assert.equal(e[3], 0);
      if (r === 0) assert.equal(e[0], 0);
      assert.ok(!piecePath(g, id).includes("NaN"));
    }
  }
});
test("a close piece locks exactly and a distant piece stays movable", () => {
  const g = game();
  g.pieces[0] = { id: 0, x: 15, y: 12, group: 0, locked: false };
  placeGroup(g, 0);
  assert.deepEqual(g.pieces[0], { id: 0, x: 0, y: 0, group: 0, locked: true });
  g.pieces[3] = { id: 3, x: 140, y: 230, group: 3, locked: false };
  placeGroup(g, 3);
  assert.equal(g.pieces[3].locked, false);
});
test("neighbor pieces join away from home and then lock as a group", () => {
  const g = game(),
    { cw } = geometry(g);
  g.pieces[0] = { id: 0, x: 75, y: 120, group: 0, locked: false };
  g.pieces[1] = { id: 1, x: cw + 82, y: 125, group: 1, locked: false };
  placeGroup(g, 1);
  assert.equal(g.pieces[0].group, g.pieces[1].group);
  assert.equal(g.pieces[1].x - g.pieces[0].x, cw);
  assert.equal(g.pieces[1].locked, false);
  for (const p of g.pieces.filter(Boolean)) {
    p.x -= 70;
    p.y -= 115;
  }
  placeGroup(g, 0);
  assert.ok(g.pieces.filter(Boolean).every((p) => p.locked));
  assert.deepEqual({ x: g.pieces[1].x, y: g.pieces[1].y }, target(g, 1));
});
test("a group snaps into anchored neighbors without moving them", () => {
  const g = game(),
    { cw } = geometry(g);
  g.pieces[0] = { id: 0, x: 0, y: 0, group: 0, locked: true };
  g.pieces[1] = { id: 1, x: cw + 5, y: 3, group: 1, locked: false };
  placeGroup(g, 1);
  assert.equal(g.pieces[1].locked, true);
  assert.equal(g.pieces[0].x, 0);
});
test("all puzzles can be completed in random order including portrait photos", () => {
  for (const d of DIFFICULTIES)
    for (const ratio of [1.5, 0.6667, 1, 3]) {
      const g = game(d.id, ratio);
      for (const id of [...g.order].sort(
        (a, b) => ((a * 13) % 97) - ((b * 13) % 97),
      )) {
        const t = target(g, id);
        g.pieces[id] = { id, x: t.x + 1, y: t.y + 1, group: id, locked: false };
        placeGroup(g, id);
      }
      assert.equal(g.pieces.filter((p) => p.locked).length, g.pieces.length);
    }
});
test("a returned piece is available in the tray and survives save/resume", () => {
  const g = game(),
    order = [...g.order];
  g.pieces[3] = { id: 3, x: 140, y: 230, group: 3, locked: false };
  assert.equal(returnGroupToTray(g, 3), 1);
  assert.equal(g.pieces[3], null);
  assert.deepEqual(g.order, order);
  const restored = validateData(
    JSON.parse(JSON.stringify({ version: 1, records: [], active: g, revision: "rev" })),
  ).active;
  assert.equal(restored.pieces[3], null);
  assert.deepEqual(restored.order, order);
  restored.pieces[3] = { id: 3, ...target(restored, 3), group: 3, locked: false };
  placeGroup(restored, 3);
  assert.equal(restored.pieces[3].locked, true);
});
test("returning a connected group leaves other loose and locked pieces intact", () => {
  const g = game(),
    { cw } = geometry(g);
  g.pieces[0] = { id: 0, x: 75, y: 120, group: 0, locked: false };
  g.pieces[1] = { id: 1, x: cw + 82, y: 125, group: 1, locked: false };
  placeGroup(g, 1);
  g.pieces[5] = { id: 5, x: 300, y: 250, group: 5, locked: false };
  g.pieces[11] = { id: 11, ...target(g, 11), group: 11, locked: true };
  const loose = { ...g.pieces[5] },
    locked = { ...g.pieces[11] };
  assert.equal(returnGroupToTray(g, 0), 2);
  assert.equal(g.pieces[0], null);
  assert.equal(g.pieces[1], null);
  assert.deepEqual(g.pieces[5], loose);
  assert.deepEqual(g.pieces[11], locked);
  assert.deepEqual(
    validateData({ version: 1, records: [], active: g }).active.pieces,
    g.pieces,
  );
});
test("locked pieces and pieces already in the tray cannot be returned again", () => {
  const g = game();
  g.pieces[0] = { id: 0, ...target(g, 0), group: 0, locked: true };
  const original = structuredClone(g);
  assert.equal(returnGroupToTray(g, 0), 0);
  assert.equal(returnGroupToTray(g, 1), 0);
  assert.deepEqual(g, original);
});
test("bonuses decline in whole points, stop at zero, and never reduce base points", () => {
  let previous = 0;
  for (const d of DIFFICULTIES) {
    assert.ok(d.points > previous);
    previous = d.points;
    assert.equal(score(d.id, 0).bonus, Math.round(d.points * 0.5));
    assert.equal(score(d.id, d.target).bonus, Math.round(d.points * 0.25));
    assert.equal(score(d.id, d.target * 2).bonus, 0);
    assert.equal(score(d.id, 1000000).total, d.points);
  }
});
test("larger puzzles retain a time bonus at the extended pace targets and unlock Quick on the Chomp inclusively", () => {
  const quick = ACHIEVEMENTS.find((a) => a.id === "quick");
  for (const [id, paceMinutes, bonusEndMinutes, bonusAtTarget] of [
    ["breezy", 4, 8, 3],
    ["snappy", 10, 20, 6],
    ["bold", 20, 40, 15],
    ["legend", 40, 80, 35],
  ]) {
    const seconds = paceMinutes * 60;
    assert.equal(quick.test([{ difficulty: id, seconds: seconds - 1 }]), true, id);
    assert.equal(quick.test([{ difficulty: id, seconds }]), true, id);
    assert.equal(quick.test([{ difficulty: id, seconds: seconds + 1 }]), false, id);
    assert.equal(score(id, seconds).bonus, bonusAtTarget, id);
    assert.equal(score(id, bonusEndMinutes * 60).bonus, 0, id);
    assert.equal(score(id, bonusEndMinutes * 60 + 1).bonus, 0, id);
  }
});
test("Picture guide charges whole points, caps deductions, and forfeits the reward from ten uses", () => {
  assert.deepEqual(DIFFICULTIES.map((d) => pictureGuideCost(d.id)), [1, 3, 6, 14]);
  for (const d of DIFFICULTIES) {
    for (const seconds of [0, d.target, d.target * 2, 1000000]) {
      const gross = score(d.id, seconds).total;
      for (let uses = 0; uses < 10; uses++) {
        const award = score(d.id, seconds, uses);
        assert.equal(award.guidePenalty, Math.min(gross, uses * pictureGuideCost(d.id)));
        assert.equal(award.total, Math.max(0, gross - uses * pictureGuideCost(d.id)));
        assert.equal(award.total + award.guidePenalty, award.base + award.bonus);
      }
      for (const uses of [10, 11, 100]) {
        const award = score(d.id, seconds, uses);
        assert.equal(award.total, 0);
        assert.equal(award.guidePenalty, gross);
      }
    }
  }
});
test("scores remain whole and nonnegative across times, difficulties, and guide usage", () => {
  for (const d of DIFFICULTIES) {
    let previousBonus = Infinity;
    for (let seconds = 0; seconds <= d.target * 2 + 1; seconds += 0.5) {
      const bonus = score(d.id, seconds).bonus;
      assert.ok(bonus <= previousBonus);
      previousBonus = bonus;
      for (const uses of [0, 1, 2, 8, 9, 10, 11, Number.MAX_SAFE_INTEGER]) {
        const award = score(d.id, seconds, uses);
        assert.ok(Object.values(award).every((points) => Number.isSafeInteger(points) && points >= 0));
        assert.equal(award.total, award.base + award.bonus - award.guidePenalty);
      }
    }
  }
  assert.deepEqual(score("snappy", 60, 1), { base: 25, bonus: 12, guidePenalty: 3, total: 34 });
  assert.deepEqual(score("snappy", 600, 9), { base: 25, bonus: 6, guidePenalty: 27, total: 4 });
  assert.deepEqual(score("snappy", 1200, 9), { base: 25, bonus: 0, guidePenalty: 25, total: 0 });
  assert.equal(score("breezy", 47.99).bonus, 5);
  assert.equal(score("breezy", 48).bonus, 5);
  assert.equal(score("breezy", 48.01).bonus, 4);
});
test("point milestones include whole achievement rewards and cannot fund their own unlock", () => {
  assert.equal(collectedPoints([{ points: 363 }, { points: 13.8 }, { points: 12.8 }]), 390);
  for (const [id, target, priorRewards] of [["points", 500, 10], ["points-5000", 1000, 35], ["points-5k", 5000, 85]]) {
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    assert.equal(achievement.pointTarget, target);
    const records = [{ difficulty: "breezy", seconds: 2400, points: target - priorRewards - 1 }];
    assert.equal(achievementProgress(records).totalPoints, target - 1);
    assert.equal(achievement.test(records), false);
    records[0].points = target - priorRewards;
    assert.equal(achievementProgress(records).totalPoints, target + achievement.points);
    assert.equal(achievement.test(records), true);
    records[0].points += 2100;
    assert.equal(achievement.progress(records), `${target.toLocaleString()} / ${target.toLocaleString()} points`);
  }
});
test("guide usage survives backup roundtrips, missing usage defaults to zero, and invalid usage is rejected", () => {
  const active = game();
  const oldRecord = {
    id: "finished-old-123", name: "Old memory", difficulty: "snappy", seconds: 60,
    points: score("snappy", 60).total, date: "2026-10-01T12:00:00Z", thumbnail: null,
  };
  const legacy = validateData({ version: 1, active, records: [oldRecord] });
  assert.equal(legacy.active.guideUses, 0);
  assert.equal(legacy.records[0].guideUses, 0);
  assert.equal(legacy.records[0].points, oldRecord.points);
  for (const uses of [1, 9, 10, 11]) {
    const record = { ...oldRecord, guideUses: uses, points: score("snappy", 60, uses).total };
    const raw = { version: 1, active: { ...active, guideUses: uses }, records: [record] };
    const restored = validateData(JSON.parse(JSON.stringify(raw)));
    assert.equal(restored.active.guideUses, uses);
    assert.equal(restored.records[0].guideUses, uses);
    assert.equal(restored.records[0].points, record.points);
  }
  for (const guideUses of [-1, 1.5, "1", null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateData({ version: 1, active: { ...active, guideUses }, records: [] }));
    assert.throws(() => validateData({ version: 1, active: null, records: [{ ...oldRecord, guideUses }] }));
  }
});
test("backup validation roundtrips state and rejects malformed records and duplicate IDs", () => {
  const g = game();
  const record = {
    id: "finished-123",
    name: "Memory",
    difficulty: "breezy",
    seconds: 60,
    points: score("breezy", 60).total,
    date: "2026-09-28T12:00:00Z",
    thumbnail: null,
    resumed: true,
    ownPhoto: true,
  };
  const valid = { version: 1, records: [record], active: g, revision: "rev" };
  assert.equal(validateData(valid).active.pieces.length, g.pieces.length);
  assert.throws(() => validateData({ ...valid, records: [record, record] }));
  assert.equal(
    validateData({ ...valid, records: [{ ...record, points: 9999 }] }).records[0].points,
    score("breezy", 60).total,
  );
  assert.throws(() => validateData({ ...valid, records: [{ ...record, difficulty: "unknown" }] }));
  assert.throws(() =>
    validateData({ ...valid, active: { ...g, image: "javascript:alert(1)" } }),
  );
  assert.throws(() =>
    validateData({ ...valid, active: { ...g, order: Array(g.pieces.length).fill(0) } }),
  );
  assert.throws(() => validateData({ ...valid, active: { ...g, ratio: 0 } }));
});
test("an outdated active grid is discarded while completed records use only their difficulty", () => {
  for (const { id } of DIFFICULTIES) {
    const g = game(id), count = g.pieces.length / 2;
    g.pieces = Array(count).fill(null);
    g.order = Array.from({ length: count }, (_, i) => i);
    const data = { version: 1, active: g, records: [{
      id: "old-finished-puzzle", name: "Memory", difficulty: id,
      seconds: 60, date: "2026-10-01T12:00:00Z", pieceCount: count,
    }] };
    const restored = validateData(data);
    assert.equal(restored.active, null);
    assert.equal(restored.records[0].difficulty, id);
    assert.equal(Object.hasOwn(restored.records[0], "pieceCount"), false);
    assert.equal(restored.records[0].points, score(id, 60).total);
    assert.deepEqual(validateData(JSON.parse(JSON.stringify(restored))), restored);
  }
});
test("achievements are derived from completed puzzles and include resumed and own photos", () => {
  assert.equal(ACHIEVEMENTS.length, 20);
  assert.equal(ACHIEVEMENTS.filter((a) => a.test([])).length, 0);
  const record = {
    difficulty: "breezy",
    seconds: 60,
    points: 138,
    resumed: true,
    ownPhoto: true,
  };
  const earned = ACHIEVEMENTS.filter((a) => a.test([record])).map((a) => a.id);
  assert.deepEqual(earned, ["first", "later", "photo", "quick"]);
});

test("the 25 and 50 puzzle achievements unlock at their thresholds and cap progress", () => {
  for (const [id, target] of [["twenty-five", 25], ["fifty", 50]]) {
    const achievement = ACHIEVEMENTS.find((a) => a.id === id);
    for (const count of [0, 24, 25, 26, 49, 50, 51]) {
      const records = Array.from({ length: count }, () => ({ difficulty: "breezy", points: 0 }));
      assert.equal(achievement.test(records), count >= target);
      assert.equal(achievement.progress(records), `${Math.min(count, target)} / ${target} puzzles`);
    }
  }
});

test("Golden Gator counts earned points after guide deductions and unlocks at exactly 1,000", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "points-5000");
  const record = (difficulty, seconds, guideUses = 0) => ({
    difficulty, seconds, guideUses, points: score(difficulty, seconds, guideUses).total,
  });
  const records = [
    ...Array.from({ length: 3 }, () => record("legend", 0)),
    record("legend", 4180, 1), record("bold", 2400, 6),
  ];
  assert.equal(achievement.test(records), false);
  assert.equal(achievement.progress(records), `999 / ${(1000).toLocaleString()} points`);
  records.push(record("breezy", 480, 9));
  assert.equal(achievement.test(records), true);
  assert.equal(achievement.progress(records), `${(1000).toLocaleString()} / ${(1000).toLocaleString()} points`);
  records.at(-1).points--;
  assert.equal(achievement.test(records), false);
  records.at(-1).points += 500;
  assert.equal(achievement.test(records), true);
  assert.equal(achievement.progress(records), `${(1000).toLocaleString()} / ${(1000).toLocaleString()} points`);
});

test("achievement rewards are derived once, including zero-point finishes and repeated puzzles", () => {
  assert.deepEqual(achievementProgress([]), {
    earned: [], puzzlePoints: 0, achievementPoints: 0, totalPoints: 0,
  });
  assert.ok(ACHIEVEMENTS.every((a) => Number.isSafeInteger(a.points) && a.points > 0));
  const records = [{ difficulty: "breezy", seconds: 60, points: score("breezy", 60).total }];
  const first = achievementProgress(records);
  assert.deepEqual(first.earned.map((a) => a.id), ["first", "quick"]);
  assert.equal(first.achievementPoints, 30);
  assert.equal(first.totalPoints, 44);
  assert.deepEqual(achievementProgress(records), first);
  records.push({ ...records[0] });
  assert.equal(achievementProgress(records).achievementPoints, 30);
  assert.equal(achievementProgress(records).totalPoints, 58);

  const guided = achievementProgress([{ ...records[0], guideUses: 10, points: 0 }]);
  assert.equal(guided.puzzlePoints, 0);
  assert.equal(guided.achievementPoints, 40);
  assert.equal(guided.totalPoints, 40);
});

test("Plot Twist requires a completed Twist puzzle and grants its reward only once", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "twist");
  const record = { difficulty: "breezy", seconds: 2400, points: 0, guideUses: 10 };
  assert.equal(achievement.test([], { active: { ...record, twist: true } }), false);
  assert.equal(achievement.test([record, { ...record, twist: false }]), false);
  assert.equal(achievement.progress([record]), "0 / 1 Twist puzzle");
  const twisted = { ...record, twist: true };
  assert.equal(achievement.test([twisted]), true);
  assert.equal(achievement.progress([twisted, twisted]), "1 / 1 Twist puzzle");
  const earned = achievementProgress([twisted]);
  assert.equal(earned.achievementPoints, achievementProgress([record]).achievementPoints + 25);
  assert.equal(achievementProgress([twisted, twisted]).achievementPoints, earned.achievementPoints);
});

test("Look Ma, No Peeks! requires an unguided Legend finish, including legacy saves and Twist", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "legend-no-guide");
  assert.equal(achievement.test([], { active: { difficulty: "legend", guideUses: 0 } }), false);
  for (const difficulty of DIFFICULTIES.map((d) => d.id)) {
    for (const twist of [false, true]) {
      for (const guideUses of [undefined, 0, 1, 9, 10]) {
        const records = [{ difficulty, twist, guideUses }];
        const qualifies = difficulty === "legend" && (guideUses === 0 || guideUses === undefined);
        assert.equal(achievement.test(records), qualifies);
        assert.equal(achievement.progress(records), `${qualifies ? 1 : 0} / 1 Legend puzzle without peeks`);
      }
    }
  }
  assert.equal(achievement.test([{ difficulty: "legend", guideUses: 1 }, { difficulty: "breezy", guideUses: 0 }]), false);
});

test("Twist and Shout counts only completed Twist puzzles and caps progress at five", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "twist-five");
  for (const count of [0, 1, 4, 5, 6]) {
    const records = [
      ...Array.from({ length: count }, () => ({ difficulty: "breezy", twist: true, guideUses: 10, points: 0 })),
      ...Array.from({ length: 10 }, () => ({ difficulty: "breezy", twist: false })),
      { difficulty: "breezy" },
    ];
    assert.equal(achievement.test(records, { active: { twist: true } }), count >= 5);
    assert.equal(achievement.progress(records), `${Math.min(5, count)} / 5 Twist puzzles`);
  }
});

test("Full Circle needs a Twist finish on each distinct difficulty", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "twist-all-difficulties");
  const records = DIFFICULTIES.map(({ id }) => ({ difficulty: id, twist: true, guideUses: 10, points: 0 }));
  assert.equal(achievement.test([]), false);
  assert.equal(achievement.progress([]), "0 / 4 difficulties with Twist");
  for (const missing of records) {
    const incomplete = records.filter((r) => r !== missing);
    const mixed = [...incomplete, ...incomplete, { ...missing, twist: false }, { difficulty: "unknown", twist: true }];
    assert.equal(achievement.test(mixed, { active: missing }), false);
    assert.equal(achievement.progress(mixed), "3 / 4 difficulties with Twist");
  }
  assert.equal(achievement.test(records), true);
  assert.equal(achievement.progress([...records, ...records]), "4 / 4 difficulties with Twist");
});

test("Peek-a-Broke follows actual guide deductions, including nine-use Snappy finishes and Twist", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "guide-zero");
  assert.equal(achievement.test([]), false);
  assert.equal(achievement.test([{ difficulty: "breezy", seconds: 2400, points: 0 }]), false);
  assert.equal(achievement.test([], { guideUsed: true }), false);
  assert.equal(achievement.test([], { guideExhausted: true }), true);
  for (const d of DIFFICULTIES) {
    for (const twist of [false, true]) {
      for (const seconds of [0, d.target, d.target * 2]) {
        for (const guideUses of [0, 1, 8, 9, 10, 11]) {
          const record = { difficulty: d.id, seconds, guideUses, twist, points: 999 };
          assert.equal(achievement.test([record]), score(d.id, seconds, guideUses, twist).total === 0);
        }
      }
    }
  }
  assert.equal(achievement.test([{ difficulty: "snappy", seconds: 1200, guideUses: 9 }]), true);
});

test("exhausted guide rewards migrate from old saves and retain validated lifetime evidence", () => {
  const empty = { version: 1, active: null, records: [] };
  const record = {
    id: "zero-point-finish", name: "Just looking", difficulty: "snappy",
    seconds: 1200, guideUses: 9, date: "2026-10-01T12:00:00Z",
  };
  assert.equal(validateData(empty).guideExhausted, false);
  for (const evidence of [
    { guideExhausted: true },
    { active: { ...game(), guideUses: 10 } },
    { records: [record] },
    { records: [record], guideExhausted: false },
  ]) {
    const restored = validateData({ ...empty, ...evidence });
    assert.equal(restored.guideExhausted, true);
    assert.equal(restored.guideUsed, true);
    restored.active = null;
    restored.records = [];
    const roundtrip = validateData(JSON.parse(JSON.stringify(restored)));
    assert.equal(roundtrip.guideExhausted, true);
    assert.deepEqual(achievementProgress([], roundtrip).earned.map((a) => a.id), ["guide", "guide-zero"]);
  }
  for (const guideExhausted of [null, 0, 1, "true", [], {}]) {
    assert.throws(() => validateData({ ...empty, guideExhausted }));
  }
});

test("guide bonuses and chained point milestones use the same total without duplicate rewards", () => {
  const records = [{ difficulty: "breezy", seconds: 2400, points: 485 }];
  assert.equal(achievementProgress(records).totalPoints, 495);
  const guided = achievementProgress(records, { guideUsed: true });
  assert.deepEqual(guided.earned.map((a) => a.id), ["first", "guide", "points"]);
  assert.equal(guided.totalPoints, 525);
  assert.ok(ACHIEVEMENTS.find((a) => a.id === "points").test(records, { guideUsed: true }));
  assert.equal(ACHIEVEMENTS.find((a) => a.id === "points-5000").progress(records, { guideUsed: true }), `525 / ${(1000).toLocaleString()} points`);

  records[0].points = 965;
  const chained = achievementProgress(records);
  assert.deepEqual(chained.earned.map((a) => a.id), ["first", "points", "points-5000"]);
  assert.equal(chained.totalPoints, 1050);
  assert.equal(chained.achievementPoints, 85);
});

test("legacy fractional saves and backup restores recalculate whole puzzle and achievement points", () => {
  const legacy = {
    version: 1, active: { ...game(), guideUses: 1 },
    records: [{
      id: "legacy-finish-123", name: "Memory", difficulty: "breezy", seconds: 60,
      points: 13.8, date: "2026-10-01T12:00:00Z", thumbnail: null,
    }],
  };
  const restored = validateData(legacy);
  const progress = achievementProgress(restored.records, restored);
  assert.equal(restored.records[0].points, 14);
  assert.equal(progress.achievementPoints, 35);
  assert.equal(progress.totalPoints, 49);
  for (let i = 0; i < 3; i++) {
    const roundtrip = validateData(JSON.parse(JSON.stringify(restored)));
    assert.deepEqual(achievementProgress(roundtrip.records, roundtrip), progress);
    assert.equal(roundtrip.records[0].points, 14);
  }
});

test("Every Kind of Chomp requires completed puzzles on all four distinct difficulties", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "all-difficulties");
  const records = DIFFICULTIES.map(({ id }) => ({ difficulty: id, points: 0 }));
  assert.equal(achievement.test([]), false);
  assert.equal(achievement.progress([]), "0 / 4 difficulties");
  for (const missing of records) {
    const incomplete = records.filter((r) => r !== missing);
    const repeated = [...incomplete, ...incomplete, { difficulty: "unknown" }];
    assert.equal(achievement.test(repeated, { active: missing }), false);
    assert.equal(achievement.progress(repeated), "3 / 4 difficulties");
  }
  assert.equal(achievement.test(records), true);
  assert.equal(achievement.progress([...records, ...records]), "4 / 4 difficulties");
});

test("the guide achievement migrates saved usage and keeps a validated lifetime flag", () => {
  const achievement = ACHIEVEMENTS.find((a) => a.id === "guide");
  const empty = { version: 1, active: null, records: [] };
  const legacy = validateData(empty);
  assert.equal(legacy.guideUsed, false);
  assert.equal(achievement.test([], legacy), false);
  const record = {
    id: "guided-finish-123", name: "A guided puzzle", difficulty: "breezy",
    seconds: 60, guideUses: 1, points: score("breezy", 60, 1).total,
    date: "2026-10-01T12:00:00Z", thumbnail: null,
  };
  for (const evidence of [
    { guideUsed: true },
    { active: { ...game(), guideUses: 1 } },
    { records: [record] },
    { records: [record], guideUsed: false },
  ]) {
    const restored = validateData({ ...empty, ...evidence });
    assert.equal(restored.guideUsed, true);
    assert.equal(achievement.test(restored.records, restored), true);
    restored.active = null;
    restored.records = [];
    const roundtrip = validateData(JSON.parse(JSON.stringify(restored)));
    assert.equal(achievement.test(roundtrip.records, roundtrip), true);
  }
  assert.equal(achievement.test([record]), true);
  assert.equal(achievement.test([], { active: { guideUses: 1 } }), true);
  for (const guideUsed of [null, 0, 1, "true", [], {}]) {
    assert.throws(() => validateData({ ...empty, guideUsed }));
  }
});

test("Sunshine Explorer requires every distinct bundled picture, on any difficulty", () => {
  const explorer = ACHIEVEMENTS.find((a) => a.id === "explorer");
  assert.equal(explorer.test([]), false);
  assert.equal(explorer.description, "Finish all 15 included pictures. Soak up the sunshine.");
  assert.equal(explorer.progress([]), "0 / 15 pictures");
  for (const level of [null, ...DIFFICULTIES]) {
    const records = SAMPLE_SNAPSCAPES.map((sampleId, i) => ({
      sampleId,
      difficulty: (level || DIFFICULTIES[i % DIFFICULTIES.length]).id,
      name: "The same edited title",
      ownPhoto: false,
      points: 0,
      thumbnail: null,
    }));
    const incomplete = [...records.slice(0, -1), ...records.slice(0, -1)];
    assert.equal(explorer.test(incomplete), false);
    assert.equal(explorer.progress(incomplete), "14 / 15 pictures");
    assert.equal(explorer.test(records), true);
    assert.equal(explorer.progress([...records, ...records]), "15 / 15 pictures");
  }
  const repeated = DIFFICULTIES.map(({ id }) => ({ sampleId: "beach", difficulty: id }));
  assert.equal(explorer.progress(repeated), "1 / 15 pictures");
  assert.equal(explorer.test(repeated), false);
});

test("Sunshine Explorer keeps the original twelve finishes and requires each new picture", () => {
  const explorer = ACHIEVEMENTS.find((a) => a.id === "explorer");
  const records = [
    "beach", "bike", "bookstore", "diner", "fishing", "football",
    "interstate-95", "kajak", "mall", "miami", "oranges", "st-augustine",
  ].map((sampleId) => ({ sampleId, ownPhoto: false }));
  assert.equal(explorer.progress(records), "12 / 15 pictures");
  assert.equal(explorer.test(records), false);
  for (const sampleId of ["lecture", "tennis", "gymnastics"]) {
    records.push({ sampleId, ownPhoto: false });
    assert.equal(explorer.progress(records), `${records.length} / 15 pictures`);
    assert.equal(explorer.test(records), records.length === 15);
  }
  assert.equal(explorer.points, 100);
});

test("Sunshine Explorer excludes uploads, unidentified legacy finishes, and unknown pictures", () => {
  const explorer = ACHIEVEMENTS.find((a) => a.id === "explorer");
  const records = [
    ...SAMPLE_SNAPSCAPES.map((sampleId) => ({ sampleId, ownPhoto: true })),
    ...SAMPLE_SNAPSCAPES.map((name) => ({ name, ownPhoto: false })),
    { sampleId: "unknown-picture", ownPhoto: false },
    { sampleId: null, ownPhoto: false },
  ];
  assert.equal(explorer.test(records), false);
  assert.equal(explorer.progress(records), "0 / 15 pictures");
});

test("sample identities survive backup validation while legacy saves remain readable", () => {
  const record = {
    id: "sample-finish-123", name: "Renamed memory", difficulty: "breezy",
    seconds: 60, points: score("breezy", 60).total,
    date: "2026-10-01T12:00:00Z", thumbnail: null, ownPhoto: false,
  };
  const legacy = validateData({ version: 1, active: game(), records: [record] });
  assert.equal(legacy.active.sampleId, null);
  assert.equal(legacy.records[0].sampleId, null);
  assert.equal(legacy.records[0].points, record.points);
  for (const sampleId of [null, ...SAMPLE_SNAPSCAPES]) {
    const raw = {
      version: 1,
      active: { ...game(), sampleId },
      records: [{ ...record, sampleId }],
    };
    const restored = validateData(JSON.parse(JSON.stringify(raw)));
    assert.equal(restored.active.sampleId, sampleId);
    assert.equal(restored.records[0].sampleId, sampleId);
  }
  for (const identity of [
    ...["unknown-picture", "", 1, true, [], {}].map((sampleId) => ({ sampleId })),
    { sampleId: "beach", ownPhoto: true },
  ]) {
    assert.throws(() => validateData({ version: 1, active: { ...game(), ...identity }, records: [] }));
    assert.throws(() => validateData({ version: 1, active: null, records: [{ ...record, ...identity }] }));
  }
});

function twistGame(id = "breezy", ratio = 1.5) {
  const g = game(id, ratio);
  return { ...g, twist: true, rotations: Array(g.pieces.length).fill(0) };
}
const restoreTwist = (g) => validateData(JSON.parse(JSON.stringify({ version: 1, records: [], active: g }))).active;

test("rotated pieces only lock upright and only join equally rotated neighbors", () => {
  for (const turns of [1, 2, 3]) {
    const g = twistGame(), { cw } = geometry(g);
    g.rotations[0] = turns;
    g.pieces[0] = { id: 0, x: 1, y: 1, group: 0, locked: false };
    assert.equal(placeGroup(g, 0), 0);
    assert.equal(g.pieces[0].locked, false);
    g.pieces[0].x = 350;
    g.pieces[0].y = 240;
    const delta = rotateVector(cw, 0, turns);
    g.pieces[1] = { id: 1, x: 350 + delta.x, y: 240 + delta.y, group: 1, locked: false };
    placeGroup(g, 1);
    assert.notEqual(g.pieces[1].group, g.pieces[0].group);
    g.rotations[1] = turns;
    g.pieces[1].x = g.pieces[0].x + delta.x;
    g.pieces[1].y = g.pieces[0].y + delta.y;
    placeGroup(g, 1);
    assert.equal(g.pieces[1].group, g.pieces[0].group);
    assert.equal(g.pieces[1].locked, false);
    assert.deepEqual(restoreTwist(g).pieces, g.pieces);
    rotateGroup(g, 0, -turns);
    const dx = g.pieces[0].x, dy = g.pieces[0].y;
    g.pieces.filter(Boolean).forEach((p) => { p.x -= dx; p.y -= dy; });
    assert.equal(placeGroup(g, 0), 2);
    assert.equal(rotateGroup(g, 0), 0);
    assert.deepEqual(restoreTwist(g).pieces, g.pieces);
  }
});

test("rotation preserves connected groups and saves for every photo shape and difficulty", () => {
  for (const d of DIFFICULTIES) for (const ratio of [0.15, 0.6667, 1, 1.5, 3, 7]) {
    const g = twistGame(d.id, ratio);
    // A full loose group covers the hardest oversized case after a quarter turn.
    g.pieces = g.pieces.map((_, id) => ({ id, ...target(g, id), group: 0, locked: false }));
    for (let turn = 0; turn < 4; turn++) {
      assert.equal(rotateGroup(g, 0), g.pieces.length);
      const restored = restoreTwist(g);
      assert.deepEqual(restored.rotations, g.rotations);
      assert.deepEqual(restored.pieces, g.pieces);
      const delta = rotateVector(geometry(g).cw, 0, (turn + 1) % 4);
      assert.ok(Math.abs(g.pieces[1].x - g.pieces[0].x - delta.x) < 0.0001);
      assert.ok(Math.abs(g.pieces[1].y - g.pieces[0].y - delta.y) < 0.0001);
    }
    const dx = g.pieces[0].x, dy = g.pieces[0].y;
    g.pieces.forEach((p) => { p.x -= dx; p.y -= dy; });
    assert.equal(placeGroup(g, 0), g.pieces.length);
  }
});

test("tray return, rotation, and placement retain angles and fit rectangular pieces", () => {
  for (const ratio of [0.15, 0.67, 1.5, 7]) {
    const g = twistGame("breezy", ratio), { cw, ch, w, h } = geometry(g);
    for (const turns of [0, 1, 2, 3]) {
      g.rotations[2] = turns;
      g.pieces[2] = { id: 2, x: w, y: h, group: 2, locked: false };
      constrainGroup(g, 2);
      const box = pieceBounds(g, 2);
      assert.equal(box.width, turns % 2 ? ch : cw);
      assert.equal(box.height, turns % 2 ? cw : ch);
      assert.equal(restoreTwist(g).rotations[2], turns);
      assert.equal(returnGroupToTray(g, 2), 1);
      assert.equal(restoreTwist(g).rotations[2], turns);
      assert.equal(rotateGroup(g, 2), 1);
      assert.equal(restoreTwist(g).rotations[2], (turns + 1) % 4);
    }
  }
});

test("Twist doubles whole puzzle rewards and guide costs, with zero after ten guides", () => {
  for (const d of DIFFICULTIES) for (const seconds of [0, 48.01, 60, d.target, d.target * 2]) {
    for (const guides of [0, 1, 2, 9, 10, 11]) {
      const normal = score(d.id, seconds, guides), twist = score(d.id, seconds, guides, true);
      for (const key of Object.keys(normal)) assert.equal(twist[key], normal[key] * 2);
      assert.equal(pictureGuideCost(d.id, true), pictureGuideCost(d.id) * 2);
    }
  }
});

test("legacy backups stay upright and malformed rotation or group state is rejected", () => {
  const legacy = restoreTwist(game());
  assert.equal(legacy.twist, false);
  assert.ok(legacy.rotations.every((angle) => angle === 0));
  assert.equal(pieceRotation(legacy, 0), 0);
  const g = twistGame();
  for (const twist of ["true", 1, null]) assert.throws(() => restoreTwist({ ...g, twist }));
  for (const rotations of [undefined, null, [], ...[4, -1, 0.5, "0"].map((angle) => Array(g.pieces.length).fill(angle))]) {
    assert.throws(() => restoreTwist({ ...g, rotations }));
  }
  assert.throws(() => restoreTwist({ ...g, twist: false, rotations: Array(g.pieces.length).fill(1) }));
  g.pieces[0] = { id: 0, x: 0, y: 0, group: 0, locked: true };
  g.rotations[0] = 1;
  assert.throws(() => restoreTwist(g));
  g.pieces[0] = { id: 0, x: 100, y: 150, group: 0, locked: false };
  g.pieces[1] = { id: 1, x: 100, y: 150 + geometry(g).cw, group: 0, locked: false };
  assert.throws(() => restoreTwist(g));
  g.rotations[1] = 1;
  assert.doesNotThrow(() => restoreTwist(g));
  g.pieces[1].x += 50;
  assert.throws(() => restoreTwist(g));
});
