// Run with: node --test scripts/ghost-patrol.test.cjs
// Exercise the actual game loop with a deterministic clock and minimal browser stubs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/scripts/ghost-patrol.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

// Mirror of the speed column in TRAITS, so a spawn's level scaling can be isolated.
const TRAITS_SPEED = (i) => [1.00, 1.30, 1.00, 1.25, 0.90, 1.05, 1.15, 1.45, 0.55, 1.20, 0.95, 1.40][i];

function setup(storageFails = false) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { textContent: '', hidden: true, focus() {}, setAttribute() {}, style: {} });
    return nodes.get(selector);
  };
  const storage = new Map();
  let seed = 1;
  const seededMath = Object.create(Math);
  seededMath.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const context = vm.createContext({
    exports: {},
    Math: seededMath,
    HTMLElement: class {
      querySelector(selector) { return node(selector); }
      setAttribute() {}
      removeAttribute() {}
    },
    Image: class { naturalWidth = 1024; naturalHeight = 1400; decode() { return Promise.resolve(); } }, AbortController,
    window: { matchMedia: () => ({ matches: true }) },
    document: {
      documentElement: { classList: { contains: () => true } },
      createElement: () => ({ textContent: '', attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } }),
    },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    localStorage: {
      setItem(key, value) { if (storageFails) throw Error('Storage denied'); storage.set(key, value); },
      getItem(key) { if (storageFails) throw Error('Storage denied'); return storage.get(key) ?? null; },
    },
  });
  vm.runInContext(source, context);
  const game = new context.exports.GhostPatrol();
  game.ctx = {
    clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    drawImage(_image, ...coordinates) {
      assert.equal(coordinates.length, 8);
      assert.ok(coordinates.every(Number.isFinite), 'Sprite coordinates must be finite');
    },
  };
  game.canvas = Object.assign(node('canvas'), { width: 800, height: 300 });
  game.trapButton = node('.trap');
  const list = node('[data-runs]');
  list.children = [];
  list.appendChild = (child) => list.children.push(child);
  // Mirror the DOM: clearing textContent drops the children with it.
  Object.defineProperty(list, 'textContent', {
    get() { return this._text ?? ''; },
    set(value) { this._text = value; if (value === '') list.children.length = 0; },
  });
  game.overlay = node('.overlay'); game.startButton = node('.start');
  game.levelBanner = node('.level-up');
  game.ready = true;
  game.start();
  game.spawnIn = 100;
  const step = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) game.tick(game.last + 1000 / 60);
  };
  const ghost = (x = 350, y = 150, appearance = 0) => ({ x, y, phase: 0, age: 0, health: 1, speed: 0, appearance, stamina: 1 });
  /** Drain one ghost to zero health, then spring the trap on it. */
  const drain = (appearance = 0, budget = 4) => {
    const target = ghost(350, 150, appearance);
    game.ghosts = [target];
    game.angle = Math.atan2(target.y - game.origin.y, target.x - game.origin.x);
    game.pointerDown = true;
    let held = 0;
    while (game.pending !== target && held < budget) { step(1 / 60); held += 1 / 60; }
    game.pointerDown = false;
    step(1 / 60); // Let the loop see the trigger released, as a real frame would.
    return held;
  };
  const catchOne = (appearance = 0, budget = 4) => {
    const held = drain(appearance, budget);
    game.trapNow();
    return held;
  };
  return { game, node, storage, step, ghost, drain, catchOne, context, JSON };
}

test('each wave ends with one random boss encounter before advancing the level', () => {
  const { game, context, step } = setup();
  const { BOSS_ROSTER } = context.exports;
  for (let index = 0; index < BOSS_ROSTER.length; index++) {
    const level = game.level;
    assert.equal(game.isBossLevel, false);
    context.Math.random = () => (index + 0.5) / BOSS_ROSTER.length;
    game.advanceLevel();
    assert.equal(game.level, level, 'the boss belongs to the wave just cleared');
    assert.equal(game.activeBoss, BOSS_ROSTER[index], 'selection uses the random draw');
    assert.equal(game.quota, game.activeBoss.mate ? 2 : 1);
    const selected = game.activeBoss;
    game.pause(false);
    game.start();
    assert.equal(game.activeBoss, selected, 'resuming must not reroll the boss');
    game.interlude = 0;
    game.spawnIn = 0;
    step(1 / 60);
    assert.ok(game.ghosts.every((boss) => boss.boss.spec === selected));
    game.advanceLevel();
    assert.equal(game.level, level + 1);
    assert.equal(game.isBossLevel, false);
    assert.equal(game.quota, 4 + game.level);
  }
});

test('holding a correctly aimed stream catches one ghost; a tap does not', () => {
  const { game, step, ghost } = setup();
  const target = ghost(); game.ghosts = [target];
  game.angle = Math.atan2(target.y - game.origin.y, target.x - game.origin.x);
  game.pointerDown = true;
  step(0.1); assert.equal(game.score, 0); assert.equal(game.pending, undefined);
  step(0.6);
  assert.equal(game.pending, target, 'a drained ghost hangs stunned rather than scoring');
  assert.equal(game.score, 0, 'nothing is scored until the trap springs');
  game.trapNow();
  assert.equal(game.score, 1); assert.equal(game.ghosts.length, 0);
  step(0.5); assert.equal(game.score, 1);
});

test('a missed stream does not catch ghosts', () => {
  const { game, step, ghost } = setup();
  game.ghosts = [ghost()]; game.angle = 0.1; game.keys.add(' ');
  step(1); assert.equal(game.score, 0);
});

test('beam contact slows a moving ghost to 25 percent of its normal speed', () => {
  const { game, step, ghost } = setup();
  const target = ghost();
  target.speed = 100;
  game.ghosts = [target];
  game.angle = Math.atan2(target.y - game.origin.y, target.x - game.origin.x);
  game.pointerDown = true;
  const initialX = target.x;
  step(0.1);
  assert.ok(Math.abs(initialX - target.x - 2.5) < 1e-8);
  game.pointerDown = false;
  const releasedX = target.x;
  step(0.1);
  assert.ok(Math.abs(releasedX - target.x - 10) < 1e-8);
});

test('three escapes end the shift and replay clears the old round', () => {
  const { game, step, ghost } = setup();
  game.ghosts = [ghost(0), ghost(1), ghost(2)];
  step(0.02); assert.equal(game.mode, 'over'); assert.equal(game.lives, 0);
  game.start(); assert.equal(game.mode, 'playing'); assert.equal(game.lives, 3);
  assert.equal(game.elapsed, 0); assert.equal(game.ghosts.length, 0);
  assert.equal(game.caught, 0); assert.equal(game.streak, 0); assert.equal(game.score, 0);
  assert.equal(game.pending, undefined); assert.equal(game.trap, undefined);
  assert.equal(game.level, 1); assert.equal(game.trapped, 0);
});

test('a pile-up of escapes on one frame cannot drive lives negative', () => {
  const { game, step, ghost, node } = setup();
  game.ghosts = [0, 1, 2, 3, 4].map((x) => ghost(x));
  step(0.02);
  assert.equal(game.lives, 0, 'lives must clamp at zero, not run negative');
  assert.equal(node('[data-lives]').textContent, '0 escapes left');
  assert.equal(node('[data-heading]').textContent, 'We’ve been slimed!');
});

test('pause freezes the timer and clears held input, then resume preserves the round', () => {
  const { game, step } = setup();
  step(2); game.keys.add(' '); game.pointerDown = true;
  game.pause(false); const elapsed = game.elapsed;
  step(30); assert.equal(game.elapsed, elapsed); assert.equal(game.firing, false);
  game.start(); assert.equal(game.elapsed, elapsed); assert.equal(game.mode, 'playing');
});

