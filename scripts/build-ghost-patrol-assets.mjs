// Rebuilds public/assets/ghost-patrol/atlas.png from the source art in art/ghost-patrol/.
// The source sheets are loose 1536x1024 layouts; this packs the sprites the game actually
// draws into one small atlas with uniform cells, so the game needs a single request and
// the runtime never has to know where anything sat on the original sheets.
//
//   node scripts/build-ghost-patrol-assets.mjs
//
// The cell geometry below is mirrored by ATLAS in src/scripts/ghost-patrol.ts; the test
// suite asserts the two agree and that the built atlas matches these dimensions.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SHEET = 'art/ghost-patrol/sheet-source.png';   // car, ghosts, beam effects
const TRAP_SHEET = 'art/ghost-patrol/trap-source.png'; // ghost trap, opening sequence
const BACKDROP_SHEET = 'art/ghost-patrol/backdrop-source.png'; // day / night city, in four strips
const OUT = 'public/assets/ghost-patrol/atlas.png';
const BACKDROP_OUT = 'public/assets/ghost-patrol/backdrop.webp';

// Cells are sized for the largest the game ever draws a sprite: a 2x device-pixel-ratio
// screen at the widest layout, with a little headroom.
const CAR = { w: 512, h: 200 };
const BURST = { w: 192, h: 192 };
const SPARK = { w: 48, h: 48, frames: 4 };
const GHOST = { w: 192, h: 192, columns: 4, rows: 3 };
const TRAP = { w: 160, h: 132, frames: 6 };
const SMOKE = { w: 96, h: 72, frames: 8 };
const WIDTH = 1024;
const TRAP_CLOSED_Y = CAR.h + GHOST.h * GHOST.rows;
const TRAP_OPEN_Y = TRAP_CLOSED_Y + TRAP.h;
const SMOKE_Y = TRAP_OPEN_Y + TRAP.h;
const HEIGHT = SMOKE_Y + SMOKE.h;

// Hand-picked effect sprites from the first sheet's two proton-beam bands. These are
// single art assets rather than a grid, so they are addressed by explicit source
// rectangles; main() checks each one still holds the artwork it is supposed to.
const BURST_SOURCE = { x: 1361, y: 802, w: 108, h: 98 };
const SPARK_SOURCE = [
  { x: 960, y: 830, w: 31, h: 37 },
  { x: 904, y: 844, w: 26, h: 29 },
  { x: 919, y: 807, w: 23, h: 24 },
  { x: 994, y: 803, w: 20, h: 20 },
];

// The trap sheet's two animations are NOT on an even grid: the trap rolls a little
// further right in each frame, and its smoke plume can pass behind the neighbouring
// frame. Frames are therefore found by locating each trap body, then masked so no part
// of an adjacent frame can bleed in. TRAP_BAND is the full slice kept per row, so the
// open row's light beam survives; `anchor` is the band used to centre each frame. That
// band is chosen to sit across the trap's box, clear of both the pipe above and the
// exhaust plume below, whose dark outline would otherwise drag the anchor sideways as it
// grows. Both rows land on the same centre, so closed->open does not jump.
const TRAP_ROWS = {
  closed: { band: [78, 228], anchor: [132, 178] },
  open: { band: [246, 451], anchor: [360, 435] },
};
const TRAP_SCALE = 0.55;
const TRAP_MARGIN = 14;

/**
 * The backdrop sheet holds four horizontally-tiling strips: a distant skyline and a
 * street, for night and for day. Only the street strips are packed. The skyline strips
 * cannot sit behind them: the street art is fully opaque, including its own sky, so a
 * layer behind it would never show, and butting the two together leaves a hard seam
 * where two different blues meet. Each street strip already carries its own sky and
 * distant city, so it stands alone as the whole scene.
 *
 * Both are cut to the same number of rows above their kerb line, so the ground the car
 * sits on does not shift when the theme is toggled, and both edges are trimmed clear of
 * the sheet's white gutters, which would otherwise draw as a pale seam.
 */
const BACKDROP_ROWS_ABOVE_KERB = 272;
const BACKDROP_STRIPS = [
  { name: 'night', top: 186, height: BACKDROP_ROWS_ABOVE_KERB },
  { name: 'day', top: 684, height: BACKDROP_ROWS_ABOVE_KERB },
];
const BACKDROP_WIDTH = 1536;

// Regions of the first sheet we take sprites from. The two beam bands are deliberately
// skipped: the proton stream is drawn procedurally so it can be any length or angle.
const REGIONS = {
  cars: { x: 0, y: 0, w: 760, h: 660 },
  ghosts: { x: 757, y: 0, w: 779, h: 665 },
  smoke: { x: 0, y: 900, w: 1536, h: 124 },
};

