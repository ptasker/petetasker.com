type Ghost = { x: number; y: number; phase: number; health: number; speed: number; appearance: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; frame: number; size: number };
type Mode = 'ready' | 'playing' | 'paused' | 'over';

/** The trap sequence, from rolling out under the Ecto-1 to fading away with its catch. */
type TrapPhase = 'roll' | 'open' | 'suck' | 'fade';
type Trap = { phase: TrapPhase; t: number; fromX: number; x: number; appearance: number; size: number; ghostY: number };
const TRAP_PHASES: { phase: TrapPhase; seconds: number }[] = [
  { phase: 'roll', seconds: 0.5 },
  { phase: 'open', seconds: 0.45 },
  { phase: 'suck', seconds: 0.45 },
  { phase: 'fade', seconds: 0.3 },
];

/**
 * Geometry of public/assets/ghost-patrol/atlas.png, which is packed by
 * scripts/build-ghost-patrol-assets.mjs. Both files must agree; the tests check that.
 */
export const ATLAS = {
  width: 1024,
  height: 1112,
  car: { x: 0, y: 0, w: 512, h: 200 },
  burst: { x: 512, y: 0, w: 192, h: 192 },
  spark: { x: 704, y: 0, w: 48, h: 48, frames: 4 },
  ghost: { x: 0, y: 200, w: 192, h: 192, columns: 4 },
  trapClosed: { x: 0, y: 776, w: 160, h: 132, frames: 6 },
  trapOpen: { x: 0, y: 908, w: 160, h: 132, frames: 6 },
  smoke: { x: 0, y: 1040, w: 96, h: 72, frames: 8 },
};

/**
 * What makes each ghost feel different. `grip` scales how long the stream must hold,
 * `weight` how often it turns up, and `from` keeps the nastiest ones out of the early
 * levels so a run starts gently and escalates.
 */
type Trait = { speed: number; grip: number; bob: number; points: number; scale: number; weight: number; from: number };
const TRAITS: Trait[] = [
  { speed: 1.00, grip: 1.00, bob: 1.0, points: 1, scale: 1.05, weight: 10, from: 1 },  // 0  Slimer
  { speed: 1.30, grip: 0.85, bob: 1.0, points: 2, scale: 0.95, weight: 9, from: 1 },   // 1  blue screamer
  { speed: 1.00, grip: 1.00, bob: 1.3, points: 1, scale: 1.00, weight: 10, from: 1 },  // 2  pink wailer
  { speed: 1.25, grip: 0.95, bob: 0.8, points: 2, scale: 0.95, weight: 7, from: 2 },   // 3  flame demon
  { speed: 0.90, grip: 1.55, bob: 0.9, points: 3, scale: 1.05, weight: 6, from: 3 },   // 4  violet fiend
  { speed: 1.05, grip: 1.00, bob: 1.1, points: 1, scale: 0.95, weight: 10, from: 1 },  // 5  gold howler
  { speed: 1.15, grip: 1.05, bob: 2.2, points: 2, scale: 1.00, weight: 7, from: 2 },   // 6  banshee, weaves hard
  { speed: 1.45, grip: 0.70, bob: 1.0, points: 2, scale: 0.90, weight: 8, from: 1 },   // 7  classic sheet
  { speed: 0.55, grip: 2.40, bob: 0.35, points: 5, scale: 1.30, weight: 2, from: 6 },  // 8  Stay Puft, a slow wall
  { speed: 1.20, grip: 1.60, bob: 0.9, points: 4, scale: 1.10, weight: 3, from: 5 },   // 9  reaper
  { speed: 0.95, grip: 1.10, bob: 1.4, points: 1, scale: 1.00, weight: 8, from: 1 },   // 10 slime drip
  { speed: 1.40, grip: 1.15, bob: 1.0, points: 3, scale: 0.95, weight: 4, from: 4 },   // 11 fire skull
];

type Palette = {
  sky: string; building: string; window: string; kerb: string; road: string; dash: string;
  meter: string; meterFill: string; aim: string;
};
const PALETTES: Record<'dark' | 'light', Palette> = {
  dark: {
    sky: '#080e19', building: '#101b2b', window: '#223047', kerb: '#182435', road: '#0c1421',
    dash: '#344052', meter: '#233346', meterFill: '#bef264', aim: '#bef26455',
  },
  light: {
    sky: '#dbe9f7', building: '#9fb3c8', window: '#eaf2fa', kerb: '#7d92a8', road: '#c3d1de',
    dash: '#f1f6fb', meter: '#9fb3c8', meterFill: '#3f8a1a', aim: '#3f8a1a66',
  },
};