test('losing the last escape ends the run and saves a personal best', () => {
  const { game, step, storage, ghost } = setup();
  game.score = 8;
  game.ghosts = [ghost(0), ghost(1), ghost(2)];
  step(0.02);
  assert.equal(game.mode, 'over'); assert.equal(game.best, 8);
  assert.equal(storage.get('ghost-patrol-best'), '8');
});

test('a run keeps going well past the old 45-second shift', () => {
  const { game, step } = setup();
  step(60);
  assert.equal(game.mode, 'playing', 'there is no shift clock to run out');
});

test('unavailable storage does not prevent completing a round', () => {
  const { game, step, ghost } = setup(true);
  game.score = 2;
  game.ghosts = [ghost(0), ghost(1), ghost(2)];
  step(0.02); assert.equal(game.mode, 'over'); assert.equal(game.best, 2);
});

test('an animation timestamp before start time cannot select a negative sprite frame', () => {
  const { game, step, ghost } = setup();
  game.reducedMotion.matches = false;
  game.last = 100;
  game.ghosts = [ghost()];
  game.tick(99);
  assert.equal(game.elapsed, 0);
  game.pointerDown = true;
  step(1);
  game.pause(false);
  const elapsed = game.elapsed;
  game.start();
  game.tick(game.last - 1);
  assert.equal(game.elapsed, elapsed);
});

test('spawns select varied ghost appearances that stay fixed during animation', () => {
  const { game, step } = setup();
  const appearances = new Set();
  for (let i = 0; i < 80; i++) {
    game.ghosts = []; game.spawnIn = 0;
    step(0.02);
    const spawned = game.ghosts[0];
    assert.ok(Number.isInteger(spawned.appearance));
    assert.ok(spawned.appearance >= 0 && spawned.appearance < 12);
    appearances.add(spawned.appearance);
    const appearance = spawned.appearance;
    step(0.1);
    assert.equal(spawned.appearance, appearance);
  }
  assert.ok(appearances.size > 1);
});

test('archetypes fly distinct paths, and none can leave the street', () => {
  const { game, ghost } = setup();
  game.reducedMotion.matches = false;
  // Sample each archetype's height over its first few seconds of flight.
  const trace = (appearance) => {
    const g = ghost(600, 140, appearance);
    const seen = [];
    for (let step = 0; step < 45; step++) { g.age = step / 15; seen.push(game.ghostY(g)); }
    return seen;
  };
  const shapes = new Map();
  for (let appearance = 0; appearance < 12; appearance++) {
    const path = trace(appearance);
    for (const y of path) {
      assert.ok(y >= 42 && y <= 228, `appearance ${appearance} flew to ${y}, off the street`);
    }
    shapes.set(appearance, path);
  }
  // The five patterned archetypes must each differ from the plain drift of Slimer.
  const drift = shapes.get(0);
  const spread = (a, b) => Math.max(...a.map((y, i) => Math.abs(y - b[i])));
  for (const [appearance, name] of [[1, 'dive'], [6, 'weave'], [7, 'feint'], [9, 'swoop']]) {
    assert.ok(spread(shapes.get(appearance), drift) > 12,
      `${name} (appearance ${appearance}) should not trace the same line as a drifter`);
  }
  // A charger surges and pauses rather than holding one pace.
  const charger = ghost(600, 140, 3);
  const paces = [];
  for (let step = 0; step < 30; step++) { charger.age = step / 10; paces.push(game.paceOf(charger)); }
  assert.ok(Math.max(...paces) - Math.min(...paces) > 0.8, 'a charger should surge and pause');
  assert.ok(Math.min(...paces) >= 0, 'but never reverse');
  const drifter = ghost(600, 140, 0);
  assert.equal(game.paceOf(drifter), 1, 'a drifter holds a steady pace');
});

test('reduced motion flattens every flight path', () => {
  const { game, ghost } = setup();
  game.reducedMotion.matches = true;
  for (const appearance of [1, 6, 7, 9]) {
    const g = ghost(600, 140, appearance);
    g.age = 2.5;
    assert.equal(game.ghostY(g), 140);
    assert.equal(game.paceOf(g), 1);
  }
});

test('the nastiest ghosts stay out of the opening levels', () => {
  const { game } = setup();
  const early = new Set();
  for (let i = 0; i < 300; i++) { game.level = 1; early.add(game.pickAppearance()); }
  // Stay Puft (level 6), the reaper (5) and the fire skull (4) are all late arrivals.
  for (const late of [8, 9, 11]) assert.ok(!early.has(late), `appearance ${late} should not spawn on level 1`);
  game.level = 8;
  const late = new Set();
  for (let i = 0; i < 600; i++) late.add(game.pickAppearance());
  assert.ok(late.has(8) && late.has(9), 'late ghosts should appear once their level is reached');
});

test('clearing the wave quota starts a boss, whose capture advances the level', () => {
  const { game, drain, step } = setup();
  assert.equal(game.level, 1);
  assert.equal(game.quota, 5);
  const firstSpeed = game.levelSpeed;
  const needed = game.quota; // Read once: the getter changes the moment the level ticks over.
  for (let i = 0; i < needed; i++) {
    drain(0);
    game.trapNow();
    // Run the trap animation out; the quota only banks once it finishes.
    for (let f = 0; f < 200 && game.trap; f++) step(1 / 60);
  }
  assert.equal(game.level, 1, 'the wave alone does not advance the level');
  assert.equal(game.isBossLevel, true);
  assert.equal(game.levelSpeed, firstSpeed, 'the boss shares the level difficulty');
  step(2.5);
  assert.ok(game.ghosts.length > 0);
  for (const boss of [...game.ghosts]) {
    while (game.ghosts.includes(boss)) {
      boss.health = 0;
      game.pending = boss;
      game.trapNow();
      for (let frame = 0; frame < 200 && game.trap; frame++) step(1 / 60);
    }
  }
  assert.equal(game.level, 2, 'defeating the boss advances the level');
  assert.equal(game.trapped, 0, 'and the quota counter resets');
  assert.ok(game.levelSpeed > firstSpeed, 'ghosts get faster each level');
  assert.ok(game.interlude > 0, 'a level card holds play briefly');
  assert.equal(game.ghosts.length, 0, 'the street is cleared between levels');
});

test('an ordinary level asks for one more ghost than the last', () => {
  const { game, context } = setup();
  const waves = [1, 2, 3, 4, 5];
  for (const level of waves) {
    game.level = level;
    assert.equal(game.isBossLevel, false);
    assert.equal(game.quota, 4 + level, `level ${level} should ask for ${4 + level}`);
  }
  game.activeBoss = context.exports.BOSS_ROSTER[0];
  assert.equal(game.quota, 1, 'a boss level asks for one');
});

test('a spawned ghost carries the level speed multiplier', () => {
  const { game, step } = setup();
  game.ghosts = []; game.spawnIn = 0;
  step(0.02);
  const first = game.ghosts[0].speed / TRAITS_SPEED(game.ghosts[0].appearance);
  assert.equal(game.levelSpeed, 1, 'opening level keeps its base speed');
  const later = 6;
  game.level = later;
  game.ghosts = []; game.spawnIn = 0;
  step(0.02);
  const faster = game.ghosts[0].speed / TRAITS_SPEED(game.ghosts[0].appearance);
  const expected = 1 + (later - 1) * 0.14;
  assert.ok(Math.abs(faster / first - expected) < 1e-8,
    `level ${later} should add ${later - 1} fourteen-percent steps`);
});