/** 8-way connected components over non-transparent pixels inside a region. */
function components(data, W, C, region) {
  const { x: x0, y: y0, w, h } = region;
  const x1 = x0 + w, y1 = y0 + h;
  const alpha = (x, y) => data[(y * W + x) * C + 3];
  const seen = new Set(), out = [], stack = [];
  for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
    const si = sy * W + sx;
    if (seen.has(si) || alpha(sx, sy) <= 24) continue;
    let minx = sx, maxx = sx, miny = sy, maxy = sy, n = 0;
    seen.add(si); stack.push(si);
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0; n++;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
        const ni = ny * W + nx;
        if (!seen.has(ni) && alpha(nx, ny) > 24) { seen.add(ni); stack.push(ni); }
      }
    }
    out.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, n });
  }
  return out;
}

const boxGap = (a, b) => Math.hypot(
  Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))),
  Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))),
);

/**
 * Raw RGBA for a source rectangle with everything except its largest connected component
 * erased. The blue impact star has loose sparks sitting inside its bounding box; cropping
 * alone would drag them along and clip them at the cell edge.
 */
function isolate(data, W, C, rect) {
  const { x: x0, y: y0, w, h } = rect;
  const label = new Int32Array(w * h).fill(-1);
  const alpha = (x, y) => data[((y0 + y) * W + (x0 + x)) * C + 3];
  let best = -1, bestSize = 0, next = 0;
  const stack = [];
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
    if (label[sy * w + sx] !== -1 || alpha(sx, sy) <= 24) continue;
    const id = next++;
    let size = 0;
    label[sy * w + sx] = id; stack.push(sy * w + sx);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0; size++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (label[ni] === -1 && alpha(nx, ny) > 24) { label[ni] = id; stack.push(ni); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const src = ((y0 + y) * W + (x0 + x)) * C, dst = (y * w + x) * 4;
    out[dst] = data[src]; out[dst + 1] = data[src + 1]; out[dst + 2] = data[src + 2];
    out[dst + 3] = label[y * w + x] === best ? data[src + 3] : 0;
  }
  return { data: out, info: { width: w, height: h, channels: 4 } };
}

/**
 * Components above `minPixels` are sprites. When `reach` is set, smaller detached bits
 * (Slimer's slime, the fire skull's embers) are folded into the nearest sprite instead of
 * being dropped. Rows are read top-to-bottom, then left-to-right within a row.
 */
function sprites(all, minPixels, reach) {
  const found = all.filter((c) => c.n >= minPixels).map((c) => ({ ...c }));
  if (reach) {
    for (const bit of all.filter((c) => c.n < minPixels)) {
      let best = null, bestGap = Infinity;
      for (const sprite of found) {
        const d = boxGap(bit, sprite);
        if (d < bestGap) { bestGap = d; best = sprite; }
      }
      if (best && bestGap <= reach) {
        const x = Math.min(best.x, bit.x), y = Math.min(best.y, bit.y);
        best.w = Math.max(best.x + best.w, bit.x + bit.w) - x;
        best.h = Math.max(best.y + best.h, bit.y + bit.h) - y;
        best.x = x; best.y = y;
      }
    }
  }
  const rowOf = (c) => Math.round((c.y + c.h / 2) / 180);
  return found.sort((a, b) => rowOf(a) - rowOf(b) || a.x - b.x);
}

