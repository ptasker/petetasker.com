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
    Image: class { naturalWidth = 1024; naturalHeight = 1040; }, AbortController,
    window: { matchMedia: () => ({ matches: true }) },
    document: { documentElement: { classList: { contains: () => true } } },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    localStorage: { setItem(key, value) { if (storageFails) throw Error('Storage denied'); storage.set(key, value); } },
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
  game.overlay = node('.overlay'); game.startButton = node('.start');
  game.levelBanner = node('.level-up');
  game.ready = true;
  game.start();
  game.spawnIn = 100;
  const step = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) game.tick(game.last + 1000 / 60);
  };
  const ghost = (x = 350, y = 150, appearance = 0) => ({ x, y, phase: 0, health: 1, speed: 0, appearance });
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
  return { game, node, storage, step, ghost, drain, catchOne, context };
}

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

test('clearing the quota advances the level and speeds the ghosts up', () => {
  const { game, drain, step } = setup();
  assert.equal(game.level, 1);
  assert.equal(game.quota, 5);
  const firstSpeed = game.levelSpeed;
  const needed = game.quota; // Read once: the getter grows the moment the level ticks over.
  for (let i = 0; i < needed; i++) {
    drain(0);
    game.trapNow();
    // Run the trap animation out; the quota only banks once it finishes.
    for (let f = 0; f < 200 && game.trap; f++) step(1 / 60);
  }
  assert.equal(game.level, 2, 'the level should tick over');
  assert.equal(game.trapped, 0, 'and the quota counter resets');
  assert.equal(game.quota, 6, 'with one more ghost asked for');
  assert.ok(game.levelSpeed > firstSpeed, 'ghosts get faster each level');
  assert.ok(game.interlude > 0, 'a level card holds play briefly');
  assert.equal(game.ghosts.length, 0, 'the street is cleared between levels');
});

test('a spawned ghost carries the level speed multiplier', () => {
  const { game, step } = setup();
  game.ghosts = []; game.spawnIn = 0;
  step(0.02);
  const first = game.ghosts[0].speed / TRAITS_SPEED(game.ghosts[0].appearance);
  assert.equal(game.levelSpeed, 1, 'opening level keeps its base speed');
  game.level = 6;
  game.ghosts = []; game.spawnIn = 0;
  step(0.02);
  const later = game.ghosts[0].speed / TRAITS_SPEED(game.ghosts[0].appearance);
  assert.ok(Math.abs(later / first - 1.7) < 1e-8, 'level 6 adds five 14-percent base-speed increases');
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

test('every third level hands back an escape, capped at three', () => {
  const { game } = setup();
  game.lives = 1;
  game.level = 3;
  game.advanceLevel();
  assert.equal(game.level, 4);
  assert.equal(game.lives, 2, 'clearing level 3 returns an escape');
  game.level = 6;
  game.advanceLevel();
  assert.equal(game.lives, 3);
  game.level = 9;
  game.advanceLevel();
  assert.equal(game.lives, 3, 'never more than three');
  game.lives = 2;
  game.level = 4;
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

test('the cabinet opts out of touch text selection', () => {
  // Holding the trigger is a long press on a phone. Without these, iOS starts selecting
  // the HUD text and drops its Copy / Look Up callout on top of the game.
  const component = fs.readFileSync('src/components/Ecto1.astro', 'utf8');
  for (const rule of ['-webkit-touch-callout: none', '-webkit-user-select: none', 'user-select: none']) {
    assert.ok(component.includes(rule), `the game shell should set ${rule}`);
  }
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
  assert.equal(ATLAS.height, ATLAS.smoke.y + ATLAS.smoke.h);
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