test('ghosts do not crawl on a narrow screen', () => {
  const { game, step } = setup();
  const paceAt = (width) => {
    game.width = width;
    game.ghosts = []; game.spawnIn = 0;
    step(0.02);
    return game.ghosts[0].speed / TRAITS_SPEED(game.ghosts[0].appearance);
  };
  const phone = paceAt(380);
  const desktop = paceAt(800);
  // A phone ghost covers less ground so it is slower in absolute terms, but it must not
  // crawl: a fixed crossing time used to leave it at 40% of the desktop pace.
  assert.ok(phone > desktop * 0.55, `phone ${phone.toFixed(1)} vs desktop ${desktop.toFixed(1)} px/s`);
  const crossing = (380 - (16 + 164 * 0.7)) / phone;
  assert.ok(crossing > 3 && crossing < 6, `a phone ghost should cross in a few seconds, got ${crossing.toFixed(1)}s`);
});

test('the TRAP prompt stays inside the stage on a narrow screen', () => {
  const { game, node, ghost } = setup();
  const button = node('.trap');
  button.offsetWidth = 120;
  game.width = 360;
  game.canvas.getBoundingClientRect = () => ({ width: 360 });
  const halfPercent = (120 / 2 / 360) * 100;
  for (const x of [4, 180, 356]) {
    game.showTrapPrompt(ghost(x, 120));
    assert.equal(button.hidden, false);
    const left = parseFloat(button.style.left);
    assert.ok(Number.isFinite(left), `prompt left was ${button.style.left}`);
    assert.ok(left - halfPercent >= -0.01, `a ghost at ${x} put the prompt off the left edge (${left}%)`);
    assert.ok(left + halfPercent <= 100.01, `a ghost at ${x} put the prompt off the right edge (${left}%)`);
  }
});

test('the interlude freezes play until the level card clears', () => {
  const { game, step, ghost } = setup();
  game.interlude = 1.5;
  game.ghosts = [ghost(300)];
  const before = game.elapsed;
  step(0.5);
  assert.ok(game.interlude > 0 && game.interlude < 1.5, 'the card counts down');
  assert.ok(game.elapsed > before, 'the animation clock keeps running');
  step(1.5);
  assert.equal(game.interlude <= 0, true, 'and then hands play back');
});

test('boss levels field a lone Stay Puft that takes several traps', () => {
  const { game, step, context } = setup();
  game.activeBoss = context.exports.BOSS_ROSTER[0];
  assert.equal(game.isBossLevel, true);
  assert.equal(game.quota, 1, 'a boss level asks for exactly one catch');
  game.ghosts = []; game.spawnIn = 0;
  step(0.02);
  assert.equal(game.ghosts.length, 1);
  const boss = game.ghosts[0];
  assert.ok(boss.boss, 'it is flagged as a boss');
  assert.equal(boss.boss.spec.name, 'Stay Puft', 'the first boss slot is Stay Puft');
  assert.equal(boss.boss.sprite, 'staypuft');
  assert.equal(boss.stamina, 3);
  assert.ok(game.ghostSize(boss) > game.ghostSize({ ...boss, boss: undefined }), 'and looms larger');
  // Nothing else joins it.
  step(6);
  assert.equal(game.ghosts.length, 1, 'a boss arrives alone');
});

test('a boss that slips past the car comes back, rather than stranding the level', () => {
  const { game, step, ghost, context } = setup();
  game.activeBoss = context.exports.BOSS_ROSTER[4];
  game.lives = 3;
  game.spawnIn = Infinity;
  const boss = { ...ghost(0, 120, 8), boss: { spec: game.bossSpec, sprite: game.bossSpec.sprite, roar: 0 }, stamina: 3 };
  game.ghosts = [boss];
  step(0.02);
  assert.equal(game.ghosts.length, 0, 'it escapes');
  assert.equal(game.lives, 2, 'and costs an escape');
  assert.ok(Number.isFinite(game.spawnIn), 'a replacement must be scheduled');
  step(2);
  assert.ok(game.ghosts.length >= 1, 'the boss returns');
  assert.ok(game.ghosts[0].boss, 'and it is a boss again');
  assert.equal(game.ghosts[0].boss.spec, game.activeBoss, 'an escape does not reroll the selected boss');
});

test('the boss roster includes Garaka, and a paired boss arrives two at a time', () => {
  const { game, step, context } = setup();
  const { BOSS_ROSTER } = context.exports;
  assert.deepEqual(Array.from(BOSS_ROSTER, (boss) => boss.name), ['Stay Puft', 'Terror Dog', 'The Scoleri Brothers', 'Slime Serpent', 'Garaka']);

  // The Scoleri level fields both brothers, and asks for both to be trapped.
  game.activeBoss = BOSS_ROSTER[2];
  assert.equal(game.quota, 2);
  game.ghosts = []; game.spawnIn = 0;
  step(0.02);
  assert.equal(game.ghosts.length, 2, 'the brothers arrive together');
  assert.deepEqual(game.ghosts.map((g) => g.boss.sprite), ['scoleriTall', 'scoleriFat']);
  assert.ok(game.ghosts.every((g) => g.stamina === 2));

  game.activeBoss = BOSS_ROSTER[0];
  assert.equal(game.quota, 1, 'a solo boss asks for one');
});

test('the Scoleri brothers stay vertically separated and approach at a slower pace', () => {
  for (const width of [360, 800]) {
    const { game, step, context } = setup();
    game.width = width;
    game.reducedMotion.matches = false;
    game.activeBoss = context.exports.BOSS_ROSTER[2];
    game.spawnIn = 0;
    step(1 / 60);
    const [upper, lower] = game.ghosts;
    assert.equal(lower.y - upper.y, 110);
    const base = (width - game.origin.x) / game.crossSeconds * game.levelSpeed;
    for (const boss of game.ghosts) {
      assert.ok(Math.abs(boss.speed - base * 0.70) < 1e-8, 'approach speed is two-thirds of the old 1.05 multiplier');
      boss.x = width * 0.7;
    }
    for (let age = 0; age <= 10; age += 0.25) {
      upper.age = age;
      lower.age = age;
      assert.ok(game.ghostY(lower) - game.ghostY(upper) >= 100, 'bobbing preserves distinct flight heights');
      for (const boss of game.ghosts) {
        game.angle = Math.atan2(game.ghostY(boss) - game.origin.y, boss.x - game.origin.x);
        assert.equal(game.beamTarget(), boss, 'either brother can be targeted at its centre even when side by side');
      }
    }
  }
});

test('boss animation picks a frame from what it is doing', () => {
  const { game, ghost, context } = setup();
  game.activeBoss = context.exports.BOSS_ROSTER[0];
  const boss = { ...ghost(350, 150, 8), stamina: 3, boss: { spec: game.bossSpec, sprite: game.bossSpec.sprite, roar: 0 } };
  game.ghosts = [boss];

  boss.age = 0.3;
  assert.ok(game.bossFrame(boss) < 4, 'approaching uses the top row');
  game.lastTarget = boss;
  assert.equal(game.bossFrame(boss), 5, 'under the stream it flinches');
  game.lastTarget = undefined;
  boss.boss.roar = 0.5;
  assert.equal(game.bossFrame(boss), 4, 'a boss that broke a trap roars');
  boss.boss.roar = 0;
  game.pending = boss;
  assert.ok(game.bossFrame(boss) >= 6, 'stunned uses the dazed pair');

  // The serpent rises once rather than looping its approach.
  game.pending = undefined;
  const serpent = { ...boss, boss: { spec: { ...game.bossSpec, rise: true }, sprite: 'slime', roar: 0 } };
  serpent.age = 0;
  assert.equal(game.bossFrame(serpent), 0);
  serpent.age = 5;
  assert.equal(game.bossFrame(serpent), 3, 'and then holds its full height');
});