async function main() {
  const { data, info } = await sharp(SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, channels: C } = info;

  const cars = sprites(components(data, W, C, REGIONS.cars), 20000, 40);
  const ghosts = sprites(components(data, W, C, REGIONS.ghosts), 8000, 46);
  // Smoke keeps no stray bits: the loose dots between puffs belong to other frames, and
  // folding them in would smear the growth sequence the overheat plume animates through.
  const smoke = sprites(components(data, W, C, REGIONS.smoke), 3000, 0);

  if (smoke.length !== SMOKE.frames) throw new Error(`Expected ${SMOKE.frames} smoke puffs, found ${smoke.length}`);
  if (cars.length !== 2) throw new Error(`Expected 2 car poses, found ${cars.length}`);
  if (ghosts.length !== GHOST.columns * GHOST.rows) throw new Error(`Expected 12 ghosts, found ${ghosts.length}`);

  // Each effect rect must actually contain art, or a shifted source sheet would quietly
  // pack empty cells and the game would fire invisible sparks.
  const opaque = (rect) => {
    let n = 0;
    for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (data[(y * W + x) * C + 3] > 24) n++;
    }
    return n;
  };
  for (const [name, rect] of [['burst', BURST_SOURCE], ...SPARK_SOURCE.map((r, i) => [`spark ${i}`, r])]) {
    const filled = opaque(rect) / (rect.w * rect.h);
    if (filled < 0.15) throw new Error(`Effect sprite "${name}" is ${Math.round(filled * 100)}% filled; the source sheet may have moved`);
  }

  // The sheet's first car pose trails a proton stream baked into the art. The game draws
  // its own stream at whatever angle the player is aiming, so take the clean second pose.
  // Both poses carry their exhaust smoke in the sprite, so the game draws none of its own.
  const car = cars[1];

  const trap = await sharp(TRAP_SHEET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const TW = trap.info.width, TC = trap.info.channels;
  const trapAlpha = (x, y) => trap.data[(y * TW + x) * TC + 3];

  /**
   * Label the solid trap bodies in a row. A high alpha cut is essential: the soft glow
   * and the light beam would otherwise bridge every frame into one blob.
   */
  function trapBodies([y0, y1]) {
    const labels = new Map();
    const found = [], stack = [];
    for (let sy = y0; sy < y1; sy++) for (let sx = 0; sx < TW; sx++) {
      const key = sy * TW + sx;
      if (labels.has(key) || trapAlpha(sx, sy) <= 200) continue;
      const id = found.length;
      let minx = sx, maxx = sx, n = 0;
      labels.set(key, id); stack.push(key);
      while (stack.length) {
        const i = stack.pop(), x = i % TW, y = (i / TW) | 0; n++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < y0 || nx >= TW || ny >= y1) continue;
          const nk = ny * TW + nx;
          if (!labels.has(nk) && trapAlpha(nx, ny) > 200) { labels.set(nk, id); stack.push(nk); }
        }
      }
      found.push({ id, x: minx, w: maxx - minx + 1, n });
    }
    const bodies = found.filter((b) => b.n >= 4000).sort((a, b) => a.x - b.x);
    if (bodies.length !== TRAP.frames) {
      throw new Error(`Expected ${TRAP.frames} trap bodies, found ${bodies.length}; the trap sheet may have moved`);
    }
    return { bodies, labels };
  }

  /**
   * Centre of a frame's chassis within its own masked pixels. This must read the masked
   * frame, not the sheet: bodies overlap, so on the raw sheet a neighbour's wheels fall
   * inside this frame's bounds and drag the anchor sideways. Near-white smoke is skipped
   * so the anchor holds steady while the plume grows.
   */
  function chassisCentre(pixels, w, [y0, y1]) {
    let min = Infinity, max = -Infinity;
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (pixels[i + 3] > 200 && !(r > 165 && g > 165 && b > 165)) {
        if (x < min) min = x; if (x > max) max = x;
      }
    }
    return max < 0 ? w / 2 : (min + max) / 2;
  }

  /** One row of trap frames, masked clean and centred on the chassis. */
  function trapLayers(row, originY) {
    const [bandTop, bandBottom] = row.band;
    const { bodies, labels } = trapBodies(row.band);
    // Only the six trap bodies count as foreign. The beam's sparkle stars are opaque
    // enough to label as components of their own, and erasing those punches holes in it.
    const bodyIds = new Set(bodies.map((b) => b.id));
    return bodies.map((body, i) => {
      // Take the whole body plus a margin for its smoke and glow. Neighbouring frames
      // can overlap here, which is fine: the mask below removes anything that is theirs.
      const left = Math.max(0, body.x - TRAP_MARGIN);
      const right = Math.min(TW, body.x + body.w + TRAP_MARGIN);
      const w = Math.round(right) - Math.round(left), h = bandBottom - bandTop;
      const x0 = Math.round(left);
      const pixels = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = x0 + x, sy = bandTop + y;
        // Drop anything belonging to another frame's body, plus a 3px skirt of its glow.
        let foreign = false;
        for (let dy = -3; dy <= 3 && !foreign; dy++) for (let dx = -3; dx <= 3; dx++) {
          const nx = sx + dx, ny = sy + dy;
          if (nx < 0 || ny < bandTop || nx >= TW || ny >= bandBottom) continue;
          const label = labels.get(ny * TW + nx);
          if (label !== undefined && label !== body.id && bodyIds.has(label)) { foreign = true; break; }
        }
        const src = (sy * TW + sx) * TC, dst = (y * w + x) * 4;
        pixels[dst] = trap.data[src]; pixels[dst + 1] = trap.data[src + 1]; pixels[dst + 2] = trap.data[src + 2];
        pixels[dst + 3] = foreign ? 0 : trap.data[src + 3];
      }
      const anchorBand = [row.anchor[0] - bandTop, row.anchor[1] - bandTop];
      return { pixels, w, h, anchor: chassisCentre(pixels, w, anchorBand), index: i, originY };
    });
  }

  /** Scale a masked frame and drop it in its cell, chassis centred and sitting on the floor. */
  async function packTrap(frames, cell) {
    return Promise.all(frames.map(async (frame) => {
      const w = Math.max(1, Math.round(frame.w * TRAP_SCALE)), h = Math.max(1, Math.round(frame.h * TRAP_SCALE));
      if (w > cell.w) throw new Error(`Trap frame ${frame.index} is ${w}px wide, wider than its ${cell.w}px cell`);
      const input = await sharp(frame.pixels, { raw: { width: frame.w, height: frame.h, channels: 4 } })
        .resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
      return {
        input,
        left: frame.index * cell.w + Math.round(cell.w / 2 - frame.anchor * TRAP_SCALE),
        top: frame.originY + cell.h - h,
      };
    }));
  }

  /**
   * One scale for the whole group, chosen so the largest sprite just fits its cell.
   * Scaling each sprite to its own cell would flatten the size differences that make
   * Stay Puft loom. `forced` overrides it where two groups must share a scale.
   */
  async function pack(group, cell, originX, originY, columns, anchor, forced) {
    const scale = forced ?? Math.min(...group.map((s) => Math.min(cell.w / s.w, cell.h / s.h)));
    return Promise.all(group.map(async (sprite, i) => {
      const w = Math.max(1, Math.round(sprite.w * scale)), h = Math.max(1, Math.round(sprite.h * scale));
      const source = sprite.raw
        ? sharp(sprite.raw.data, { raw: sprite.raw.info })
        : sharp(sprite.file ?? SHEET).ensureAlpha().extract({ left: sprite.x, top: sprite.y, width: sprite.w, height: sprite.h });
      const input = await source.resize(w, h, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer();
      const cellX = originX + (i % columns) * cell.w, cellY = originY + Math.floor(i / columns) * cell.h;
      return {
        input,
        left: cellX + Math.round((cell.w - w) / 2),
        top: cellY + (anchor === 'bottom' ? cell.h - h : Math.round((cell.h - h) / 2)),
      };
    }));
  }

  const layers = [
    ...await pack([car], CAR, 0, 0, 1, 'bottom'),
    ...await pack([{ ...BURST_SOURCE, raw: isolate(data, W, C, BURST_SOURCE) }], BURST, CAR.w, 0, 1, 'center'),
    ...await pack(SPARK_SOURCE, SPARK, CAR.w + BURST.w, 0, SPARK.frames, 'center'),
    ...await pack(ghosts, GHOST, 0, CAR.h, GHOST.columns, 'center'),
    ...await packTrap(trapLayers(TRAP_ROWS.closed, TRAP_CLOSED_Y), TRAP),
    ...await packTrap(trapLayers(TRAP_ROWS.open, TRAP_OPEN_Y), TRAP),
    ...await pack(smoke, SMOKE, 0, SMOKE_Y, SMOKE.frames, 'bottom'),
  ];

  await mkdir('public/assets/ghost-patrol', { recursive: true });
  await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .png({ palette: true, quality: 100, effort: 10 })
    .toFile(OUT);

  console.log(`${OUT}  ${WIDTH}x${HEIGHT}`);
  console.log(`  car    ${car.w}x${car.h} -> cell ${CAR.w}x${CAR.h}`);
  console.log(`  burst  ${BURST_SOURCE.w}x${BURST_SOURCE.h} -> cell ${BURST.w}x${BURST.h}`);
  console.log(`  sparks ${SPARK.frames} @ ${SPARK.w}x${SPARK.h}`);
  console.log(`  ghosts ${ghosts.length} @ ${GHOST.w}x${GHOST.h}`);
  console.log(`  trap   ${TRAP.frames} closed + ${TRAP.frames} open @ ${TRAP.w}x${TRAP.h} (scale ${TRAP_SCALE})`);
  console.log(`  smoke  ${smoke.length} @ ${SMOKE.w}x${SMOKE.h}`);

  await buildBackdrop();
}

async function buildBackdrop() {
  const meta = await sharp(BACKDROP_SHEET).metadata();
  if (meta.width !== BACKDROP_WIDTH) {
    throw new Error(`Backdrop sheet is ${meta.width}px wide, expected ${BACKDROP_WIDTH}`);
  }
  const layers = [];
  let y = 0;
  for (const strip of BACKDROP_STRIPS) {
    layers.push({
      input: await sharp(BACKDROP_SHEET)
        .extract({ left: 0, top: strip.top, width: BACKDROP_WIDTH, height: strip.height })
        .png().toBuffer(),
      left: 0, top: y,
    });
    strip.y = y;
    y += strip.height;
  }
  await sharp({ create: { width: BACKDROP_WIDTH, height: y, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .webp({ quality: 90, effort: 6 })
    .toFile(BACKDROP_OUT);
  console.log(`${BACKDROP_OUT}  ${BACKDROP_WIDTH}x${y}`);
  for (const strip of BACKDROP_STRIPS) console.log(`  ${strip.name.padEnd(10)} y ${String(strip.y).padStart(3)} h ${strip.height}`);
}

await main();
