/**
 * ECTO-1 GHOST PATROL
 * -------------------
 * A small Ghostbusters-themed canvas game that lives in the site footer.
 *
 * Drive the Ecto-1 (a 1959 Cadillac Miller-Meteor ambulance/hearse) left and
 * right along a New York street while a Ghostbuster leans out of the rear
 * window with a proton pack. Hold the beam on Slimer (a Class 5 full roaming
 * vapor) long enough to wrangle him, and the ghost trap slides out to bag him.
 * Let him swoop into the car and... "He slimed me!"
 *
 * Everything is drawn procedurally in Canvas 2D so there are no image assets.
 */

export interface EctoGameHandle {
  destroy(): void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const rad = (d: number) => (d * Math.PI) / 180
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/** Deterministic pseudo random in [0,1) for stable background details. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const STORAGE_KEY = "ecto1-ghost-patrol-best"

function loadBest(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) || 0) || 0
  } catch {
    return 0
  }
}

function saveBest(n: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(n))
  } catch {
    /* storage unavailable, ignore */
  }
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const CAR_ACCEL = 620 // px/s^2
const CAR_MAX_SPEED = 300 // px/s
const CAR_FRICTION = 3.2 // per second
const CAR_HALF = 92 // half-length of the car in px
const AIM_MIN = 25 // degrees above horizontal
const AIM_MAX = 80
const AIM_DEFAULT = 55
const AIM_SPEED = 70 // deg/s
const WRANGLE_TIME = 1.15 // seconds the beam must hold the ghost
const SLIME_TIME = 2.6 // seconds the car stays slimed
const GHOST_R = 22

type Mode = "attract" | "playing" | "paused"
type GhostState =
  | "spawn"
  | "wander"
  | "windup"
  | "swoop"
  | "retreat"
  | "wrangled"
  | "captured"
  | "gone"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  r: number
  kind: "smoke" | "spark" | "slime"
}

interface Point {
  x: number
  y: number
}

interface Palette {
  skyTop: string
  skyBottom: string
  stars: boolean
  moon: string
  skyline: string
  skylineWindow: string
  brick: string
  road: string
  roadLine: string
  curb: string
  text: string
  accent: string
  shadow: string
}

const DARK: Palette = {
  skyTop: "#04050d",
  skyBottom: "#1b2242",
  stars: true,
  moon: "#f1f5f9",
  skyline: "#0a0d1c",
  skylineWindow: "rgba(255, 214, 110, 0.55)",
  brick: "#4b2a22",
  road: "#161821",
  roadLine: "#d9a520",
  curb: "#2a2e3a",
  text: "#e2e8f0",
  accent: "#4ade80",
  shadow: "rgba(0,0,0,0.85)",
}