test('the trap swallows the boss you actually fought, not Stay Puft every time', () => {
  const { game, ghost, context } = setup();
  // Every boss shares one ghost-atlas appearance, so the trap has to record the sheet.
  for (const spec of context.exports.BOSS_ROSTER) {
    game.activeBoss = spec;
    const boss = { ...ghost(350, spec.y, 8), stamina: 1, boss: { spec, sprite: spec.sprite, roar: 0 } };
    game.ghosts = [boss];
    game.pending = boss;
    game.trap = undefined;
    game.trapNow();
    assert.equal(game.trap.sprite, spec.sprite, `the trap should capture ${spec.name}`);
  }
  // An ordinary ghost carries no boss sheet and falls back to the atlas.
  const plain = ghost(350, 150, 4);
  game.ghosts = [plain];
  game.pending = plain;
  game.trap = undefined;
  game.trapNow();
  assert.equal(game.trap.sprite, undefined);
  assert.equal(game.trap.appearance, 4);
});

for (const [slot, sprite] of [[1, 'staypuft'], [2, 'terrordog'], [3, 'scoleriTall'], [3, 'scoleriFat'], [4, 'slime'], [5, 'garaka']]) {
  for (const width of [360, 800]) {
    for (const reducedMotion of [false, true]) {
      for (const partial of [false, true]) {
        test(`${sprite} trap alignment at width ${width}, reduced motion ${reducedMotion}, partial ${partial}`, () => {
          const { game, step, context } = setup();
          const { BOSSES, ATLAS, BOSS_ROSTER } = context.exports;
          game.width = width;
          game.reducedMotion.matches = reducedMotion;
          game.bossesReady = true;
          game.level = slot * 2;
          game.activeBoss = BOSS_ROSTER[slot - 1];
          game.spawnIn = 0;
          step(1 / 60);
          const boss = game.ghosts.find((target) => target.boss.sprite === sprite);
          boss.x = width * 0.68;
          boss.age = 1;
          boss.health = 0;
          boss.stamina = partial ? 2 : 1;
          game.pending = boss;
          const height = game.ghostY(boss);
          game.trapNow();
          const trap = game.trap;
          assert.equal(trap.sprite, sprite);
          assert.equal(trap.ghostY, height);
          assert.equal(trap.x, boss.x);
          const draws = [];
          let translateX = 0, translateY = 0;
          const stack = [];
          game.ctx.save = () => stack.push([translateX, translateY]);
          game.ctx.restore = () => { [translateX, translateY] = stack.pop() || [0, 0]; };
          game.ctx.translate = (horizontal, vertical) => { translateX += horizontal; translateY += vertical; };
          game.ctx.setTransform = () => { translateX = 0; translateY = 0; stack.length = 0; };
          game.ctx.drawImage = (image, sourceX, sourceY, sourceWidth, sourceHeight, left, top, drawnWidth, drawnHeight) => {
            draws.push({ image, sourceWidth, left: left + translateX, top: top + translateY, width: drawnWidth, height: drawnHeight });
          };
          const phases = new Set();
          let previousSize = trap.size;
          let previousTop = -Infinity;
          for (let frame = 0; frame < 180 && game.trap; frame++) {
            draws.length = 0;
            game.drawTrap();
            phases.add(trap.phase);
            const device = draws.find((draw) => draw.image === game.atlas && draw.sourceWidth === ATLAS.trapOpen.w);
            const catchSprite = draws.find((draw) => draw.image === game.bosses && draw.sourceWidth === BOSSES.cell.w);
            assert.ok(device, 'the trap renders in every phase');
            if (trap.phase === 'fade') {
              assert.equal(catchSprite, undefined, 'no duplicate catch remains during fade');
            } else {
              assert.ok(catchSprite, 'the correct boss sheet renders during capture');
              assert.ok(Math.abs(catchSprite.left + catchSprite.width / 2 - trap.x) < 1, 'the catch stays on its capture centre line');
              if (partial) {
                assert.equal(boss.x, trap.x, 'the boss cannot walk away while the trap opens');
                assert.equal(game.ghostY(boss), height, 'the flight path stays frozen');
              }
              if (trap.phase === 'open') {
                assert.ok(Math.abs(catchSprite.left + catchSprite.width / 2 - device.left - device.width / 2) < 2, 'trap and boss share a centre line');
                assert.ok(catchSprite.top + catchSprite.height <= device.top, 'the lifted boss clears the trap');
              }
              if (trap.phase === 'suck') {
                assert.ok(catchSprite.width <= previousSize, 'the final catch shrinks');
                assert.ok(catchSprite.top >= previousTop, 'the final catch descends into the trap');
                previousSize = catchSprite.width;
                previousTop = catchSprite.top;
              }
            }
            step(1 / 60);
          }
          assert.equal(game.trap, undefined, 'the animation completes');
          assert.deepEqual([...phases], partial ? ['roll', 'open', 'fade'] : ['roll', 'open', 'suck', 'fade']);
        });
      }
    }
  }
}

test('a moving Terror Dog stays aligned until the trap opens before breaking free', () => {
  const { game, step, context } = setup();
  game.reducedMotion.matches = false;
  game.level = 4;
  game.activeBoss = context.exports.BOSS_ROSTER[1];
  game.spawnIn = 0;
  step(1 / 60);
  const boss = game.ghosts[0];
  boss.x = 430;
  boss.age = 1;
  boss.health = 0;
  game.pending = boss;
  const height = game.ghostY(boss);

  game.trapNow();
  assert.equal(boss.x, game.trap.x, 'deploying the trap must not move its target');
  assert.equal(game.trap.ghostY, height, 'the trap records the stunned height');
  game.pointerDown = true;
  game.angle = Math.atan2(height - game.origin.y, boss.x - game.origin.x);
  assert.notEqual(game.beamTarget(), boss, 'a held boss cannot be drained again');
  while (game.trap.phase !== 'fade') {
    assert.equal(boss.x, game.trap.x, 'the boss waits above the trap while it rolls and opens');
    assert.equal(game.ghostY(boss), height, 'its flight path stays frozen');
    step(1 / 60);
  }
  assert.ok(boss.x > game.trap.x, 'it recoils only after the trap opens');
  assert.equal(boss.stamina, 2);
});

for (const [slot, name] of [[1, 'Stay Puft'], [2, 'Terror Dog'], [3, 'Scoleri Brothers'], [4, 'Slime Serpent'], [5, 'Garaka']]) {
  for (const width of [360, 800]) {
    for (const reducedMotion of [false, true]) {
      test(`${name} encounter completes at width ${width}, reduced motion ${reducedMotion}`, () => {
        const { game, step, context } = setup();
        game.width = width;
        game.reducedMotion.matches = reducedMotion;
        const level = slot * 2;
        game.level = level;
        game.activeBoss = context.exports.BOSS_ROSTER[slot - 1];
        game.spawnIn = 0;
        step(1 / 60);
        const bosses = [...game.ghosts];
        const expectedTraps = bosses.reduce((total, boss) => total + boss.stamina, 0);
        let traps = 0;
        for (let frame = 0; frame < 3600 && game.level === level && game.mode === 'playing'; frame++) {
          let aimed = false;
          const targets = game.ghosts.filter((target) => target !== game.trap?.held && target !== game.pending)
            .sort((first, second) => first.health - second.health || first.x - second.x);
          for (const boss of targets) {
            game.angle = Math.atan2(game.ghostY(boss) - game.origin.y, boss.x - game.origin.x);
            if (game.beamTarget() === boss) { aimed = true; break; }
          }
          game.pointerDown = aimed;
          if (game.pending) {
            assert.ok(bosses.includes(game.pending), 'captures target the original bosses, not respawns');
            game.trapNow();
            traps++;
          }
          step(1 / 60);
        }
        assert.equal(traps, expectedTraps, 'each boss takes its configured number of traps');
        assert.equal(game.level, level + 1, `the level completes at width ${width}`);
        assert.equal(game.caught, bosses.length);
        assert.equal(game.lives, 3, 'no escape or boss respawn');
      });
    }
  }
}