const CAPTURE_SECONDS = 0.65;
/** Each level asks for one more ghost than the last, and speeds them all up. */
const QUOTA_BASE = 4;
const SPEED_PER_LEVEL = 0.12;
const INTERLUDE_SECONDS = 1.8;
/** The proton pack cooks if you lean on the trigger; heat bleeds off when you let go. */
const OVERHEAT_SECONDS = 5;
const COOLDOWN_SECONDS = 1;
const HEAT_WARN_AT = 3.5;
const HEAT_RECOVERY = 1.5;
/** Skyline drift, in pixels per second: well under the road's 65 for a parallax feel. */
const SKYLINE_SPEED = 9;
/** How long a drained ghost hangs stunned before it shakes loose. */
const STUN_SECONDS = 2.5;
const GROUND = 259;
const TRAP_WIDTH = 84;
const BEST_KEY = 'ghost-patrol-best';

export class GhostPatrol extends HTMLElement {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private overlay!: HTMLElement;
  private startButton!: HTMLButtonElement;
  private atlas = new Image();
  private ready = false;
  private mode: Mode = 'ready';
  private abort = new AbortController();
  private observer?: IntersectionObserver;
  private resizeObserver?: ResizeObserver;
  private themeObserver?: MutationObserver;
  private frame = 0;
  private last = 0;
  private width = 800;
  private readonly height = 300;
  private elapsed = 0;
  private score = 0;
  private caught = 0;
  private streak = 0;
  private level = 1;
  private trapped = 0;
  private interlude = 0;
  private levelBanner?: HTMLElement;
  private best = 0;
  private lives = 3;
  private spawnIn = 0;
  private angle = -0.35;
  private shake = 0;
  private dark = true;
  private pointerDown = false;
  private keys = new Set<string>();
  private ghosts: Ghost[] = [];
  private sparks: Spark[] = [];
  private puffs: Spark[] = [];
  private heat = 0;
  private coolFor = 0;
  private puffIn = 0;
  private trap?: Trap;
  private pending?: Ghost;
  private stunFor = 0;
  private trapButton?: HTMLButtonElement;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  connectedCallback() {
    this.abort = new AbortController();
    this.canvas = this.querySelector('canvas')!;
    const context = this.canvas.getContext('2d');
    this.overlay = this.querySelector('.overlay')!;
    this.startButton = this.querySelector('.start')!;
    if (!context) { this.startButton.textContent = 'Canvas unavailable'; return; }
    this.ctx = context;
    try {
      this.best = Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0);
    } catch { /* Storage is optional. */ }
    this.dark = document.documentElement.classList.contains('dark');
    this.updateHud();
    const signal = this.abort.signal;
    this.startButton.addEventListener('click', () => this.start(), { signal });
    this.querySelector('.pause')!.addEventListener('click', () => this.pause(), { signal });
    this.trapButton = (this.querySelector('.trap') as HTMLButtonElement | null) ?? undefined;
    this.levelBanner = (this.querySelector('.level-up') as HTMLElement | null) ?? undefined;
    this.trapButton?.addEventListener('click', () => this.trapNow(), { signal });
    this.canvas.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'escape') { event.preventDefault(); this.pause(); return; }
      if (key === 't' || key === 'enter') { event.preventDefault(); this.trapNow(); return; }
      if (!['arrowup', 'arrowdown', 'w', 's', ' '].includes(key) || this.mode !== 'playing') return;
      event.preventDefault();
      this.keys.add(key);
    }, { signal });
    this.canvas.addEventListener('keyup', (event) => {
      if (this.keys.has(event.key.toLowerCase())) event.preventDefault();
      this.keys.delete(event.key.toLowerCase());
    }, { signal });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.mode !== 'playing' || event.button !== 0) return;
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
      this.pointerDown = true;
      this.aim(event);
    }, { signal });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.mode === 'playing' && (event.pointerType === 'mouse' || this.pointerDown)) this.aim(event);
    }, { signal });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.canvas.addEventListener(event, () => { this.pointerDown = false; }, { signal });
    }
    this.canvas.addEventListener('blur', () => { this.keys.clear(); this.pointerDown = false; }, { signal });
    window.addEventListener('blur', () => this.pause(false), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(false); }, { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    // The site's theme toggle flips a class on <html>; repaint the scene to match.
    this.themeObserver = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      if (dark !== this.dark) { this.dark = dark; this.draw(); }
    });
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // No image request or animation work until the footer approaches the viewport.
    let loading = false;
    this.observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (!loading) { loading = true; void this.load(); }
      } else this.pause(false);
    }, { rootMargin: '80px' });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
  }

  private async load() {
    this.atlas.src = '/assets/ghost-patrol/atlas.png';
    try {
      await this.atlas.decode();
      if (!this.isConnected) return;
      this.ready = true;
      this.startButton.disabled = false;
      this.startButton.textContent = 'Start patrol →';
      this.draw();
    } catch {
      this.startButton.textContent = 'Sprites unavailable';
      this.text('[data-message]', 'The game could not load. Refresh the page to try again.');
      this.text('.dispatch', 'Unable to load');
    }
  }

  private text(selector: string, value: string) {
    const element = this.querySelector(selector)!;
    if (element.textContent !== value) element.textContent = value;
  }

  private resize() {
    const previousWidth = this.width;
    this.width = this.canvas.getBoundingClientRect().width || 800;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = this.height * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    for (const ghost of this.ghosts) ghost.x *= this.width / previousWidth;
    this.draw();
  }

  private get palette() { return this.dark ? PALETTES.dark : PALETTES.light; }
  private get carWidth() { return this.width < 500 ? 164 : 245; }
  private get carHeight() { return this.carWidth * ATLAS.car.h / ATLAS.car.w; }
  private get origin() { return { x: 16 + this.carWidth * 0.7, y: 258 - this.carHeight * 0.5 }; }
  private get triggerHeld() { return this.pointerDown || this.keys.has(' '); }
  private get firing() { return this.triggerHeld && this.coolFor <= 0; }
  /** 0 until the pack nears its limit, then ramps to 1 at the moment it cuts out. */
  private get heatWarning() {
    return Math.max(0, Math.min(1, (this.heat - HEAT_WARN_AT) / (OVERHEAT_SECONDS - HEAT_WARN_AT)));
  }
  private get multiplier() { return Math.min(4, 1 + Math.floor(this.streak / 3)); }
  private get quota() { return QUOTA_BASE + this.level; }
  /**
   * How long a ghost takes to cross the street. A narrow screen gives it far less ground
   * to cover, so a fixed crossing time would leave phone ghosts crawling; this keeps the
   * pace closer to the desktop feel instead.
   */
  private get crossSeconds() {
    return 4.6 + 2.6 * Math.min(1, Math.max(0, (this.width - 360) / 440));
  }
  private get levelSpeed() { return 1 + (this.level - 1) * SPEED_PER_LEVEL; }
  private ghostSize(ghost: Ghost) { return 80 * (TRAITS[ghost.appearance]?.scale ?? 1); }

  private aim(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * this.width / rect.width;
    const y = (event.clientY - rect.top) * this.height / rect.height;
    const origin = this.origin;
    this.angle = Math.max(-1.48, Math.min(0.12, Math.atan2(y - origin.y, Math.max(8, x - origin.x))));
  }

  /** Weighted pick, restricted to the ghosts unlocked by how far into the shift we are. */
  private pickAppearance() {
    let total = 0;
    const eligible: { index: number; weight: number }[] = [];
    for (let i = 0; i < TRAITS.length; i++) {
      if (this.level < TRAITS[i].from) continue;
      eligible.push({ index: i, weight: TRAITS[i].weight });
      total += TRAITS[i].weight;
    }
    let roll = Math.random() * total;
    for (const candidate of eligible) {
      roll -= candidate.weight;
      if (roll <= 0) return candidate.index;
    }
    return eligible.length ? eligible[eligible.length - 1].index : 0;
  }

  private start() {
    if (!this.ready) return;
    if (this.mode !== 'paused') {
      this.elapsed = 0;
      this.score = 0;
      this.caught = 0;
      this.streak = 0;
      this.level = 1;
      this.trapped = 0;
      this.interlude = 0;
      this.lives = 3;
      this.spawnIn = 0;
      this.shake = 0;
      this.ghosts = [];
      this.sparks = [];
      this.puffs = [];
      this.heat = 0;
      this.coolFor = 0;
      this.trap = undefined;
      this.pending = undefined;
      this.stunFor = 0;
      this.angle = -0.35;
    }
    this.mode = 'playing';
    this.setAttribute('data-playing', '');
    this.overlay.hidden = true;
    (this.querySelector('.mission') as HTMLElement).hidden = false;
    this.text('.dispatch', this.pending ? 'Ghost stunned — hit TRAP!' : 'Patrol in progress');
    if (this.pending) this.showTrapPrompt(this.pending);
    this.updateHud();
    this.canvas.focus({ preventScroll: true });
    this.last = performance.now();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  }

  private pause(focus = true) {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.stop();
    this.showOverlay('TAKE A BREATHER', 'Patrol paused.', 'Your shift will be here when you get back.', 'Resume patrol →');
    this.text('.dispatch', 'Patrol paused');
    if (focus) this.startButton.focus({ preventScroll: true });
  }

  private stop() {
    cancelAnimationFrame(this.frame);
    this.keys.clear();
    this.pointerDown = false;
    this.removeAttribute('data-playing');
    this.hideTrapPrompt();
    this.hideLevelBanner();
    (this.querySelector('.mission') as HTMLElement).hidden = true;
    this.draw();
  }

  private showOverlay(eyebrow: string, heading: string, message: string, action: string) {
    this.text('[data-eyebrow]', eyebrow);
    this.text('[data-heading]', heading);
    this.text('[data-message]', message);
    this.startButton.textContent = action;
    this.overlay.hidden = false;
  }

  private finish() {
    this.mode = 'over';
    const record = this.score > this.best;
    this.best = Math.max(this.best, this.score);
    try { localStorage.setItem(BEST_KEY, String(this.best)); } catch { /* Play also works without storage. */ }
    this.stop();
    this.updateHud();
    const ghosts = `${this.caught} ghost${this.caught === 1 ? '' : 's'}`;
    this.showOverlay(
      record ? 'NEW PERSONAL BEST' : 'SHIFT REPORT',
      'We’ve been slimed!',
      `You reached level ${this.level} and trapped ${ghosts} for ${this.score} point${this.score === 1 ? '' : 's'}.`,
      'Play again →',
    );
    this.text('.dispatch', `Run over on level ${this.level}`);
    this.startButton.focus({ preventScroll: true });
  }

  private updateHud() {
    this.text('[data-score]', String(this.score).padStart(2, '0'));
    this.text('[data-best]', String(this.best).padStart(2, '0'));
    this.text('[data-level]', `LEVEL ${this.level}`);
    this.text('[data-quota]', `${this.trapped}/${this.quota} trapped`);
    this.text('[data-lives]', `${this.lives} escape${this.lives === 1 ? '' : 's'} left`);
    const combo = this.querySelector('[data-combo]') as HTMLElement | null;
    if (combo) {
      combo.textContent = `${this.multiplier}x`;
      combo.hidden = this.multiplier < 2;
    }
  }

  private tick = (now: number) => {
    if (this.mode !== 'playing') return;
    // A frame timestamp can precede performance.now() recorded by the start event.
    // Never let that first frame move the simulation backwards or select sprite -1.
    const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.05));
    this.last = now;
    this.elapsed += dt;
    // Between levels the street is empty and the level card is up; nothing else runs.
    if (this.interlude > 0) {
      this.interlude -= dt;
      if (this.interlude <= 0) this.hideLevelBanner();
      this.sparks = this.sparks.filter((spark) => (spark.life -= dt) > 0);
      this.puffs = this.puffs.filter((puff) => (puff.life -= dt) > 0);
      this.heat = Math.max(0, this.heat - dt * HEAT_RECOVERY);
      this.coolFor = Math.max(0, this.coolFor - dt);
      this.shake = Math.max(0, this.shake - dt * 26);
      this.draw();
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    const up = this.keys.has('arrowup') || this.keys.has('w');
    const down = this.keys.has('arrowdown') || this.keys.has('s');
    this.angle = Math.max(-1.48, Math.min(0.12, this.angle + (Number(down) - Number(up)) * dt * 1.4));

    if (this.coolFor > 0) {
      this.coolFor = Math.max(0, this.coolFor - dt);
      if (this.coolFor === 0) { this.heat = 0; this.text('.dispatch', 'Pack back online'); }
    }
    let firing = this.firing;
    if (firing) {
      this.heat += dt;
      if (this.heat >= OVERHEAT_SECONDS) {
        this.heat = OVERHEAT_SECONDS;
        this.coolFor = COOLDOWN_SECONDS;
        this.shake = 7;
        firing = false; // The stream cuts out on the same frame it cooks.
        this.text('.dispatch', 'Pack overheated!');
      }
    } else if (this.coolFor === 0) {
      this.heat = Math.max(0, this.heat - dt * HEAT_RECOVERY);
    }
    // A venting pack trails smoke from the gun for as long as it is cooling.
    if (this.coolFor > 0 && !this.reducedMotion.matches) {
      this.puffIn -= dt;
      if (this.puffIn <= 0) {
        this.puffIn = 0.07;
        const vent = this.origin;
        this.puffs.push({
          x: vent.x + 2, y: vent.y - 6,
          vx: 10 + Math.random() * 16, vy: -30 - Math.random() * 22,
          life: 0.75, max: 0.75, size: 13 + Math.random() * 12,
          frame: Math.floor(Math.random() * ATLAS.smoke.frames),
        });
      }
    }
    for (const puff of this.puffs) {
      puff.x += puff.vx * dt; puff.y += puff.vy * dt;
      puff.vy += dt * 8; // Rising smoke slows as it goes.
      puff.life -= dt;
    }
    this.puffs = this.puffs.filter((puff) => puff.life > 0);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      const appearance = this.pickAppearance();
      const base = (this.width - this.origin.x) / this.crossSeconds * this.levelSpeed;
      this.ghosts.push({
        x: this.width + 30,
        y: 75 + Math.random() * 105,
        phase: Math.random() * 6,
        health: 1,
        speed: base * TRAITS[appearance].speed,
        appearance,
      });
      // Slower than a pure shooter: each ghost costs a stun plus a trap sequence.
      this.spawnIn = Math.max(1.0, 2.8 - (this.level - 1) * 0.2);
    }

    const origin = this.origin;
    const beam = firing ? this.beamGeometry() : undefined;
    const target = beam?.target;
    // Sparks ride the length of the stream so it reads as energy, not a painted line.
    if (beam && !this.reducedMotion.matches) {
      for (let i = 0; i < 2; i++) {
        const along = 14 + Math.random() * Math.max(1, beam.length - 14);
        const drift = (Math.random() - 0.5) * 26;
        this.addSpark(
          beam.origin.x + beam.dx * along - beam.dy * drift,
          beam.origin.y + beam.dy * along + beam.dx * drift,
          (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50 - 14,
          0.2 + Math.random() * 0.22, 6 + Math.random() * 7,
        );
      }
    }
    // A stunned ghost hangs in the air waiting for the trap, and shakes loose if ignored.
    if (this.pending) {
      this.stunFor -= dt;
      if (this.stunFor <= 0) {
        this.pending.health = 0.5;
        this.pending = undefined;
        this.hideTrapPrompt();
        this.text('.dispatch', 'It shook loose!');
      }
    }
    if (this.trap) {
      const stage = TRAP_PHASES.find((p) => p.phase === this.trap!.phase)!;
      this.trap.t += dt / stage.seconds;
      if (this.trap.t >= 1) {
        const next = TRAP_PHASES[TRAP_PHASES.indexOf(stage) + 1];
        if (next) { this.trap.phase = next.phase; this.trap.t = 0; }
        else {
          this.trap = undefined;
          // The quota is only banked once the trap has finished swallowing the ghost.
          if (this.trapped >= this.quota) { this.advanceLevel(); this.draw(); this.frame = requestAnimationFrame(this.tick); return; }
        }
      }
    }
    for (const ghost of this.ghosts) {
      const trait = TRAITS[ghost.appearance] ?? TRAITS[0];
      if (ghost === this.pending) continue; // Pinned: it neither advances nor recovers.
      ghost.x -= ghost.speed * dt * (ghost === target ? 0.18 : 1);
      ghost.health = Math.min(1, ghost.health - (ghost === target ? dt / (CAPTURE_SECONDS * trait.grip) : -dt * 0.35));
      if (ghost.health <= 0) {
        if (this.pending || this.trap) {
          ghost.health = 0.02; // The trap is busy; hold it on the ropes until it is free.
        } else {
          ghost.health = 0;
          this.pending = ghost;
          this.stunFor = STUN_SECONDS;
          this.shake = 4;
          this.showTrapPrompt(ghost);
          this.text('.dispatch', 'Ghost stunned — hit TRAP!');
        }
      } else if (ghost.x < origin.x + 12) {
        // Several ghosts can cross the line on one frame; the counter must not go negative.
        this.lives = Math.max(0, this.lives - 1);
        this.streak = 0;
        this.shake = 6;
        this.text('.dispatch', `${this.lives} escape${this.lives === 1 ? '' : 's'} left`);
      }
    }
    this.ghosts = this.ghosts.filter((g) => g.x >= origin.x + 12);
    for (const spark of this.sparks) {
      spark.x += spark.vx * dt; spark.y += spark.vy * dt;
      spark.vy += dt * 26; // A little gravity so sparks arc instead of drifting flat.
      spark.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    this.shake = Math.max(0, this.shake - dt * 26);

    this.updateHud();
    if (this.lives <= 0) { this.finish(); return; }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  private addSpark(x: number, y: number, vx: number, vy: number, life: number, size: number) {
    this.sparks.push({ x, y, vx, vy, life, max: life, size, frame: Math.floor(Math.random() * ATLAS.spark.frames) });
  }

  private ghostY(ghost: Ghost) {
    if (this.reducedMotion.matches) return ghost.y;
    const bob = TRAITS[ghost.appearance]?.bob ?? 1;
    return ghost.y + Math.sin(this.elapsed * 2.5 + ghost.phase) * 9 * bob;
  }

  private beamTarget() {
    const origin = this.origin;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    // Stop at the nearest ghost intersecting the beam, matching the capture logic.
    return this.ghosts.filter((ghost) => {
      if (ghost === this.pending) return false; // Already pinned; the stream passes it by.
      const x = ghost.x - origin.x, y = this.ghostY(ghost) - origin.y;
      return x * dx + y * dy > 0 && Math.abs(x * dy - y * dx) < this.ghostSize(ghost) * 0.3;
    }).sort((a, b) => a.x - b.x)[0];
  }

  /** Where the stream starts, which way it points, and how far it reaches this frame. */
  private beamGeometry() {
    const origin = this.origin;
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    const edge = Math.min(
      (this.width - origin.x) / dx,
      dy < 0 ? -origin.y / dy : dy > 0 ? (this.height - origin.y) / dy : Infinity,
    );
    const target = this.beamTarget();
    const length = target
      ? Math.min(edge, (target.x - origin.x) * dx + (this.ghostY(target) - origin.y) * dy)
      : edge;
    return { origin, dx, dy, length, target };
  }

  private drawStream(moving: boolean) {
    const c = this.ctx;
    const { length, target } = this.beamGeometry();
    const phase = moving ? this.elapsed * 18 : 0;
    // A single continuous path replaces the old, disconnected sprite tiles.
    // All three color layers share the same geometry, including both endpoints.
    c.beginPath();
    c.moveTo(0, 0);
    for (let x = 3; x < length; x += 3) {
      const envelope = Math.min(1, x / 20, (length - x) / 20);
      const wave = (Math.sin(x / 12 - phase) * 5 + Math.sin(x / 5 + phase) * 1.5) * envelope;
      c.lineTo(x, Math.round(wave));
    }
    c.lineTo(length, 0);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const [color, width] of [['#1769ff', 15], ['#ff8a00', 9], ['#fff8d2', 3]] as const) {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    }
    // A compact muzzle flash and impact burst keep the stream visually anchored.
    for (const x of [0, ...(target ? [length] : [])]) {
      c.fillStyle = '#ffb52e'; c.fillRect(x - 4, -8, 8, 16);
      c.fillRect(x - 8, -4, 16, 8);
      c.fillStyle = '#fffbe6'; c.fillRect(x - 3, -3, 6, 6);
    }
  }

  /** Draw one atlas cell. `cell` is the source rect; the sprite is placed by its centre. */
  private cell(sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) {
    this.ctx.drawImage(this.atlas, sx, sy, sw, sh, Math.round(x), Math.round(y), w, h);
  }

  private drawGhostSprite(appearance: number, x: number, y: number, size: number) {
    const { ghost } = ATLAS;
    const column = appearance % ghost.columns, row = Math.floor(appearance / ghost.columns);
    const c = this.ctx;
    // The sheet draws every ghost facing right, but they advance leftward down the
    // street, so mirror them to face the car they are bearing down on.
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(-1, 1);
    c.drawImage(this.atlas, ghost.x + column * ghost.w, ghost.y + row * ghost.h, ghost.w, ghost.h, -size / 2, -size / 2, size, size);
    c.restore();
  }

  /** Rolls the trap out from under the Ecto-1, opens it, and swallows the ghost. */
  private drawTrap() {
    const trap = this.trap;
    if (!trap) return;
    const c = this.ctx;
    const rolling = trap.phase === 'roll';
    const cells = rolling ? ATLAS.trapClosed : ATLAS.trapOpen;
    const ease = rolling ? trap.t * (2 - trap.t) : 1;
    const x = trap.fromX + (trap.x - trap.fromX) * ease;
    // It emerges small from under the car and grows to full size as it arrives.
    const width = TRAP_WIDTH * (rolling ? 0.4 + 0.6 * ease : 1);
    const height = width * cells.h / cells.w;
    const frame = rolling || trap.phase === 'open'
      ? Math.min(cells.frames - 1, Math.floor(trap.t * cells.frames))
      : cells.frames - 1;
    const mouth = GROUND - height * 0.66;
    c.globalAlpha = trap.phase === 'fade' ? Math.max(0, 1 - trap.t) : 1;
    this.cell(cells.x + frame * cells.w, cells.y, cells.w, cells.h, x - width / 2, GROUND - height, width, height);
    if (trap.phase !== 'fade') {
      // The ghost hangs over the open trap, then is dragged down into the beam.
      const suck = trap.phase === 'suck' ? trap.t : 0;
      const pull = suck * suck;
      c.globalAlpha = Math.max(0, 1 - suck * 0.9);
      this.drawGhostSprite(
        trap.appearance,
        trap.x,
        trap.ghostY + (mouth - trap.ghostY) * pull,
        trap.size * (1 - suck * 0.82),
      );
    }
    if (trap.phase === 'suck' && trap.t > 0.55) {
      const flash = (trap.t - 0.55) / 0.45;
      const size = TRAP_WIDTH * (0.5 + flash * 0.8);
      const { burst } = ATLAS;
      c.globalAlpha = Math.max(0, 1 - flash);
      this.cell(burst.x, burst.y, burst.w, burst.h, trap.x - size / 2, mouth - size / 2, size, size);
    }
    c.globalAlpha = 1;
  }

  /** Deploy the trap on the stunned ghost. Driven by the TRAP! button, T or Enter. */
  private trapNow() {
    const ghost = this.pending;
    if (!ghost || this.trap || this.mode !== 'playing') return;
    this.pending = undefined;
    this.hideTrapPrompt();
    this.ghosts = this.ghosts.filter((g) => g !== ghost);
    const trait = TRAITS[ghost.appearance] ?? TRAITS[0];
    const multiplier = this.multiplier;
    this.score += trait.points * multiplier;
    this.caught++;
    this.trapped++;
    this.streak++;
    this.shake = Math.min(9, 3 + trait.points);
    const y = this.ghostY(ghost);
    for (let i = 0; i < 12; i++) {
      const spin = Math.random() * Math.PI * 2, speed = 30 + Math.random() * 90;
      this.addSpark(ghost.x, y, Math.cos(spin) * speed, Math.sin(spin) * speed, 0.3 + Math.random() * 0.3, 8 + Math.random() * 7);
    }
    this.trap = {
      phase: 'roll', t: 0, fromX: this.origin.x, x: ghost.x,
      appearance: ghost.appearance, size: this.ghostSize(ghost), ghostY: y,
    };
    this.text('.dispatch', multiplier > 1 ? `Trapped! ${multiplier}x combo` : `Ghost trapped! ${this.caught} total`);
    this.updateHud();
    this.canvas.focus({ preventScroll: true });
  }

  /** Clear the street, hand back an escape every third level, and speed the ghosts up. */
  private advanceLevel() {
    this.level++;
    this.trapped = 0;
    if ((this.level - 1) % 3 === 0) this.lives = Math.min(3, this.lives + 1);
    this.ghosts = [];
    this.pending = undefined;
    this.hideTrapPrompt();
    this.interlude = INTERLUDE_SECONDS;
    this.spawnIn = 0.6;
    this.showLevelBanner();
    this.updateHud();
    this.text('.dispatch', `Level ${this.level} — they come faster now`);
  }

  private showLevelBanner() {
    const banner = this.levelBanner;
    if (!banner) return;
    this.text('[data-banner-level]', `LEVEL ${this.level}`);
    this.text('[data-banner-note]', `Ghosts ×${this.levelSpeed.toFixed(2)} · trap ${this.quota}`);
    banner.hidden = false;
  }

  private hideLevelBanner() {
    if (this.levelBanner) this.levelBanner.hidden = true;
  }

  private showTrapPrompt(ghost: Ghost) {
    const button = this.trapButton;
    if (!button) return;
    button.hidden = false; // Unhide first: a hidden button measures zero wide.
    // The canvas is scaled to the element, so place the button in percentages of it, and
    // clamp against its real width. On a phone the button is a big slice of the stage, so
    // clamping by percentage alone still let it hang off the edge.
    const stage = this.canvas.getBoundingClientRect?.().width || this.width;
    const margin = (button.offsetWidth || 110) / 2 + 6;
    const wanted = (ghost.x / this.width) * stage;
    const x = stage > margin * 2 ? Math.max(margin, Math.min(stage - margin, wanted)) : stage / 2;
    button.style.left = `${(x / stage) * 100}%`;
    button.style.top = `${(Math.max(26, this.ghostY(ghost) - this.ghostSize(ghost) * 0.62) / this.height) * 100}%`;
  }

  private hideTrapPrompt() {
    if (this.trapButton) this.trapButton.hidden = true;
  }

  private draw() {
    if (!this.ctx) return;
    const c = this.ctx, w = this.width, colors = this.palette;
    c.setTransform(this.canvas.width / w, 0, 0, this.canvas.width / w, 0, 0);
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, w, this.height);
    c.fillStyle = colors.sky; c.fillRect(0, 0, w, this.height);

    c.save();
    if (this.shake > 0.2 && !this.reducedMotion.matches) {
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    // A quiet, procedural pixel skyline keeps the sprites in the foreground. It drifts
    // past at a fraction of the road speed, so the street reads as moving without the
    // background pulling the eye. Heights key off an absolute index, so each building
    // keeps its own shape and windows as it scrolls.
    const drift = this.reducedMotion.matches ? 0 : this.elapsed * SKYLINE_SPEED;
    const firstBuilding = Math.floor(drift / 48), shift = drift % 48;
    for (let n = 0; n < w / 48 + 2; n++) {
      const index = firstBuilding + n;
      const h = 32 + ((index * 37 + 19) % 95);
      const bx = Math.round(n * 48 - shift);
      c.fillStyle = colors.building; c.fillRect(bx, 247 - h, 42, h);
      c.fillStyle = colors.window;
      for (let y = 254 - h; y < 236; y += 15) for (let x = 8; x < 36; x += 12) {
        if ((index + x + y) % 3) c.fillRect(bx + x, y, 4, 5);
      }
    }
    c.fillStyle = colors.kerb; c.fillRect(0, 258, w, 1);
    c.fillStyle = colors.road; c.fillRect(0, 259, w, 41);
    c.fillStyle = colors.dash;
    const offset = this.reducedMotion.matches ? 0 : (this.elapsed * 65) % 80;
    for (let x = -offset; x < w; x += 80) c.fillRect(x, 283, 32, 2);
    if (!this.ready) { c.restore(); return; }

    const carW = this.carWidth, carH = this.carHeight;
    const moving = this.mode === 'playing' && !this.reducedMotion.matches;
    // The car sprite ships with its own exhaust smoke, so nothing is drawn over the tyres.
    const { car } = ATLAS;
    this.cell(car.x, car.y, car.w, car.h, 16, 258 - carH + (moving ? Math.sin(this.elapsed * 24) * 0.6 : 0), carW, carH);

    if (this.mode === 'ready') {
      this.drawGhostSprite(0, w < 500 ? w - 55 : w * 0.49, 125, 84);
    } else {
      for (const ghost of this.ghosts) {
        const size = this.ghostSize(ghost), y = this.ghostY(ghost);
        // A pinned ghost thrashes in place until the trap arrives.
        const shake = ghost === this.pending && !this.reducedMotion.matches ? 3 : 0;
        this.drawGhostSprite(
          ghost.appearance,
          ghost.x + (Math.random() - 0.5) * shake,
          y + (Math.random() - 0.5) * shake,
          size,
        );
        if (ghost.health < 1) {
          const barY = y + size / 2 + 4;
          c.fillStyle = colors.meter; c.fillRect(ghost.x - 22, barY, 44, 4);
          c.fillStyle = ghost.health > 0.5 ? colors.meterFill : ghost.health > 0.2 ? '#fbbf24' : '#f87171';
          c.fillRect(ghost.x - 22, barY, 44 * ghost.health, 4);
        }
      }
      this.drawTrap();
    }

    if (this.mode === 'playing') {
      const origin = this.origin;
      c.save(); c.translate(origin.x, origin.y); c.rotate(this.angle);
      if (this.firing) {
        this.drawStream(moving);
      } else {
        c.strokeStyle = colors.aim; c.setLineDash([3, 8]);
        c.beginPath(); c.moveTo(7, 0); c.lineTo(w, 0); c.stroke();
        c.setLineDash([]);
      }
      c.restore();
    }
    if (!this.reducedMotion.matches) {
      const { smoke } = ATLAS;
      for (const puff of this.puffs) {
        const left = Math.max(0, puff.life / puff.max);
        const size = puff.size * (0.7 + (1 - left) * 1.0);
        c.globalAlpha = left * 0.8;
        this.cell(
          smoke.x + puff.frame * smoke.w, smoke.y, smoke.w, smoke.h,
          puff.x - size / 2, puff.y - size / 2, size, size * smoke.h / smoke.w,
        );
      }
      c.globalAlpha = 1;
    }
    if (!this.reducedMotion.matches) {
      const { spark: cell } = ATLAS;
      for (const spark of this.sparks) {
        c.globalAlpha = Math.max(0, Math.min(1, spark.life / spark.max));
        const size = spark.size * (0.55 + 0.45 * (spark.life / spark.max));
        this.cell(cell.x + spark.frame * cell.w, cell.y, cell.w, cell.h, spark.x - size / 2, spark.y - size / 2, size, size);
      }
    }
    c.globalAlpha = 1;

    // The screen washes red as the pack approaches its limit, and stays red while it vents.
    const warning = this.heatWarning;
    if (this.mode === 'playing' && (warning > 0 || this.coolFor > 0)) {
      const pulse = this.reducedMotion.matches
        ? 0.65
        : 0.45 + 0.55 * Math.abs(Math.sin(this.elapsed * (this.coolFor > 0 ? 20 : 10 + warning * 12)));
      c.globalAlpha = (this.coolFor > 0 ? 0.34 : warning * 0.26) * pulse;
      c.fillStyle = '#ff2f2f';
      c.fillRect(0, 0, w, this.height);
      c.globalAlpha = 1;
    }
    c.restore();
  }
}