const LIGHT: Palette = {
  skyTop: "#7fb8f5",
  skyBottom: "#ffd9a6",
  stars: false,
  moon: "#fdfdfd",
  skyline: "#334155",
  skylineWindow: "rgba(255, 244, 200, 0.75)",
  brick: "#8a4535",
  road: "#4b5563",
  roadLine: "#fde047",
  curb: "#6b7280",
  text: "#0f172a",
  accent: "#15803d",
  shadow: "rgba(255,255,255,0.75)",
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export function initEctoGame(root: HTMLElement): EctoGameHandle {
  const canvasEl = root.querySelector("canvas")
  if (!canvasEl) throw new Error("EctoGame: missing <canvas>")
  const canvas: HTMLCanvasElement = canvasEl
  const context = canvas.getContext("2d")
  if (!context) throw new Error("EctoGame: canvas 2d context unavailable")
  const ctx: CanvasRenderingContext2D = context

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches

  let W = 0
  let H = 0
  let dpr = 1
  let groundY = 0

  let mode: Mode = "attract"
  let time = 0
  let lastFrame = 0
  let raf = 0
  let visible = true
  let destroyed = false

  const input = {
    left: false,
    right: false,
    fire: false,
    up: false,
    down: false,
  }

  const car = {
    x: 0,
    vx: 0,
    facing: 1 as 1 | -1,
    aim: AIM_DEFAULT,
    wheel: 0,
    slime: 0,
    firing: false,
  }

  const ghost = {
    x: 0,
    y: 0,
    state: "gone" as GhostState,
    t: 0,
    alpha: 0,
    scale: 1,
    targetX: 0,
    targetY: 0,
    phase: 0,
    swoopTimer: 5,
    wrangle: 0,
    lost: 0,
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    respawn: 0,
  }

  const trap = {
    active: false,
    t: 0,
    x: 0,
    ghostFrom: { x: 0, y: 0 },
    scored: false,
  }

  const score = { busted: 0, slimed: 0, best: loadBest() }
  const message = { text: "", t: 0, dur: 0 }
  const particles: Particle[] = []
  let beamPoints: Point[] = []
  let beamHit = false

  // -------------------------------------------------------------------------
  // Sizing / visibility
  // -------------------------------------------------------------------------

  function resize() {
    const rect = root.getBoundingClientRect()
    W = Math.max(1, Math.round(rect.width))
    H = Math.max(1, Math.round(rect.height))
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    groundY = H - 28
    if (mode === "playing") car.x = clamp(car.x, CAR_HALF, W - CAR_HALF)
    render()
  }

  const ro = new ResizeObserver(() => resize())
  ro.observe(root)

  const io = new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting)
    if (visible) startLoop()
  })
  io.observe(root)

  function onVisibility() {
    if (document.visibilityState === "visible") startLoop()
  }
  document.addEventListener("visibilitychange", onVisibility)

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  const KEYS: Record<string, keyof typeof input> = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    Space: "fire",
    KeyF: "fire",
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
  }

  function clearInput() {
    input.left = input.right = input.fire = input.up = input.down = false
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === "Escape") {
      if (mode === "playing") pause()
      canvas.blur()
      return
    }
    const action = KEYS[e.code]
    if (!action) return
    e.preventDefault()
    if (mode !== "playing") {
      if (e.repeat) return
      startGame()
    }
    input[action] = true
  }

  function onKeyUp(e: KeyboardEvent) {
    const action = KEYS[e.code]
    if (!action) return
    e.preventDefault()
    input[action] = false
  }

  function onPointerDown() {
    if (mode !== "playing") startGame()
    canvas.focus({ preventScroll: true })
  }

  function onBlur() {
    clearInput()
    if (mode === "playing") pause()
  }

  canvas.addEventListener("keydown", onKeyDown)
  canvas.addEventListener("keyup", onKeyUp)
  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("blur", onBlur)

  // Touch buttons (rendered in the Astro component, shown on coarse pointers).
  const buttons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("button[data-act]"),
  )
  const buttonCleanups: Array<() => void> = []
  for (const btn of buttons) {
    const act = btn.dataset.act as keyof typeof input
    const press = (e: PointerEvent) => {
      e.preventDefault()
      try {
        btn.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic or already-released pointer */
      }
      if (mode !== "playing") startGame()
      input[act] = true
    }
    const release = (e: PointerEvent) => {
      e.preventDefault()
      input[act] = false
    }
    btn.addEventListener("pointerdown", press)
    btn.addEventListener("pointerup", release)
    btn.addEventListener("pointercancel", release)
    btn.addEventListener("lostpointercapture", release)
    btn.addEventListener("contextmenu", e => e.preventDefault())
    buttonCleanups.push(() => {
      btn.removeEventListener("pointerdown", press)
      btn.removeEventListener("pointerup", release)
      btn.removeEventListener("pointercancel", release)
      btn.removeEventListener("lostpointercapture", release)
    })
  }

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  function startGame() {
    if (mode === "paused") {
      mode = "playing"
      lastFrame = 0
      startLoop()
      return
    }
    mode = "playing"
    score.busted = 0
    score.slimed = 0
    car.x = W / 2
    car.vx = 0
    car.facing = 1
    car.aim = AIM_DEFAULT
    car.slime = 0
    trap.active = false
    particles.length = 0
    message.text = ""
    spawnGhost(0.4)
    ghost.swoopTimer = 6
    lastFrame = 0
    startLoop()
  }

  function pause() {
    mode = "paused"
    clearInput()
    render()
  }

  function showMessage(text: string, dur = 1.8) {
    message.text = text
    message.t = 0
    message.dur = dur
  }

  function spawnGhost(delay: number) {
    ghost.state = "gone"
    ghost.respawn = delay
    ghost.wrangle = 0
    ghost.lost = 0
    ghost.scale = 1
    ghost.alpha = 0
  }

  function hoverZone() {
    const minY = 44
    const maxY = Math.max(minY + 10, groundY - 125)
    return { minY, maxY }
  }

  function pickWanderTarget() {
    const z = hoverZone()
    ghost.targetX = rand(70, Math.max(80, W - 70))
    ghost.targetY = rand(z.minY, z.maxY)
    ghost.t = rand(1.2, 2.8)
  }

  function ghostSpeed() {
    return Math.min(180, 70 + score.busted * 9)
  }

  function swoopInterval() {
    return Math.max(2.4, 6.5 - score.busted * 0.35)
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  function update(dt: number) {
    time += dt
    if (mode === "attract") updateAttract(dt)
    else if (mode === "playing") updatePlaying(dt)
    updateParticles(dt)
    if (message.text) {
      message.t += dt
      if (message.t > message.dur) message.text = ""
    }
  }

  function updateAttract(dt: number) {
    // Cruise across the lane right to left, like the old CSS animation.
    car.facing = -1
    car.vx = -70
    car.x -= 70 * dt
    if (car.x < -CAR_HALF - 40) car.x = W + CAR_HALF + 40
    car.wheel += (car.vx / 13) * dt
    car.firing = false
    if (Math.random() < 0.5) emitSmoke()

    if (ghost.state === "gone") {
      ghost.respawn -= dt
      if (ghost.respawn <= 0) {
        const z = hoverZone()
        ghost.x = rand(60, W - 60)
        ghost.y = rand(z.minY, z.maxY)
        ghost.state = "spawn"
        ghost.t = 0
        pickWanderTarget()
      }
    } else {
      ghost.alpha = Math.min(1, ghost.alpha + dt * 1.5)
      ghost.state = "wander"
      wander(dt, 45)
    }
  }

  function wander(dt: number, speed: number) {
    ghost.t -= dt
    if (ghost.t <= 0) pickWanderTarget()
    const dx = ghost.targetX - ghost.x
    const dy = ghost.targetY - ghost.y
    const d = Math.hypot(dx, dy) || 1
    const step = Math.min(d, speed * dt)
    ghost.x += (dx / d) * step
    ghost.y += (dy / d) * step
    ghost.phase += dt * 2.4
  }

  function updatePlaying(dt: number) {
    // --- Car -------------------------------------------------------------
    const slimed = car.slime > 0
    if (slimed) car.slime = Math.max(0, car.slime - dt)
    const controlLocked = trap.active && trap.t < 1.75

    let accel = 0
    if (!controlLocked) {
      if (input.left) accel -= CAR_ACCEL
      if (input.right) accel += CAR_ACCEL
    }
    if (slimed) accel *= 0.45
    car.vx += accel * dt
    car.vx -= car.vx * Math.min(1, CAR_FRICTION * dt)
    car.vx = clamp(car.vx, -CAR_MAX_SPEED, CAR_MAX_SPEED)
    if (Math.abs(car.vx) < 2 && accel === 0) car.vx = 0
    car.x += car.vx * dt
    if (car.x < CAR_HALF) {
      car.x = CAR_HALF
      car.vx = Math.max(0, car.vx)
    }
    if (car.x > W - CAR_HALF) {
      car.x = W - CAR_HALF
      car.vx = Math.min(0, car.vx)
    }
    if (accel > 0) car.facing = 1
    else if (accel < 0) car.facing = -1
    car.wheel += (car.vx / 13) * dt
    if (accel !== 0 && Math.abs(car.vx) > 15 && Math.random() < 0.6) emitSmoke()

    if (input.up) car.aim = clamp(car.aim + AIM_SPEED * dt, AIM_MIN, AIM_MAX)
    if (input.down) car.aim = clamp(car.aim - AIM_SPEED * dt, AIM_MIN, AIM_MAX)

    car.firing = input.fire && !slimed && !controlLocked

    // --- Ghost -------------------------------------------------------------
    beamHit = false
    beamPoints = []
    const z = hoverZone()

    switch (ghost.state) {
      case "gone":
        ghost.respawn -= dt
        if (ghost.respawn <= 0) {
          ghost.x = rand(70, W - 70)
          ghost.y = rand(z.minY, z.maxY)
          ghost.state = "spawn"
          ghost.t = 0
          ghost.alpha = 0
          ghost.scale = 1
          ghost.wrangle = 0
          ghost.swoopTimer = swoopInterval()
        }
        break
      case "spawn":
        ghost.t += dt
        ghost.alpha = Math.min(1, ghost.t / 0.8)
        ghost.phase += dt * 2.4
        if (ghost.t >= 0.8) {
          ghost.state = "wander"
          pickWanderTarget()
        }
        break
      case "wander":
        wander(dt, ghostSpeed())
        ghost.swoopTimer -= dt
        if (ghost.swoopTimer <= 0) {
          ghost.state = "windup"
          ghost.t = 0
        }
        break
      case "windup":
        ghost.t += dt
        ghost.phase += dt * 6
        if (ghost.t >= 0.6) {
          ghost.state = "swoop"
          ghost.t = 0
          ghost.from = { x: ghost.x, y: ghost.y }
          ghost.to = {
            x: clamp(car.x + car.vx * 0.45, 40, W - 40),
            y: groundY - 52,
          }
        }
        break
      case "swoop": {
        ghost.t += dt
        const p = Math.min(1, ghost.t / 0.85)
        const e = easeInOut(p)
        ghost.x = lerp(ghost.from.x, ghost.to.x, e)
        // Dip below the straight line for a nice diving arc.
        ghost.y = lerp(ghost.from.y, ghost.to.y, e) + Math.sin(p * Math.PI) * 18
        ghost.phase += dt * 5
        if (Math.random() < 0.6) emitSlime(ghost.x, ghost.y + GHOST_R * 0.8)
        const dx = Math.abs(ghost.x - car.x)
        const dy = groundY - 40 - ghost.y
        if (dx < CAR_HALF - 10 && dy < 48 && dy > -20) {
          slimeCar()
          ghost.state = "retreat"
          ghost.t = 0
        } else if (p >= 1) {
          ghost.state = "retreat"
          ghost.t = 0
        }
        break
      }
      case "retreat": {
        ghost.t += dt
        const ty = clamp(ghost.y - 160 * dt, z.minY, z.maxY)
        ghost.y = ty
        ghost.x = clamp(ghost.x + Math.sin(time * 4) * 30 * dt, 40, W - 40)
        ghost.phase += dt * 3
        if (ghost.y <= z.maxY || ghost.t > 1.2) {
          ghost.state = "wander"
          pickWanderTarget()
          ghost.swoopTimer = swoopInterval()
        }
        break
      }
      case "wrangled": {
        ghost.phase += dt * 10
        ghost.lost += dt
        ghost.y = clamp(ghost.y, 30, groundY - 60)
        if (ghost.lost > 0.28) {
          // Beam slipped off: the ghost breaks free and bolts.
          ghost.state = "wander"
          ghost.wrangle = 0
          pickWanderTarget()
          ghost.targetX = clamp(
            ghost.x + (Math.random() < 0.5 ? -1 : 1) * rand(120, 240),
            60,
            W - 60,
          )
          ghost.swoopTimer = Math.max(ghost.swoopTimer, 1.5)
        }
        break
      }
      case "captured":
        break
    }

    // --- Beam --------------------------------------------------------------
    if (car.firing) {
      computeBeam(dt)
    }

    // --- Trap sequence -------------------------------------------------------
    if (trap.active) updateTrap(dt)
  }

  function slimeCar() {
    car.slime = SLIME_TIME
    car.firing = false
    score.slimed += 1
    showMessage("HE SLIMED ME!", 2.2)
    for (let i = 0; i < 26; i++) {
      particles.push({
        x: car.x + rand(-50, 50),
        y: groundY - rand(20, 70),
        vx: rand(-60, 60),
        vy: rand(-90, 20),
        life: 0,
        max: rand(0.5, 1.1),
        r: rand(2, 5),
        kind: "slime",
      })
    }
  }

  function wandOrigin(): Point {
    // Shoulder of the Ghostbuster leaning out of the rear window (car-local
    // coordinates, car facing +x) plus the wand length along the aim angle.
    const a = rad(car.aim)
    const lx = -20 + Math.cos(a) * 30
    const ly = -53 - Math.sin(a) * 30
    return { x: car.x + car.facing * lx, y: groundY + ly }
  }

  function computeBeam(dt: number) {
    const o = wandOrigin()
    const a = rad(car.aim)
    const dx = car.facing * Math.cos(a)
    const dy = -Math.sin(a)
    // Distance to leave the canvas.
    const tx =
      dx > 0 ? (W + 40 - o.x) / dx : dx < 0 ? (-40 - o.x) / dx : Infinity
    const ty = (-40 - o.y) / dy
    const maxLen = Math.max(20, Math.min(tx, ty))
    const step = 11
    const n = Math.ceil(maxLen / step)
    const px = -dy
    const py = dx
    const pts: Point[] = [{ x: o.x, y: o.y }]
    const ghostAlive =
      ghost.state === "wander" ||
      ghost.state === "windup" ||
      ghost.state === "swoop" ||
      ghost.state === "retreat" ||
      ghost.state === "wrangled"
    const hitR = GHOST_R * ghost.scale + 8
    for (let i = 1; i <= n; i++) {
      const d = i * step
      const f = i / n
      const wobble =
        Math.sin(i * 0.8 + time * 21) * 3 * f +
        Math.sin(i * 0.31 - time * 8.5) * 7 * f +
        rand(-1.6, 1.6)
      const x = o.x + dx * d + px * wobble
      const y = o.y + dy * d + py * wobble
      const prev = pts[pts.length - 1]
      pts.push({ x, y })
      if (ghostAlive && !beamHit) {
        if (segDist(prev, { x, y }, ghost.x, ghost.y) <= hitR) {
          beamHit = true
          pts.push({ x: ghost.x, y: ghost.y })
          break
        }
      }
    }
    beamPoints = pts
    if (beamHit) {
      if (ghost.state !== "wrangled") {
        ghost.state = "wrangled"
        ghost.wrangle = 0
      }
      ghost.lost = 0
      ghost.wrangle += dt
      // The stream drags the ghost slowly toward the wand.
      const gx = o.x - ghost.x
      const gy = o.y - ghost.y
      const gd = Math.hypot(gx, gy) || 1
      ghost.x += (gx / gd) * 14 * dt + rand(-2.2, 2.2)
      ghost.y += (gy / gd) * 14 * dt + rand(-2.2, 2.2)
      for (let i = 0; i < 3; i++) emitSpark(ghost.x, ghost.y)
      if (ghost.wrangle >= WRANGLE_TIME) beginTrap()
    }
  }

  function segDist(a: Point, b: Point, x: number, y: number) {
    const vx = b.x - a.x
    const vy = b.y - a.y
    const len2 = vx * vx + vy * vy || 1
    const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / len2, 0, 1)
    return Math.hypot(a.x + vx * t - x, a.y + vy * t - y)
  }

  function beginTrap() {
    ghost.state = "captured"
    trap.active = true
    trap.t = 0
    trap.scored = false
    trap.x = clamp(ghost.x, 40, W - 40)
    trap.ghostFrom = { x: ghost.x, y: ghost.y }
    car.firing = false
    input.fire = false
  }

  function updateTrap(dt: number) {
    trap.t += dt
    const t = trap.t
    if (t < 0.45) {
      // Ghost quivers while the trap slides out.
      ghost.x = trap.ghostFrom.x + rand(-2, 2)
      ghost.y = trap.ghostFrom.y + rand(-2, 2)
    } else if (t < 0.65) {
      ghost.x = trap.ghostFrom.x
      ghost.y = trap.ghostFrom.y
    } else if (t < 1.55) {
      const p = easeInOut((t - 0.65) / 0.9)
      ghost.x =
        lerp(trap.ghostFrom.x, trap.x, p) +
        Math.sin(p * Math.PI * 5) * 14 * (1 - p)
      ghost.y = lerp(trap.ghostFrom.y, groundY - 10, p)
      ghost.scale = 1 - p * 0.92
      ghost.phase += dt * 14
      if (Math.random() < 0.7) emitSpark(ghost.x, ghost.y)
    } else if (t < 1.75) {
      if (!trap.scored) {
        trap.scored = true
        score.busted += 1
        if (score.busted > score.best) {
          score.best = score.busted
          saveBest(score.best)
        }
        showMessage("GHOST TRAPPED!", 2)
        for (let i = 0; i < 14; i++) {
          particles.push({
            x: trap.x + rand(-8, 8),
            y: groundY - 8,
            vx: rand(-40, 40),
            vy: rand(-70, -20),
            life: 0,
            max: rand(0.6, 1.2),
            r: rand(3, 7),
            kind: "smoke",
          })
        }
      }
      ghost.scale = 0
    } else if (t >= 2.5) {
      trap.active = false
      spawnGhost(0.8)
    }
  }

  // --- Particles --------------------------------------------------------------

  function emitSmoke() {
    // Puff from the rear tyre, drifting away behind the car.
    const rearX = car.x - car.facing * 52
    particles.push({
      x: rearX + rand(-4, 4),
      y: groundY - rand(2, 8),
      vx: -car.facing * rand(20, 45) + rand(-10, 10),
      vy: rand(-22, -8),
      life: 0,
      max: rand(0.6, 1.1),
      r: rand(3, 6),
      kind: "smoke",
    })
  }

  function emitSpark(x: number, y: number) {
    const a = rand(0, TAU)
    const s = rand(40, 140)
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0,
      max: rand(0.15, 0.4),
      r: rand(1, 2.4),
      kind: "spark",
    })
  }

  function emitSlime(x: number, y: number) {
    particles.push({
      x: x + rand(-8, 8),
      y,
      vx: rand(-8, 8),
      vy: rand(20, 60),
      life: 0,
      max: rand(0.4, 0.9),
      r: rand(1.5, 3.5),
      kind: "slime",
    })
  }

  function updateParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life += dt
      if (p.life >= p.max) {
        particles.splice(i, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === "slime") p.vy += 160 * dt
      if (p.kind === "smoke") {
        p.r += 6 * dt
        p.vx *= 1 - 0.8 * dt
      }
    }
    if (particles.length > 260) particles.splice(0, particles.length - 260)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  function isDark() {
    return document.documentElement.classList.contains("dark")
  }

  function render() {
    if (W === 0 || H === 0) return
    const pal = isDark() ? DARK : LIGHT
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    drawSky(pal)
    drawSkyline(pal)
    drawRoad(pal)
    if (trap.active) drawTrap()
    drawCar(pal)
    if (car.firing && beamPoints.length > 1) drawBeam()
    if (ghost.state !== "gone" && ghost.alpha > 0 && ghost.scale > 0.01)
      drawGhost()
    if (trap.active) drawTrapLight()
    drawParticles(pal)
    if (car.slime > 0) drawSlimeOverlay()
    drawHud(pal)
  }

  // --- Background -------------------------------------------------------------

  function drawSky(pal: Palette) {
    const g = ctx.createLinearGradient(0, 0, 0, groundY)
    g.addColorStop(0, pal.skyTop)
    g.addColorStop(1, pal.skyBottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, groundY)

    // Stars (night only)
    if (pal.stars) {
      ctx.fillStyle = "#ffffff"
      const count = Math.floor(W / 14)
      for (let i = 0; i < count; i++) {
        const x = hash(i * 3 + 1) * W
        const y = hash(i * 3 + 2) * (groundY - 90)
        const tw =
          0.35 + 0.65 * Math.abs(Math.sin(time * (0.6 + hash(i) * 1.4) + i))
        ctx.globalAlpha = tw * 0.85
        const r = 0.6 + hash(i * 3 + 3) * 1.1
        ctx.fillRect(x, y, r, r)
      }
      ctx.globalAlpha = 1
    }

    // Moon
    const mx = W * 0.14
    const my = 42
    ctx.save()
    ctx.globalAlpha = pal.stars ? 1 : 0.7
    const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 42)
    mg.addColorStop(0, "rgba(255,255,255,0.22)")
    mg.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = mg
    ctx.fillRect(mx - 45, my - 45, 90, 90)
    ctx.fillStyle = pal.moon
    ctx.beginPath()
    ctx.arc(mx, my, 14, 0, TAU)
    ctx.fill()
    ctx.fillStyle = "rgba(0,0,0,0.08)"
    ctx.beginPath()
    ctx.arc(mx - 4, my - 3, 3, 0, TAU)
    ctx.arc(mx + 5, my + 4, 2.2, 0, TAU)
    ctx.arc(mx + 2, my - 6, 1.6, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  function drawSkyline(pal: Palette) {
    // Procedural Manhattan silhouette, stable across frames.
    ctx.fillStyle = pal.skyline
    let x = -10
    let i = 0
    const lit = pal.skylineWindow
    while (x < W + 10) {
      const bw = 22 + Math.floor(hash(i * 7 + 11) * 38)
      const bh = 34 + Math.floor(hash(i * 7 + 13) * 78)
      const top = groundY - bh
      ctx.fillStyle = pal.skyline
      ctx.fillRect(x, top, bw, bh)
      // Water tower / antenna on some roofs
      const deco = hash(i * 7 + 17)
      if (deco > 0.72) {
        ctx.fillRect(x + bw * 0.55 - 4, top - 10, 8, 10)
        ctx.fillRect(x + bw * 0.55 - 5, top - 12, 10, 2)
      } else if (deco > 0.55) {
        ctx.fillRect(x + bw * 0.5 - 0.5, top - 14, 1, 14)
      }
      // Windows
      ctx.fillStyle = lit
      const cols = Math.max(1, Math.floor((bw - 6) / 7))
      const rows = Math.max(1, Math.floor((bh - 8) / 9))
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seed = hash(i * 131 + r * 17 + c * 3)
          if (seed < 0.55) continue
          const flicker =
            seed > 0.95 && Math.sin(time * 3 + seed * 40) > 0.6 ? 0.2 : 1
          ctx.globalAlpha = flicker
          ctx.fillRect(x + 4 + c * 7, top + 5 + r * 9, 3, 4)
        }
      }
      ctx.globalAlpha = 1
      x += bw + 2
      i++
    }
    drawFirehouse(pal)
  }

  function drawFirehouse(pal: Palette) {
    // Hook & Ladder 8 style firehouse: Ghostbusters HQ.
    const fw = 66
    const fh = 82
    const fx = W < 520 ? W * 0.5 - fw / 2 : W * 0.66
    const fy = groundY - fh
    ctx.fillStyle = pal.brick
    ctx.fillRect(fx, fy, fw, fh)
    // Cornice
    ctx.fillStyle = "rgba(255,255,255,0.18)"
    ctx.fillRect(fx - 2, fy, fw + 4, 4)
    // Upper windows (two rows, arched)
    ctx.fillStyle = pal.skylineWindow
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const wx = fx + 9 + c * 18
        const wy = fy + 12 + r * 22
        ctx.beginPath()
        ctx.moveTo(wx, wy + 12)
        ctx.lineTo(wx, wy + 4)
        ctx.arc(wx + 5, wy + 4, 5, Math.PI, 0)
        ctx.lineTo(wx + 10, wy + 12)
        ctx.closePath()
        ctx.fill()
      }
    }
    // Big arched garage door with a warm glow inside
    const dx = fx + fw / 2
    const dy = groundY
    ctx.fillStyle = "rgba(0,0,0,0.55)"
    ctx.beginPath()
    ctx.moveTo(dx - 20, dy)
    ctx.lineTo(dx - 20, dy - 20)
    ctx.arc(dx, dy - 20, 20, Math.PI, 0)
    ctx.lineTo(dx + 20, dy)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = "rgba(255, 200, 90, 0.35)"
    ctx.beginPath()
    ctx.moveTo(dx - 16, dy)
    ctx.lineTo(dx - 16, dy - 18)
    ctx.arc(dx, dy - 18, 16, Math.PI, 0)
    ctx.lineTo(dx + 16, dy)
    ctx.closePath()
    ctx.fill()
    // No-ghost sign hanging above the door
    drawNoGhostLogo(dx, dy - 50, 9)
  }

  function drawNoGhostLogo(x: number, y: number, r: number) {
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, TAU)
    ctx.fill()
    // Little ghost
    ctx.fillStyle = "#f1f1f1"
    ctx.strokeStyle = "#111"
    ctx.lineWidth = Math.max(0.8, r * 0.1)
    ctx.beginPath()
    ctx.arc(0, -r * 0.1, r * 0.5, Math.PI, 0)
    ctx.lineTo(r * 0.5, r * 0.45)
    ctx.lineTo(r * 0.25, r * 0.3)
    ctx.lineTo(0, r * 0.5)
    ctx.lineTo(-r * 0.25, r * 0.3)
    ctx.lineTo(-r * 0.5, r * 0.45)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = "#111"
    ctx.beginPath()
    ctx.arc(-r * 0.18, -r * 0.15, r * 0.09, 0, TAU)
    ctx.arc(r * 0.18, -r * 0.15, r * 0.09, 0, TAU)
    ctx.fill()
    // Red ring and bar
    ctx.strokeStyle = "#d7262c"
    ctx.lineWidth = Math.max(1.5, r * 0.28)
    ctx.beginPath()
    ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-r * 0.68, -r * 0.68)
    ctx.lineTo(r * 0.68, r * 0.68)
    ctx.stroke()
    ctx.restore()
  }

  function drawRoad(pal: Palette) {
    ctx.fillStyle = pal.curb
    ctx.fillRect(0, groundY - 4, W, 5)
    ctx.fillStyle = pal.road
    ctx.fillRect(0, groundY, W, H - groundY)
    // Dashed centre line
    ctx.strokeStyle = pal.roadLine
    ctx.lineWidth = 2
    ctx.setLineDash([18, 14])
    ctx.lineDashOffset = mode === "attract" ? -time * 20 : 0
    ctx.beginPath()
    ctx.moveTo(0, groundY + 14)
    ctx.lineTo(W, groundY + 14)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // --- Ecto-1 ----------------------------------------------------------------

  function drawCar(pal: Palette) {
    // Side view of the 1959 Cadillac Miller-Meteor: very long and low, with a
    // long hood, a raked windshield, a flat roof, small wheels tucked well
    // inboard, a huge rear overhang and red rocket fins on the rear fenders.
    // Local coordinates: origin at the ground under the car centre, car
    // facing +x (rear is negative x).
    const t = time
    ctx.save()
    ctx.translate(car.x, groundY)
    ctx.scale(car.facing, 1)

    const outline = "#2a2a2e"
    const white = "#f8f8f6"
    const red = "#d1252b"
    const chrome = "#cfd6dd"
    const glass = "#9dcbe9"

    // Shadow on the road
    ctx.fillStyle = "rgba(0,0,0,0.35)"
    ctx.beginPath()
    ctx.ellipse(-2, 2, CAR_HALF + 2, 4, 0, 0, TAU)
    ctx.fill()

    // --- Roof rack (behind the roof) ---
    // Antenna
    ctx.strokeStyle = "#b8bec6"
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-74, -58)
    ctx.lineTo(-79, -92)
    ctx.stroke()
    ctx.fillStyle = "#e5e7eb"
    ctx.beginPath()
    ctx.arc(-79, -93, 1.6, 0, TAU)
    ctx.fill()
    // Frame: bottom rail on the roof, top rail, posts
    ctx.fillStyle = "#9aa1a9"
    ctx.fillRect(-76, -58, 104, 2)
    ctx.fillRect(-76, -71, 104, 1.8)
    for (const px of [-76, -50, -24, 2, 26]) ctx.fillRect(px, -71, 1.8, 13)
    // Big silver storage tank
    ctx.fillStyle = "#c3c9d1"
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    roundRect(-72, -69, 28, 10, 5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = "#7d848c"
    ctx.fillRect(-65, -69, 2, 10)
    ctx.fillRect(-51, -69, 2, 10)
    // Yellow and green cylinders
    ctx.fillStyle = "#e8c227"
    roundRect(-42, -67, 13, 7, 3)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = "#4caf50"
    roundRect(-28, -68, 11, 6, 3)
    ctx.fill()
    ctx.stroke()
    // Equipment box
    ctx.fillStyle = "#6b7280"
    roundRect(-15, -67, 13, 8, 2)
    ctx.fill()
    ctx.stroke()
    // Radar dish
    ctx.strokeStyle = "#d5dae0"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(4, -59)
    ctx.lineTo(4, -70)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(4, -72, 6, Math.PI * 1.05, Math.PI * 1.95)
    ctx.stroke()
    // Spotlight
    ctx.fillStyle = "#e5e7eb"
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(18, -64, 3.5, 0, TAU)
    ctx.fill()
    ctx.stroke()
    // Ladder lying along the top of the rack at the rear
    ctx.strokeStyle = "#d1d5db"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-78, -73)
    ctx.lineTo(-44, -73)
    ctx.moveTo(-78, -76)
    ctx.lineTo(-44, -76)
    for (let lx = -76; lx <= -46; lx += 6) {
      ctx.moveTo(lx, -73)
      ctx.lineTo(lx, -76)
    }
    ctx.stroke()

    // --- Body silhouette ---
    ctx.lineJoin = "round"
    ctx.lineWidth = 1.5
    ctx.strokeStyle = outline
    ctx.fillStyle = white
    ctx.beginPath()
    ctx.moveTo(-88, -14) // rear bumper line
    ctx.lineTo(-90, -36) // rear panel up to the belt line
    ctx.lineTo(-84, -40) // rear deck
    ctx.lineTo(-80, -56) // rear pillar (slightly raked)
    ctx.lineTo(18, -56) // long flat roof
    ctx.lineTo(34, -39) // raked windshield down to the cowl
    ctx.lineTo(84, -37) // long hood
    ctx.lineTo(90, -32) // nose
    ctx.lineTo(90, -14) // front bumper line
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // --- Red rocket fin on the rear fender ---
    ctx.fillStyle = red
    ctx.beginPath()
    ctx.moveTo(-36, -39) // pointed front tip on the rear door
    ctx.lineTo(-84, -42)
    ctx.lineTo(-94, -53) // blade rises at the very back
    ctx.lineTo(-93, -36)
    ctx.lineTo(-36, -35)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // Chrome spear down the fin
    ctx.strokeStyle = chrome
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-40, -37.5)
    ctx.lineTo(-88, -40)
    ctx.stroke()
    // Bullet tail light on the blade
    ctx.fillStyle = "#ff3b3b"
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(-91, -45, 2.2, 0, TAU)
    ctx.fill()
    ctx.stroke()
    // Red belt line forward along the doors, chrome rocker trim
    ctx.fillStyle = red
    ctx.fillRect(-36, -39, 52, 2)
    ctx.fillStyle = chrome
    ctx.fillRect(-84, -17, 170, 1.8)

    // --- Greenhouse: three shallow windows and a raked windshield ---
    ctx.strokeStyle = outline
    ctx.lineWidth = 1.2
    ctx.fillStyle = glass
    roundRect(-76, -53, 30, 12, 2)
    ctx.fill()
    ctx.stroke()
    roundRect(-42, -53, 28, 12, 2)
    ctx.fill()
    ctx.stroke()
    roundRect(-10, -53, 24, 12, 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(17, -53)
    ctx.lineTo(23, -53)
    ctx.lineTo(35, -41)
    ctx.lineTo(24, -41)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // Glass reflections
    ctx.strokeStyle = "rgba(255,255,255,0.7)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-72, -43)
    ctx.lineTo(-64, -52)
    ctx.moveTo(-38, -43)
    ctx.lineTo(-30, -52)
    ctx.moveTo(-6, -43)
    ctx.lineTo(2, -52)
    ctx.stroke()
    // Door seams
    ctx.strokeStyle = "rgba(0,0,0,0.25)"
    ctx.beginPath()
    ctx.moveTo(-44, -53)
    ctx.lineTo(-45, -19)
    ctx.moveTo(-12, -53)
    ctx.lineTo(-13, -19)
    ctx.moveTo(22, -53)
    ctx.lineTo(24, -19)
    ctx.stroke()

    // --- Front end ---
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    // Chrome bumpers (front and rear)
    ctx.fillStyle = chrome
    roundRect(78, -22, 14, 6, 2)
    ctx.fill()
    ctx.stroke()
    roundRect(-95, -22, 14, 6, 2)
    ctx.fill()
    ctx.stroke()
    // Grille bar under the headlights
    ctx.fillStyle = chrome
    roundRect(82, -30, 9, 7, 1.5)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = "#8b949e"
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let gy = -28.5; gy < -23; gy += 2) {
      ctx.moveTo(82.5, gy)
      ctx.lineTo(90.5, gy)
    }
    ctx.stroke()
    // Quad headlights: a side-by-side pair in chrome bezels
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    for (const hx of [82, 88]) {
      ctx.fillStyle = chrome
      ctx.beginPath()
      ctx.arc(hx, -33, 3.2, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = "#fff5c2"
      ctx.beginPath()
      ctx.arc(hx, -33, 2, 0, TAU)
      ctx.fill()
    }
    if (pal.stars || mode === "playing") {
      const hg = ctx.createRadialGradient(92, -32, 0, 92, -32, 28)
      hg.addColorStop(0, "rgba(255,245,200,0.35)")
      hg.addColorStop(1, "rgba(255,245,200,0)")
      ctx.fillStyle = hg
      ctx.fillRect(86, -60, 44, 56)
    }

    // Yellow New York plate "ECTO-1" (un-mirrored so it always reads correctly)
    ctx.fillStyle = "#f5c518"
    ctx.strokeStyle = outline
    roundRect(-88, -15, 18, 7, 1)
    ctx.fill()
    ctx.stroke()
    ctx.save()
    ctx.translate(-79, -9.5)
    ctx.scale(car.facing, 1)
    ctx.fillStyle = "#111"
    ctx.font = 'bold 5.5px "Share Tech Mono", monospace'
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("ECTO-1", 0, 0)
    ctx.restore()

    // Logo on the rear door, below the belt line
    ctx.save()
    ctx.translate(-28, -26)
    ctx.scale(car.facing, 1)
    drawNoGhostLogo(0, 0, 7)
    ctx.restore()

    // Wheels: small, tucked inboard, big rear overhang
    drawWheel(-52, -12)
    drawWheel(58, -12)

    // --- Ghostbuster leaning out of the rear door window ---
    drawGhostbuster()

    // --- Emergency lights (drawn last so their glow sits on top) ---
    const blueA = Math.sin(t * 7.8) > 0
    const blueB = !blueA
    const redOn = Math.sin(t * 5.2 + 1) > 0.2
    const lightsOn = mode !== "attract" || !reducedMotion
    ctx.fillStyle = "#374151"
    ctx.fillRect(6, -74, 26, 3)
    drawBeacon(10, -78, "#3b82f6", lightsOn && blueA)
    drawBeacon(19, -79, "#ef4444", lightsOn && redOn)
    drawBeacon(28, -78, "#3b82f6", lightsOn && blueB)
    drawBeacon(-60, -76, "#3b82f6", lightsOn && blueB)

    ctx.restore()

    // Slime dripping off the car
    if (car.slime > 0) drawCarSlime()
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  function drawWheel(x: number, y: number) {
    // Wheel arch
    ctx.fillStyle = "#1f2937"
    ctx.beginPath()
    ctx.arc(x, y - 3, 14.5, Math.PI, 0)
    ctx.fill()
    // Tyre
    ctx.fillStyle = "#111827"
    ctx.beginPath()
    ctx.arc(x, y, 12, 0, TAU)
    ctx.fill()
    // Whitewall
    ctx.strokeStyle = "#f3f4f6"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 8.5, 0, TAU)
    ctx.stroke()
    // Hubcap, rotating
    ctx.fillStyle = "#d1d5db"
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = "#6b7280"
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = car.wheel * car.facing + (i * Math.PI) / 2
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5)
    }
    ctx.stroke()
  }

  function drawBeacon(x: number, y: number, color: string, on: boolean) {
    // Base
    ctx.fillStyle = "#374151"
    ctx.fillRect(x - 5, y + 3, 10, 3)
    // Dome
    ctx.fillStyle = on ? color : shade(color)
    ctx.strokeStyle = "#111"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y + 3, 5, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    if (on) {
      const g = ctx.createRadialGradient(x, y + 1, 1, x, y + 1, 24)
      g.addColorStop(0, hexToRgba(color, 0.75))
      g.addColorStop(1, hexToRgba(color, 0))
      ctx.fillStyle = g
      ctx.fillRect(x - 26, y - 25, 52, 52)
    }
  }

  function shade(hex: string) {
    return hexToRgba(hex, 0.35)
  }

  function hexToRgba(hex: string, a: number) {
    const n = parseInt(hex.slice(1), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    return `rgba(${r},${g},${b},${a})`
  }

  function drawGhostbuster() {
    // Drawn in car-local coordinates (car facing +x). The buster leans out of
    // the rear door window (x in [-42,-14], sill at y = -41). The figure was
    // laid out for a sill at y = -48 and window centre x = -21, so shift it.
    ctx.save()
    ctx.translate(-7, 7)
    const a = rad(car.aim)
    const khaki = "#c9b58a"
    const khakiDark = "#a8935f"
    const skin = "#e8b894"
    const shoulder = { x: -13, y: -60 }

    // Proton pack (behind the torso)
    ctx.fillStyle = "#3a3d42"
    ctx.strokeStyle = "#111"
    ctx.lineWidth = 1
    roundRect(-40, -68, 13, 20, 3)
    ctx.fill()
    ctx.stroke()
    // Cyclotron: four red lights in a ring, chasing when firing
    ctx.fillStyle = "#26282c"
    ctx.beginPath()
    ctx.arc(-33.5, -55, 4.6, 0, TAU)
    ctx.fill()
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4
      const active = car.firing
        ? Math.floor(time * 12) % 4 === i
        : Math.floor(time * 3) % 4 === i
      ctx.fillStyle = active ? "#ff3b3b" : "#6b1a1a"
      ctx.beginPath()
      ctx.arc(
        -33.5 + Math.cos(ang) * 2.8,
        -55 + Math.sin(ang) * 2.8,
        1.1,
        0,
        TAU,
      )
      ctx.fill()
    }
    // Power cell bar
    ctx.fillStyle = car.firing ? "#60a5fa" : "#1e3a8a"
    ctx.fillRect(-38, -66, 2, 6)

    // Torso
    ctx.fillStyle = khaki
    ctx.strokeStyle = "#3f3a2a"
    ctx.lineWidth = 1
    roundRect(-30, -66, 19, 20, 4)
    ctx.fill()
    ctx.stroke()
    // Chest name patch and belt
    ctx.fillStyle = "#d1252b"
    ctx.fillRect(-19, -61, 5, 2.5)
    ctx.fillStyle = khakiDark
    ctx.fillRect(-30, -49, 19, 2)
    // Window sill covers the lower torso
    ctx.fillStyle = "#f8f8f6"
    ctx.fillRect(-37, -48, 32, 3)
    ctx.strokeStyle = "#2a2a2e"
    ctx.beginPath()
    ctx.moveTo(-37, -48)
    ctx.lineTo(-5, -48)
    ctx.stroke()

    // Head
    ctx.fillStyle = skin
    ctx.strokeStyle = "#3f3a2a"
    ctx.beginPath()
    ctx.arc(-20, -72, 6.5, 0, TAU)
    ctx.fill()
    ctx.stroke()
    // Hair
    ctx.fillStyle = "#3b2a1a"
    ctx.beginPath()
    ctx.arc(-20, -73, 6.5, Math.PI * 1.05, Math.PI * 1.95)
    ctx.closePath()
    ctx.fill()
    // Eye and grin
    ctx.fillStyle = "#111"
    ctx.beginPath()
    ctx.arc(-17.5, -72, 0.9, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = "#111"
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.arc(-17, -70, 2.2, 0.1, Math.PI * 0.8)
    ctx.stroke()

    // Hose from pack to wand
    const hand = {
      x: shoulder.x + Math.cos(a) * 12,
      y: shoulder.y - Math.sin(a) * 12,
    }
    ctx.strokeStyle = "#111"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-36, -50)
    ctx.quadraticCurveTo(-40, -36, hand.x - 2, hand.y + 6)
    ctx.stroke()

    // Arm
    ctx.strokeStyle = khaki
    ctx.lineWidth = 4.5
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(shoulder.x, shoulder.y)
    ctx.lineTo(hand.x, hand.y)
    ctx.stroke()
    ctx.lineCap = "butt"

    // Neutrona wand
    ctx.save()
    ctx.translate(hand.x, hand.y)
    ctx.rotate(-a)
    ctx.fillStyle = "#111"
    ctx.fillRect(-4, -1.5, 6, 3) // grip
    ctx.fillStyle = "#9ca3af"
    ctx.fillRect(-2, -2.2, 20, 4.4) // barrel
    ctx.fillStyle = "#4b5563"
    ctx.fillRect(4, -3.2, 3, 6.4) // ring
    ctx.fillStyle = car.firing ? "#ffd166" : "#e5e7eb"
    ctx.fillRect(17, -1.4, 2.5, 2.8) // tip
    ctx.restore()
    // Glove
    ctx.fillStyle = "#3f3f46"
    ctx.beginPath()
    ctx.arc(hand.x, hand.y, 2.8, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  function drawCarSlime() {
    const f = clamp(car.slime / SLIME_TIME, 0, 1)
    const drip = (1 - f) * 26
    ctx.save()
    ctx.globalAlpha = 0.85 * Math.min(1, f * 3)
    ctx.fillStyle = "#7ee23c"
    const blobs = [
      [-40, -50, 12, 7],
      [-6, -54, 15, 8],
      [30, -42, 10, 6],
      [-62, -34, 8, 5],
      [12, -30, 9, 5],
    ]
    for (const [bx, by, bw, bh] of blobs) {
      ctx.beginPath()
      ctx.ellipse(car.x + bx, groundY + by, bw, bh, 0, 0, TAU)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(
        car.x + bx + bw * 0.3,
        groundY + by + drip * 0.6,
        2.5,
        3 + drip * 0.5,
        0,
        0,
        TAU,
      )
      ctx.fill()
    }
    ctx.restore()
  }

  // --- Ghost -----------------------------------------------------------------

  function drawGhost() {
    const r = GHOST_R
    const s = ghost.scale
    const bob = Math.sin(ghost.phase) * 3
    const angry = ghost.state === "windup" || ghost.state === "wrangled"
    const jitter = ghost.state === "windup" ? rand(-2, 2) : 0
    ctx.save()
    ctx.translate(ghost.x + jitter, ghost.y + bob)
    ctx.scale(s, s)
    ctx.globalAlpha = 0.92 * ghost.alpha

    // Ectoplasm glow
    const glow = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.9)
    glow.addColorStop(0, "rgba(120, 240, 70, 0.35)")
    glow.addColorStop(1, "rgba(120, 240, 70, 0)")
    ctx.fillStyle = glow
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4)

    // Arms (flapping)
    const flap = Math.sin(ghost.phase * 2) * 0.35
    ctx.fillStyle = "#6cc63a"
    ctx.strokeStyle = "#3f8f1e"
    ctx.lineWidth = 1.5
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(side * r * 0.95, r * 0.15)
      ctx.rotate(side * (0.5 + flap))
      ctx.beginPath()
      ctx.ellipse(0, 0, r * 0.32, r * 0.18, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    // Pear-shaped, ragged body
    const body = ctx.createRadialGradient(
      -r * 0.3,
      -r * 0.4,
      r * 0.1,
      0,
      0,
      r * 1.3,
    )
    body.addColorStop(0, "#c4f77a")
    body.addColorStop(0.5, "#7fd43c")
    body.addColorStop(1, "#4fae22")
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.bezierCurveTo(r * 1.15, -r, r * 1.25, r * 0.5, r * 0.62, r * 0.95)
    ctx.quadraticCurveTo(r * 0.4, r * 1.25, r * 0.22, r * 0.95)
    ctx.quadraticCurveTo(0, r * 1.3, -r * 0.22, r * 0.95)
    ctx.quadraticCurveTo(-r * 0.4, r * 1.25, -r * 0.62, r * 0.95)
    ctx.bezierCurveTo(-r * 1.25, r * 0.5, -r * 1.15, -r, 0, -r)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.35)"
    ctx.beginPath()
    ctx.ellipse(-r * 0.42, -r * 0.55, r * 0.22, r * 0.14, -0.5, 0, TAU)
    ctx.fill()

    // Eyes: small, beady, red irises
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#f8fafc"
      ctx.beginPath()
      ctx.ellipse(side * r * 0.32, -r * 0.35, r * 0.17, r * 0.14, 0, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = "#2f5d14"
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = "#c0392b"
      ctx.beginPath()
      ctx.arc(
        side * r * 0.32 + (angry ? side * r * 0.03 : 0),
        -r * 0.33,
        r * 0.07,
        0,
        TAU,
      )
      ctx.fill()
      ctx.fillStyle = "#111"
      ctx.beginPath()
      ctx.arc(
        side * r * 0.32 + (angry ? side * r * 0.03 : 0),
        -r * 0.33,
        r * 0.03,
        0,
        TAU,
      )
      ctx.fill()
    }
    // Brow when angry
    if (angry) {
      ctx.strokeStyle = "#2f5d14"
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-r * 0.5, -r * 0.62)
      ctx.lineTo(-r * 0.15, -r * 0.5)
      ctx.moveTo(r * 0.5, -r * 0.62)
      ctx.lineTo(r * 0.15, -r * 0.5)
      ctx.stroke()
    }

    // Enormous mouth
    const open = 0.75 + (angry ? 0.35 : 0.15 * Math.sin(ghost.phase * 1.5))
    ctx.fillStyle = "#4a0b16"
    ctx.beginPath()
    ctx.ellipse(0, r * 0.3, r * 0.6, r * 0.32 * open, 0, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = "#2f5d14"
    ctx.lineWidth = 1.2
    ctx.stroke()
    // Tongue
    ctx.fillStyle = "#e05a7a"
    ctx.beginPath()
    ctx.ellipse(0, r * 0.45, r * 0.32, r * 0.16 * open, 0, 0, TAU)
    ctx.fill()
    // Teeth
    ctx.fillStyle = "#f8fafc"
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(
        i * r * 0.2 - r * 0.06,
        r * 0.3 - r * 0.32 * open,
        r * 0.12,
        r * 0.14,
      )
    }

    ctx.restore()

    // Slime drips falling off him
    if (Math.random() < 0.25 && ghost.scale > 0.5 && mode === "playing") {
      emitSlime(ghost.x, ghost.y + r * 0.9)
    }
  }

  // --- Proton beam -------------------------------------------------------------

  function drawBeam() {
    // Modelled on the film look: a white-hot core fading through yellow to
    // orange, with purple/blue lightning coiling around the stream and a hard
    // flash at the wand tip.
    const pts = beamPoints
    if (pts.length < 2) return
    ctx.save()
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    const path = (jitter: number) => {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        const ox = jitter ? rand(-jitter, jitter) : 0
        const oy = jitter ? rand(-jitter, jitter) : 0
        ctx.lineTo(pts[i].x + ox, pts[i].y + oy)
      }
    }

    // Perpendicular direction at each point, for the coiling tendrils.
    const perp = (i: number) => {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      return { x: -dy / d, y: dx / d }
    }

    // Additive glow at night; against the bright daytime sky additive
    // blending washes out to white, so fall back to normal compositing.
    ctx.globalCompositeOperation = isDark() ? "lighter" : "source-over"
    path(0)
    ctx.strokeStyle = "rgba(255, 60, 0, 0.16)"
    ctx.lineWidth = 30
    ctx.stroke()
    path(0)
    ctx.strokeStyle = "rgba(255, 110, 10, 0.35)"
    ctx.lineWidth = 16
    ctx.stroke()
    path(0)
    ctx.strokeStyle = "rgba(255, 160, 40, 0.75)"
    ctx.lineWidth = 8
    ctx.stroke()
    path(0)
    ctx.strokeStyle = "rgba(255, 225, 140, 0.95)"
    ctx.lineWidth = 4.5
    ctx.stroke()
    path(0)
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.stroke()

    // Purple and blue lightning coiling around the core
    const coils: Array<[string, number, number, number]> = [
      ["rgba(167, 139, 250, 0.95)", 0.62, 0, 1.6],
      ["rgba(96, 165, 250, 0.9)", 0.62, Math.PI, 1.3],
      ["rgba(221, 214, 254, 0.7)", 0.41, 1.3, 0.9],
    ]
    for (const [color, freq, phase, width] of coils) {
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const f = i / (pts.length - 1)
        const n = perp(i)
        const amp = 4 + 6 * f
        const off = Math.sin(i * freq + phase + time * 32) * amp + rand(-2, 2)
        const x = pts[i].x + n.x * off
        const y = pts[i].y + n.y * off
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
    }

    // Little arcs and loops jumping off the stream
    ctx.lineWidth = 1.1
    for (let k = 0; k < 5; k++) {
      const i = 1 + Math.floor(Math.random() * (pts.length - 1))
      const p = pts[i]
      const n = perp(i)
      const side = Math.random() < 0.5 ? -1 : 1
      const len = rand(8, 22)
      const cx = p.x + n.x * side * len + rand(-6, 6)
      const cy = p.y + n.y * side * len + rand(-6, 6)
      const q = pts[Math.min(pts.length - 1, i + 2)]
      ctx.strokeStyle =
        k % 2 ? "rgba(167, 139, 250, 0.85)" : "rgba(125, 211, 252, 0.85)"
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.quadraticCurveTo(cx, cy, q.x, q.y)
      ctx.stroke()
    }

    // Muzzle flash with a lens-flare star
    const o = pts[0]
    const flare = 14 + Math.sin(time * 50) * 3
    const mg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, flare)
    mg.addColorStop(0, "rgba(255,255,255,1)")
    mg.addColorStop(0.35, "rgba(255,230,160,0.85)")
    mg.addColorStop(0.7, "rgba(255,140,40,0.4)")
    mg.addColorStop(1, "rgba(255,80,0,0)")
    ctx.fillStyle = mg
    ctx.fillRect(o.x - flare, o.y - flare, flare * 2, flare * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.8)"
    ctx.lineWidth = 1
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4 + time * 3
      const l = k % 2 ? flare * 1.6 : flare * 1.1
      ctx.beginPath()
      ctx.moveTo(o.x - Math.cos(a) * l, o.y - Math.sin(a) * l)
      ctx.lineTo(o.x + Math.cos(a) * l, o.y + Math.sin(a) * l)
      ctx.stroke()
    }

    // Wrangle halo where the stream grabs the ghost
    if (beamHit) {
      const e = pts[pts.length - 1]
      const rr = GHOST_R * ghost.scale + 12
      const hg = ctx.createRadialGradient(
        e.x,
        e.y,
        rr * 0.3,
        e.x,
        e.y,
        rr * 1.7,
      )
      hg.addColorStop(0, "rgba(255, 200, 120, 0.6)")
      hg.addColorStop(0.5, "rgba(167, 139, 250, 0.3)")
      hg.addColorStop(1, "rgba(96, 165, 250, 0)")
      ctx.fillStyle = hg
      ctx.fillRect(e.x - rr * 1.7, e.y - rr * 1.7, rr * 3.4, rr * 3.4)
    }
    ctx.restore()
  }

  // --- Ghost trap ----------------------------------------------------------------

  function trapOpen() {
    const t = trap.t
    if (t < 0.45) return 0
    if (t < 0.65) return easeOut((t - 0.45) / 0.2)
    if (t < 1.55) return 1
    if (t < 1.75) return 1 - easeOut((t - 1.55) / 0.2)
    return 0
  }

  function drawTrap() {
    const t = trap.t
    // Slide out from the back of the car during the first phase.
    const slide = easeOut(clamp(t / 0.45, 0, 1))
    const x = lerp(car.x - car.facing * 40, trap.x, slide)
    const y = groundY - 6
    const open = trapOpen()
    const fade = t > 2.2 ? 1 - (t - 2.2) / 0.3 : 1
    ctx.save()
    ctx.globalAlpha = clamp(fade, 0, 1)

    // Cable back to the car while it slides
    if (t < 1.75) {
      ctx.strokeStyle = "rgba(0,0,0,0.6)"
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(car.x - car.facing * 60, groundY - 8)
      ctx.quadraticCurveTo((car.x + x) / 2, groundY + 4, x, y + 4)
      ctx.stroke()
    }

    // Box body
    ctx.fillStyle = "#1f2125"
    ctx.strokeStyle = "#000"
    ctx.lineWidth = 1
    roundRect(x - 11, y - 6, 22, 12, 2)
    ctx.fill()
    ctx.stroke()
    // Hazard stripes on the sides
    ctx.save()
    ctx.beginPath()
    ctx.rect(x - 11, y - 1, 22, 6)
    ctx.clip()
    ctx.strokeStyle = "#facc15"
    ctx.lineWidth = 2.5
    for (let i = -14; i < 14; i += 6) {
      ctx.beginPath()
      ctx.moveTo(x + i, y + 6)
      ctx.lineTo(x + i + 6, y - 2)
      ctx.stroke()
    }
    ctx.restore()
    // Little wheels and pedal
    ctx.fillStyle = "#000"
    ctx.beginPath()
    ctx.arc(x - 8, y + 6, 2, 0, TAU)
    ctx.arc(x + 8, y + 6, 2, 0, TAU)
    ctx.fill()

    // Doors hinge open
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(x + side * 10, y - 6)
      ctx.rotate(-side * open * 1.35)
      ctx.fillStyle = "#facc15"
      ctx.strokeStyle = "#000"
      ctx.fillRect(side === -1 ? 0 : -10, -2.5, 10, 2.5)
      ctx.strokeRect(side === -1 ? 0 : -10, -2.5, 10, 2.5)
      ctx.fillStyle = "#111"
      for (let i = 0; i < 3; i++) {
        ctx.fillRect((side === -1 ? 1 : -9) + i * 3.5, -2.5, 1.5, 2.5)
      }
      ctx.restore()
    }
    ctx.restore()
  }

  function drawTrapLight() {
    const open = trapOpen()
    if (open <= 0) return
    const x = trap.x
    const y = groundY - 12
    const flicker = 0.75 + 0.25 * Math.sin(time * 40)
    ctx.save()
    ctx.globalAlpha = open * flicker
    ctx.globalCompositeOperation = "lighter"
    const g = ctx.createLinearGradient(0, y, 0, 0)
    g.addColorStop(0, "rgba(255,255,255,0.95)")
    g.addColorStop(0.25, "rgba(180, 225, 255, 0.55)")
    g.addColorStop(1, "rgba(120, 190, 255, 0)")
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x - 6, y)
    ctx.lineTo(x + 6, y)
    ctx.lineTo(x + 70, -10)
    ctx.lineTo(x - 70, -10)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // --- Particles -----------------------------------------------------------------

  function drawParticles(pal: Palette) {
    for (const p of particles) {
      const f = 1 - p.life / p.max
      if (p.kind === "smoke") {
        ctx.fillStyle = pal.stars
          ? `rgba(226,232,240,${0.45 * f})`
          : `rgba(71,85,105,${0.5 * f})`
      } else if (p.kind === "spark") {
        ctx.fillStyle =
          Math.random() < 0.5
            ? `rgba(255,200,80,${f})`
            : `rgba(120,200,255,${f})`
      } else {
        ctx.fillStyle = `rgba(126,226,60,${0.9 * f})`
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, TAU)
      ctx.fill()
    }
  }

  function drawSlimeOverlay() {
    const f = clamp(car.slime / SLIME_TIME, 0, 1)
    ctx.fillStyle = `rgba(126,226,60,${0.14 * f})`
    ctx.fillRect(0, 0, W, H)
  }

  // --- HUD -------------------------------------------------------------------

  function drawHud(pal: Palette) {
    const narrow = W < 480
    ctx.save()
    ctx.textBaseline = "top"
    ctx.shadowColor = pal.shadow
    ctx.shadowBlur = 4

    if (mode === "playing" || mode === "paused") {
      ctx.font = `bold ${narrow ? 12 : 14}px "Share Tech Mono", monospace`
      ctx.fillStyle = pal.text
      ctx.textAlign = "left"
      ctx.fillText(`BUSTED ${String(score.busted).padStart(2, "0")}`, 12, 10)
      ctx.textAlign = "right"
      ctx.fillText(
        `SLIMED ${String(score.slimed).padStart(2, "0")}`,
        W - 12,
        10,
      )
      ctx.textAlign = "center"
      ctx.font = `${narrow ? 11 : 12}px "Share Tech Mono", monospace`
      ctx.fillStyle = pal.accent
      ctx.fillText(`BEST ${String(score.best).padStart(2, "0")}`, W / 2, 11)

      if (!coarsePointer && !narrow) {
        // Control hint on a dark pill so it stays legible over the road.
        const hint = "← → drive  ·  space fire  ·  ↑ ↓ aim  ·  esc pause"
        ctx.font = '11px "Share Tech Mono", monospace'
        const hw = ctx.measureText(hint).width + 16
        ctx.shadowBlur = 0
        ctx.fillStyle = "rgba(0,0,0,0.6)"
        roundRect(8, H - 22, hw, 17, 8)
        ctx.fill()
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.fillStyle = "#f1f5f9"
        ctx.fillText(hint, 16, H - 13.5)
        ctx.textBaseline = "top"
        ctx.shadowBlur = 4
      }

      // Wrangle meter under the ghost
      if (ghost.state === "wrangled" && ghost.wrangle > 0) {
        const p = clamp(ghost.wrangle / WRANGLE_TIME, 0, 1)
        const bx = ghost.x - 24
        const by = ghost.y + GHOST_R + 14
        ctx.shadowBlur = 0
        ctx.fillStyle = "rgba(0,0,0,0.55)"
        ctx.fillRect(bx, by, 48, 5)
        ctx.fillStyle = "#ff7a1a"
        ctx.fillRect(bx, by, 48 * p, 5)
      }
    }

    if (message.text) {
      const p = message.t / message.dur
      const pop = p < 0.15 ? easeOut(p / 0.15) : 1
      const fade = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(W / 2, H * 0.36)
      ctx.scale(pop, pop)
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.font = `${narrow ? 30 : 40}px "VT323", "Share Tech Mono", monospace`
      ctx.lineWidth = 4
      ctx.strokeStyle = "rgba(0,0,0,0.85)"
      ctx.strokeText(message.text, 0, 0)
      ctx.fillStyle = message.text.startsWith("HE") ? "#7ee23c" : "#fbbf24"
      ctx.fillText(message.text, 0, 0)
      ctx.restore()
    }

    if (mode === "attract" || mode === "paused") {
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const cy = H * 0.34
      ctx.font = `${narrow ? 30 : 44}px "VT323", "Share Tech Mono", monospace`
      ctx.lineWidth = 5
      ctx.strokeStyle = "rgba(0,0,0,0.85)"
      ctx.fillStyle = mode === "paused" ? "#fbbf24" : "#4ade80"
      const title = mode === "paused" ? "PAUSED" : "ECTO-1 GHOST PATROL"
      ctx.strokeText(title, W / 2, cy)
      ctx.fillText(title, W / 2, cy)

      ctx.font = `${narrow ? 12 : 14}px "Share Tech Mono", monospace`
      ctx.fillStyle = "#f8fafc"
      ctx.lineWidth = 3
      const blink = Math.floor(time * 1.6) % 2 === 0 || reducedMotion
      if (blink) {
        const sub =
          mode === "paused"
            ? "click or tap to resume"
            : coarsePointer
              ? "tap to start  ·  use the buttons to drive & fire"
              : "click to start  ·  ← → drive  ·  space fire"
        ctx.strokeText(sub, W / 2, cy + (narrow ? 24 : 32))
        ctx.fillText(sub, W / 2, cy + (narrow ? 24 : 32))
      }
      if (mode === "attract" && score.best > 0) {
        ctx.font = '12px "Share Tech Mono", monospace'
        ctx.fillStyle = "#fbbf24"
        ctx.strokeText(
          `best: ${score.best} busted`,
          W / 2,
          cy + (narrow ? 42 : 54),
        )
        ctx.fillText(
          `best: ${score.best} busted`,
          W / 2,
          cy + (narrow ? 42 : 54),
        )
      }
    }
    ctx.restore()
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  function frame(now: number) {
    raf = 0
    if (destroyed) return
    if (!lastFrame) lastFrame = now
    const dt = Math.min(0.05, (now - lastFrame) / 1000)
    lastFrame = now
    if (mode !== "paused") update(dt)
    render()
    const idleStatic = mode === "attract" && reducedMotion
    const keepGoing =
      visible &&
      document.visibilityState !== "hidden" &&
      mode !== "paused" &&
      !idleStatic
    if (keepGoing) raf = requestAnimationFrame(frame)
    else lastFrame = 0
  }

  function startLoop() {
    if (destroyed || raf) return
    raf = requestAnimationFrame(frame)
  }

  // Initial state
  resize()
  car.x = W + CAR_HALF
  if (reducedMotion) car.x = W * 0.6
  ghost.respawn = 0.5
  startLoop()

  return {
    destroy() {
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("keydown", onKeyDown)
      canvas.removeEventListener("keyup", onKeyUp)
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("blur", onBlur)
      buttonCleanups.forEach(fn => fn())
    },
  }
}