test('boss shortcuts launch fresh encounters only when development testing is enabled', () => {
  const { game, step, node, context } = setup();
  game.hasAttribute = () => false;
  assert.equal(game.testBoss('1'), false);
  assert.equal(game.level, 1);
  game.hasAttribute = (name) => name === 'data-boss-testing';
  for (const key of ['0', '6', 'x', '', '1.5']) assert.equal(game.testBoss(key), false);
  game.ready = false;
  assert.equal(game.testBoss('1'), false);
  game.ready = true;
  for (const [key, sprites] of [['1', ['staypuft']], ['2', ['terrordog']], ['3', ['scoleriTall', 'scoleriFat']], ['4', ['slime']], ['5', ['garaka']]]) {
    game.pause(false);
    game.heat = 5;
    game.coolFor = 1;
    game.score = 99;
    game.keys.add(' ');
    game.pointerDown = true;
    game.trap = { phase: 'fade', t: 0, fromX: game.origin.x, x: 350, size: 80, ghostY: 150, appearance: 0 };
    game.pending = game.ghosts[0];
    assert.equal(game.testBoss(key), true);
    assert.equal(game.level, 1);
    assert.equal(game.activeBoss, context.exports.BOSS_ROSTER[Number(key) - 1]);
    assert.equal(game.mode, 'playing');
    assert.equal(game.score, 0);
    assert.equal(game.heat, 0);
    assert.equal(game.coolFor, 0);
    assert.equal(game.keys.size, 0);
    assert.equal(game.pointerDown, false);
    assert.equal(game.trap, undefined);
    assert.equal(game.pending, undefined);
    assert.equal(node('.trap').hidden, true);
    assert.equal(game.bossTesting, true);
    step(1 / 60);
    assert.deepEqual(Array.from(game.ghosts, (boss) => boss.boss.sprite), sprites);
  }
});

test('boss test scores are not saved, including after pause and resume', () => {
  const { game, storage, node } = setup();
  game.hasAttribute = () => true;
  game.testBoss('3');
  game.pause(false);
  game.start();
  assert.equal(game.bossTesting, true);
  game.score = 999;
  game.finish();
  assert.equal(game.best, 0);
  assert.equal(game.runs.length, 0);
  assert.equal(storage.size, 0);
  assert.equal(node('.share').hidden, true);
  game.start();
  assert.equal(game.level, 1);
  assert.equal(game.bossTesting, false);
  game.score = 2;
  game.finish();
  assert.equal(game.best, 2);
  assert.equal(game.runs.length, 1);
});

test('a boss breaks the first traps and only the last one sticks', () => {
  const { game, step, context } = setup();
  game.activeBoss = context.exports.BOSS_ROSTER[0];
  const boss = {
    x: 350, y: 150, phase: 0, age: 0, health: 0, speed: 0, appearance: 8, stamina: 3,
    boss: { spec: game.bossSpec, sprite: game.bossSpec.sprite, roar: 0 },
  };
  game.ghosts = [boss];
  game.pending = boss;

  game.trapNow();
  assert.equal(boss.stamina, 2, 'the first trap costs it a life');
  assert.equal(boss.health, 1, 'and it comes back at full health');
  assert.equal(game.ghosts.length, 1, 'still on the street');
  assert.equal(game.trapped, 0, 'the level quota is untouched');
  assert.equal(game.trap.partial, true, 'the trap plays its failed sequence');
  // The failed trap must never run the swallow phase.
  const phases = [];
  for (let i = 0; i < 300 && game.trap; i++) {
    if (phases[phases.length - 1] !== game.trap.phase) phases.push(game.trap.phase);
    step(1 / 60);
  }
  assert.deepEqual(phases, ['roll', 'open', 'fade']);

  game.pending = boss; boss.health = 0;
  game.trapNow();
  assert.equal(boss.stamina, 1);
  for (let i = 0; i < 300 && game.trap; i++) step(1 / 60);

  game.pending = boss; boss.health = 0;
  game.trapNow();
  assert.equal(game.ghosts.length, 0, 'the third trap takes it off the street');
  assert.equal(game.trapped, 1, 'and banks the level quota');
  assert.equal(game.trap.partial, undefined, 'this one is the real capture');
});

test('every third level hands back an escape, capped at three', () => {
  const { game } = setup();
  game.lives = 1;
  game.level = 3;
  game.advanceLevel();
  assert.equal(game.level, 3);
  assert.equal(game.lives, 1, 'the wave alone does not return an escape');
  game.advanceLevel();
  assert.equal(game.level, 4);
  assert.equal(game.lives, 2, 'clearing level 3 returns an escape');
  game.level = 6;
  game.advanceLevel();
  game.advanceLevel();
  assert.equal(game.lives, 3);
  game.level = 9;
  game.advanceLevel();
  game.advanceLevel();
  assert.equal(game.lives, 3, 'never more than three');
  game.lives = 2;
  game.level = 4;
  game.advanceLevel();
  game.advanceLevel();
  assert.equal(game.lives, 2, 'other levels hand nothing back');
});

test('a tough ghost takes longer to capture than a flimsy one, and pays more', () => {
  const flimsy = setup();
  const heldFlimsy = flimsy.catchOne(7); // classic sheet, grip 0.70
  const tough = setup();
  const heldTough = tough.catchOne(8); // Stay Puft, grip 2.40
  assert.ok(heldTough > heldFlimsy * 2.5, `Stay Puft (${heldTough}s) should far outlast the sheet (${heldFlimsy}s)`);
  assert.equal(flimsy.game.score, 2);
  assert.equal(tough.game.score, 5);
});

test('consecutive catches build a multiplier that an escape wipes out', () => {
  const { game, catchOne, ghost, step } = setup();
  assert.equal(game.multiplier, 1);
  for (let i = 0; i < 3; i++) catchOne(0);
  assert.equal(game.caught, 3);
  assert.equal(game.multiplier, 2, 'three in a row should double the payout');
  assert.equal(game.score, 3, 'the first three ghosts each score at 1x');
  catchOne(0);
  assert.equal(game.score, 5, 'the fourth catch pays double');
  game.ghosts = [ghost(0)];
  step(0.02);
  assert.equal(game.streak, 0, 'an escape resets the streak');
  assert.equal(game.multiplier, 1);
});

test('the stream throws sparks along its length, and only while firing', () => {
  const { game, step } = setup();
  game.reducedMotion.matches = false;
  game.angle = 0;
  step(0.5);
  assert.equal(game.sparks.length, 0, 'an idle stream makes no sparks');
  game.pointerDown = true;
  step(0.2);
  assert.ok(game.sparks.length > 0, 'a live stream should be throwing sparks');
  const origin = game.origin;
  for (const spark of game.sparks) {
    const along = (spark.x - origin.x) * Math.cos(game.angle) + (spark.y - origin.y) * Math.sin(game.angle);
    assert.ok(along > 0, 'sparks ride forward from the muzzle, never behind it');
    assert.ok(spark.frame >= 0 && spark.frame < 4, 'sparks must pick a real atlas cell');
    assert.ok(spark.size > 0 && spark.max > 0);
  }
});

test('reduced motion suppresses the spark shower', () => {
  const { game, step } = setup();
  game.reducedMotion.matches = true;
  game.angle = 0;
  game.pointerDown = true;
  step(0.5);
  assert.equal(game.sparks.length, 0);
});

test('springing the trap starts the roll-out and keeps the ghost for the animation', () => {
  const { game, drain } = setup();
  game.reducedMotion.matches = false;
  drain(8); // Stay Puft, the largest sprite
  const stunned = game.pending;
  game.trapNow();
  assert.equal(game.pending, undefined, 'the ghost is handed over to the trap');
  assert.equal(game.ghosts.length, 0, 'and leaves the active ghost list');
  assert.equal(game.trap.phase, 'roll');
  assert.equal(game.trap.x, stunned.x, 'the trap rolls out to where the ghost hangs');
  assert.ok(game.trap.fromX < game.trap.x, 'starting from under the car');
  assert.equal(game.trap.appearance, 8);
  assert.ok(game.sparks.length >= 12, 'springing the trap throws sparks');
});

test('the trap runs roll, open, suck and fade, then clears itself', () => {
  const { game, drain, step } = setup();
  drain(0);
  game.trapNow();
  const seen = [];
  for (let i = 0; i < 200 && game.trap; i++) {
    if (seen[seen.length - 1] !== game.trap.phase) seen.push(game.trap.phase);
    step(1 / 60);
  }
  assert.deepEqual(seen, ['roll', 'open', 'suck', 'fade']);
  assert.equal(game.trap, undefined, 'the trap clears once it has faded');
});

test('an ignored ghost shakes loose at partial health and comes on again', () => {
  const { game, drain, step, node } = setup();
  const held = drain(0);
  const stunned = game.pending;
  assert.equal(stunned.health, 0);
  step(2.6); // Longer than the stun window.
  assert.equal(game.pending, undefined, 'the stun should time out');
  assert.equal(game.trap, undefined, 'and no trap should have been sprung');
  assert.equal(game.score, 0, 'a ghost that shakes loose scores nothing');
  assert.ok(stunned.health > 0, 'it comes back with some health');
  assert.equal(node('.dispatch').textContent, 'It shook loose!');
});

test('only one ghost can be pinned at a time', () => {
  const { game, drain, ghost, step } = setup();
  drain(0);
  const first = game.pending;
  // A second ghost drained while the trap is occupied is held just short of zero.
  const second = ghost(360, 150, 7);
  game.ghosts = [first, second];
  game.angle = Math.atan2(second.y - game.origin.y, second.x - game.origin.x);
  game.pointerDown = true;
  step(1.5);
  assert.equal(game.pending, first, 'the first ghost keeps the trap');
  assert.ok(second.health > 0 && second.health < 0.05, 'the second is held on the ropes');
});

test('a pickup in the stream is collected and grants its effect', () => {
  const { game, step, node } = setup();
  const put = (kind, x = 350, y = 150) => {
    game.pickups = [{ x, y, phase: 0, kind }];
    game.angle = Math.atan2(y - game.origin.y, x - game.origin.x);
  };

  // A vent is a pre-emptive tool: grab it while the pack is hot but still firing. Once
  // a cooldown has started there is no stream to catch anything with.
  put('vent');
  game.heat = 4.2;
  game.pointerDown = true; step(1 / 30);
  assert.equal(game.pickups.length, 0, 'the stream should sweep it up');
  // A frame's worth may already have crept back on, since the trigger is still held.
  assert.ok(game.heat < 0.1, `venting should dump the heat, left ${game.heat}`);
  assert.equal(game.coolFor, 0);
  assert.equal(node('.dispatch').textContent, 'Pack vented');

  put('overcharge');
  step(1 / 30);
  assert.ok(game.overchargeFor > 9);
  const before = game.heat;
  step(1); // Still holding the trigger, but the pack must not cook.
  assert.ok(game.heat <= before + 0.01, `overcharge should stop heat building, went ${before} -> ${game.heat}`);

  put('slowmo');
  step(1 / 30);
  assert.ok(game.slowFor > 5);
});

test('a cooling pack has no stream, so it cannot collect', () => {
  const { game, step } = setup();
  game.pickups = [{ x: 350, y: 150, phase: 0, kind: 'vent' }];
  game.angle = Math.atan2(150 - game.origin.y, 350 - game.origin.x);
  game.coolFor = 0.9;
  game.pointerDown = true;
  step(1 / 30);
  assert.equal(game.pickups.length, 1, 'nothing is collected while the pack vents');
});

test('a pickup the stream misses drifts off and is dropped', () => {
  const { game, step } = setup();
  game.pickups = [{ x: 350, y: 60, phase: 0, kind: 'vent' }];
  game.angle = 0.1; // Aimed well away from it.
  game.pointerDown = true;
  step(1);
  assert.equal(game.pickups.length, 1, 'a missed pickup stays on the street');
  assert.equal(game.overchargeFor, 0);
  game.pointerDown = false;
  step(10); // Long enough to drift off the left edge.
  assert.equal(game.pickups.length, 0, 'and is dropped once it leaves');
});

test('boosts expire, and a fresh run clears them', () => {
  const { game, step } = setup();
  game.overchargeFor = 1; game.slowFor = 1;
  step(1.2);
  assert.equal(game.overchargeFor, 0);
  assert.equal(game.slowFor, 0);
  game.overchargeFor = 8; game.slowFor = 5; game.pickups = [{ x: 1, y: 1, phase: 0, kind: 'vent' }];
  game.mode = 'over';
  game.start();
  assert.equal(game.overchargeFor, 0);
  assert.equal(game.slowFor, 0);
  assert.equal(game.pickups.length, 0);
});

test('leaning on the trigger overheats the pack and cuts the stream', () => {
  const { game, step, node } = setup();
  game.pointerDown = true;
  step(4.9);
  assert.equal(game.firing, true, 'still firing just under the limit');
  assert.equal(game.coolFor, 0);
  assert.ok(game.heatWarning > 0, 'and already flashing a warning');
  step(0.3);
  assert.equal(game.firing, false, 'the stream cuts out at the limit');
  assert.ok(game.coolFor > 0, 'and the pack goes into cooldown');
  assert.equal(node('.dispatch').textContent, 'Pack overheated!');
});

test('the pack comes back after the cooldown, even with the trigger still held', () => {
  const { game, step, node } = setup();
  game.pointerDown = true;
  step(5.1);
  assert.equal(game.firing, false);
  step(1.1); // Ride out the one-second cooldown without letting go.
  assert.equal(game.coolFor, 0, 'the cooldown expires');
  assert.equal(game.firing, true, 'so a held trigger fires again');
  // Heat was zeroed when the pack came back; it is only rebuilding from the held trigger.
  assert.ok(game.heat < 0.5, `heat should have reset, was ${game.heat}`);
  assert.equal(node('.dispatch').textContent, 'Pack back online');
});

test('heat bleeds off between bursts, so disciplined firing never overheats', () => {
  const { game, step } = setup();
  for (let i = 0; i < 6; i++) {
    game.pointerDown = true; step(1.2);
    game.pointerDown = false; step(1.2);
  }
  assert.equal(game.coolFor, 0, 'short bursts should never cook the pack');
  assert.ok(game.heat < 1, `heat should have bled off, was ${game.heat}`);
});

test('a venting pack trails smoke from the gun', () => {
  const { game, step } = setup();
  game.reducedMotion.matches = false;
  game.pointerDown = true;
  step(5.1);
  step(0.3);
  assert.ok(game.puffs.length > 0, 'the vent should be smoking');
  const origin = game.origin;
  for (const puff of game.puffs) {
    assert.ok(puff.vy < 0 || puff.y < origin.y, 'smoke rises from the gun');
    assert.ok(puff.frame >= 0 && puff.frame < 8, 'and uses a real smoke cell');
  }
  game.pointerDown = false;
  step(1.5);
  assert.equal(game.puffs.length, 0, 'and clears once it has drifted away');
});

test('starting a fresh run clears any heat left from the last one', () => {
  const { game, step } = setup();
  game.pointerDown = true;
  step(5.1);
  assert.ok(game.coolFor > 0);
  game.pointerDown = false;
  game.mode = 'over';
  game.start();
  assert.equal(game.heat, 0);
  assert.equal(game.coolFor, 0);
  assert.equal(game.puffs.length, 0);
});

test('all beam layers share one unbroken path from muzzle to nearest ghost', () => {
  const { game, ghost } = setup();
  const origin = game.origin;
  game.angle = 0;
  game.ghosts = [ghost(origin.x + 200, origin.y), ghost(origin.x + 100, origin.y)];
  const paths = []; let points = [];
  game.ctx.beginPath = () => { points = []; };
  game.ctx.moveTo = (x, y) => { points.push([x, y]); };
  game.ctx.lineTo = (x, y) => { points.push([x, y]); };
  game.ctx.stroke = () => { paths.push([...points]); };
  game.drawStream(true);
  assert.equal(paths.length, 3);
  assert.deepEqual(paths[0], paths[1]); assert.deepEqual(paths[1], paths[2]);
  assert.deepEqual(paths[0][0], [0, 0]);
  assert.deepEqual(paths[0].at(-1), [100, 0]);
  for (let i = 1; i < paths[0].length; i++) {
    assert.ok(paths[0][i][0] - paths[0][i - 1][0] <= 3);
  }
});

test('the street tiles across the canvas and scrolls slower than the road', () => {
  const { game, context } = setup();
  const { BACKDROP } = context.exports;
  game.reducedMotion.matches = false;
  const drawsAt = (elapsed) => {
    const seen = [];
    game.elapsed = elapsed;
    game.ctx.drawImage = (_image, sx, sy, sw, sh, dx, dy, dw, dh) => {
      if (sw === BACKDROP.width) seen.push({ sy, dx, dy, dh });
    };
    game.draw();
    return seen;
  };
  const still = drawsAt(0);
  assert.ok(still.length >= 1);
  assert.equal(still[0].sy, BACKDROP.night.y, 'the dark theme draws the night street');
  // It must overfill the canvas above the kerb, or bare sky shows above the rooftops.
  assert.ok(still[0].dy <= 0, `the street should reach the top of the canvas, sat at ${still[0].dy}`);
  assert.ok(still[0].dy + still[0].dh >= 258, 'and reach down to the kerb');

  const later = drawsAt(1);
  assert.equal(later[0].dx, -19, 'the street creeps');
  assert.ok(Math.abs(later[0].dx) < 65, 'slower than the road markings');

  // Once drifted past a tile width, a second copy covers the gap it leaves behind.
  const wrapped = drawsAt(40);
  assert.ok(wrapped.length > 1, 'the street should repeat across the canvas');

  game.dark = false;
  assert.equal(drawsAt(0)[0].sy, BACKDROP.day.y, 'the light theme draws the day street');

  game.dark = true;
  game.reducedMotion.matches = true;
  // Loose equality on purpose: a zero drift rounds to -0, which is still no movement.
  for (const draw of drawsAt(30)) assert.ok(draw.dx === 0, 'reduced motion holds the city still');
});

test('every trap frame is centred on its chassis, with no neighbour bleeding in', () => {
  const sharp = require('sharp');
  const { context } = setup();
  const { ATLAS, BACKDROP } = context.exports;
  return (async () => {
    for (const [name, row] of [['closed', ATLAS.trapClosed], ['open', ATLAS.trapOpen]]) {
      const centres = [];
      for (let frame = 0; frame < row.frames; frame++) {
        const { data, info } = await sharp('public/assets/ghost-patrol/atlas.png')
          .extract({ left: row.x + frame * row.w, top: row.y, width: row.w, height: row.h })
          .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let weight = 0, sum = 0, opaque = 0;
        // Sample only the chassis band. Higher up, the growing light beam would drag the
        // centre of mass around and say nothing about how the frames line up.
        const chassisTop = Math.round(info.height * 0.58);
        for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels;
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          if (a < 200) continue;
          opaque++;
          // Weigh only the dark metal body: the smoke and beam are deliberately lopsided.
          if (y >= chassisTop && !(r > 165 && g > 165 && b > 165)) { sum += x; weight++; }
        }
        assert.ok(opaque > 800, `${name} frame ${frame} should hold real artwork`);
        centres.push(sum / weight);
      }
      const mid = row.w / 2;
      for (const [frame, centre] of centres.entries()) {
        assert.ok(Math.abs(centre - mid) < 12,
          `${name} frame ${frame} sits at ${centre.toFixed(1)}, off the ${mid} centre line — a neighbour may be bleeding in`);
      }
      const spread = Math.max(...centres) - Math.min(...centres);
      assert.ok(spread < 10, `${name} chassis wanders ${spread.toFixed(1)}px across frames; the animation would jitter`);
    }
  })();
});

test('the Slime Serpent beam-hit frame contains no disconnected neighbouring artwork', async () => {
  const sharp = require('sharp');
  const { game, context, ghost } = setup();
  const { BOSSES, BOSS_ROSTER } = context.exports;
  const spec = BOSS_ROSTER.find((boss) => boss.sprite === 'slime');
  const target = { ...ghost(), boss: { spec, sprite: spec.sprite, roar: 0 } };
  game.lastTarget = target;
  const frame = game.bossFrame(target);
  assert.equal(frame, 5);
  const { data, info } = await sharp('public/assets/ghost-patrol/bosses.webp')
    .extract({ left: (frame % BOSSES.cell.cols) * BOSSES.cell.w, top: BOSSES.slime.y + Math.floor(frame / BOSSES.cell.cols) * BOSSES.cell.h, width: BOSSES.cell.w, height: BOSSES.cell.h })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height);
  const sizes = [];
  for (let pixel = 0; pixel < seen.length; pixel++) {
    if (seen[pixel] || data[pixel * info.channels + 3] <= 24) continue;
    const stack = [pixel];
    seen[pixel] = 1;
    let size = 0;
    while (stack.length) {
      const current = stack.pop();
      size++;
      const column = current % info.width, row = Math.floor(current / info.width);
      for (let vertical = -1; vertical <= 1; vertical++) for (let horizontal = -1; horizontal <= 1; horizontal++) {
        const nextColumn = column + horizontal, nextRow = row + vertical;
        if (nextColumn < 0 || nextColumn >= info.width || nextRow < 0 || nextRow >= info.height) continue;
        const next = nextRow * info.width + nextColumn;
        if (seen[next] || data[next * info.channels + 3] <= 24) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    sizes.push(size);
  }
  assert.ok(Math.max(...sizes) > 3000, 'the serpent itself remains visible');
  assert.equal(sizes.filter((size) => size > 16).length, 1, 'no substantial fragments from the adjacent attack pose remain');
});

test('finishing a run banks it in the local top five, best first', () => {
  const { game, node, storage, ghost, step } = setup();
  const finish = (score, level) => {
    game.mode = 'playing';
    game.score = score; game.level = level; game.lives = 1;
    game.ghosts = [ghost(0)];
    step(0.02);
    assert.equal(game.mode, 'over');
  };
  finish(12, 3);
  finish(40, 6);
  finish(25, 4);
  const saved = JSON.parse(storage.get('ghost-patrol-runs'));
  assert.deepEqual(saved.map((r) => r.score), [40, 25, 12], 'runs are kept best first');
  assert.equal(saved[0].level, 6);
  assert.ok(saved.every((r) => Number.isFinite(r.at)), 'each run is stamped');
  // The card lists them, marking the one just played.
  const list = node('[data-runs]');
  assert.equal(list.hidden, false);
  assert.deepEqual(list.children.map((li) => li.textContent), ['40 pts · level 6', '25 pts · level 4', '12 pts · level 3']);
  // The run just played was 25 / level 4, which sorts second.
  assert.equal(list.children[1].attributes['data-latest'], '');
});

test('the top five never grows past five, and junk in storage is ignored', () => {
  const { game, storage, ghost, step } = setup();
  for (let i = 1; i <= 8; i++) {
    game.mode = 'playing';
    game.score = i * 10; game.level = i; game.lives = 1;
    game.ghosts = [ghost(0)];
    step(0.02);
  }
  const saved = JSON.parse(storage.get('ghost-patrol-runs'));
  assert.equal(saved.length, 5);
  assert.deepEqual(saved.map((r) => r.score), [80, 70, 60, 50, 40]);

  // readRuns builds its arrays inside the vm, so compare by value across the realms.
  const parsed = () => JSON.parse(JSON.stringify(game.readRuns()));
  storage.set('ghost-patrol-runs', '{"not":"an array"}');
  assert.deepEqual(parsed(), []);
  storage.set('ghost-patrol-runs', '[{"score":"nope"},{"score":9,"level":2,"at":1}]');
  assert.deepEqual(parsed(), [{ score: 9, level: 2, at: 1 }]);
  storage.set('ghost-patrol-runs', 'not json at all');
  assert.deepEqual(parsed(), []);
});

test('a run still finishes when storage is unavailable', () => {
  const { game, ghost, step } = setup(true);
  game.score = 5; game.lives = 1;
  game.ghosts = [ghost(0)];
  step(0.02);
  assert.equal(game.mode, 'over', 'the game must not fall over without storage');
});

test('the cabinet opts out of touch text selection', () => {
  // Holding the trigger is a long press on a phone. Without these, iOS starts selecting
  // the HUD text and drops its Copy / Look Up callout on top of the game.
  const component = fs.readFileSync('src/components/Ecto1.astro', 'utf8');
  for (const rule of ['-webkit-touch-callout: none', '-webkit-user-select: none', 'user-select: none']) {
    assert.ok(component.includes(rule), `the game shell should set ${rule}`);
  }
});

test('the boss sheet on disk matches the BOSSES constants', () => {
  const { context } = setup();
  const { BOSSES } = context.exports;
  const buffer = fs.readFileSync('public/assets/ghost-patrol/bosses.webp');
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(buffer.subarray(8, 12).toString('ascii'), 'WEBP');
  const groups = ['staypuft', 'terrordog', 'scoleriTall', 'scoleriFat', 'slime', 'garaka'];
  const rowsPer = BOSSES.cell.h * 2; // every group is two rows of four frames
  groups.forEach((name, index) => {
    assert.equal(BOSSES[name].y, index * rowsPer, `${name} should start at row ${index * 2}`);
  });
  assert.equal(BOSSES.height, groups.length * rowsPer, 'the sheet ends after the last group');
  assert.equal(BOSSES.width, BOSSES.cell.w * BOSSES.cell.cols);
  const packer = fs.readFileSync('scripts/build-ghost-patrol-assets.mjs', 'utf8');
  assert.match(packer, new RegExp(`const BOSS_CELL = \\{ w: ${BOSSES.cell.w}, h: ${BOSSES.cell.h} \\}`));
});

test('the atlas constants match the packed sprite sheet on disk', () => {
  const { context } = setup();
  const { ATLAS, BACKDROP } = context.exports;
  const png = fs.readFileSync('public/assets/ghost-patrol/atlas.png');
  assert.equal(png.readUInt32BE(16), ATLAS.width, 'atlas.png width must match ATLAS.width');
  assert.equal(png.readUInt32BE(20), ATLAS.height, 'atlas.png height must match ATLAS.height');
  // Rows are stacked: car, then three ghost rows, then the smoke strip.
  assert.equal(ATLAS.ghost.y, ATLAS.car.y + ATLAS.car.h);
  assert.equal(ATLAS.trapClosed.y, ATLAS.ghost.y + ATLAS.ghost.h * 3);
  assert.equal(ATLAS.trapOpen.y, ATLAS.trapClosed.y + ATLAS.trapClosed.h);
  assert.equal(ATLAS.smoke.y, ATLAS.trapOpen.y + ATLAS.trapOpen.h);
  assert.equal(ATLAS.pickup.y, ATLAS.smoke.y + ATLAS.smoke.h);
  assert.equal(ATLAS.height, ATLAS.pickup.y + ATLAS.pickup.h * 3);
  assert.ok(ATLAS.pickup.w * ATLAS.pickup.cols <= ATLAS.width, 'the pickup grid must fit the atlas');
  assert.ok(ATLAS.smoke.w * ATLAS.smoke.frames <= ATLAS.width, 'the smoke strip must fit one row');
  for (const row of [ATLAS.trapClosed, ATLAS.trapOpen]) {
    assert.ok(row.w * row.frames <= ATLAS.width, 'each trap strip must fit one row');
  }
  assert.ok(ATLAS.ghost.w * ATLAS.ghost.columns <= ATLAS.width, 'the ghost grid must fit the atlas');
  // The effect cells share the car's row; none of them may overlap it or each other.
  assert.equal(ATLAS.burst.x, ATLAS.car.x + ATLAS.car.w);
  assert.equal(ATLAS.spark.x, ATLAS.burst.x + ATLAS.burst.w);
  assert.ok(ATLAS.spark.x + ATLAS.spark.w * ATLAS.spark.frames <= ATLAS.width, 'the spark strip must fit its row');
  for (const cell of [ATLAS.burst, ATLAS.spark]) {
    assert.ok(cell.y + cell.h <= ATLAS.car.h, 'effect cells must stay inside the car row');
  }
  // Both street strips must keep the same number of rows above the kerb, or the ground
  // the car sits on would jump when the theme is toggled.
  const packer = fs.readFileSync('scripts/build-ghost-patrol-assets.mjs', 'utf8');
  assert.equal(BACKDROP.night.h, BACKDROP.day.h);
  assert.equal(BACKDROP.day.y, BACKDROP.night.y + BACKDROP.night.h);
  assert.equal(BACKDROP.height, BACKDROP.day.y + BACKDROP.day.h);
  assert.match(packer, new RegExp(`const BACKDROP_ROWS_ABOVE_KERB = ${BACKDROP.night.h};`));
  assert.match(packer, new RegExp(`const BACKDROP_WIDTH = ${BACKDROP.width};`));
  // The packer is the other half of this contract; keep its cell sizes in step.
  assert.match(packer, new RegExp(`const CAR = \\{ w: ${ATLAS.car.w}, h: ${ATLAS.car.h} \\}`));
  assert.match(packer, new RegExp(`const GHOST = \\{ w: ${ATLAS.ghost.w}, h: ${ATLAS.ghost.h}, columns: ${ATLAS.ghost.columns}`));
  assert.match(packer, new RegExp(`const BURST = \\{ w: ${ATLAS.burst.w}, h: ${ATLAS.burst.h} \\}`));
  assert.match(packer, new RegExp(`const SPARK = \\{ w: ${ATLAS.spark.w}, h: ${ATLAS.spark.h}, frames: ${ATLAS.spark.frames} \\}`));
  assert.match(packer, new RegExp(`const TRAP = \\{ w: ${ATLAS.trapClosed.w}, h: ${ATLAS.trapClosed.h}, frames: ${ATLAS.trapClosed.frames} \\}`));
  assert.match(packer, new RegExp(`const SMOKE = \\{ w: ${ATLAS.smoke.w}, h: ${ATLAS.smoke.h}, frames: ${ATLAS.smoke.frames} \\}`));
});
