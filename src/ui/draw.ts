import { HANDLE_ZOOM, type App, type HandlePos } from './app.ts'
import type { FieldObj, PatchObject, Role, SoundObj } from '../core/types.ts'
import {
  PPQ,
  RIPPLE_SPEED,
  STAGE_HALF,
  MIDI_MAX,
  MIDI_MIN,
} from '../core/constants.ts'
import { byLayer } from '../core/patch.ts'
import { angleTurns, depthAt, isCircle } from '../core/geometry.ts'
import { pose } from '../core/motion.ts'
import { soundTypes } from '../core/sounds/registry.ts'
import { fieldTypes } from '../core/fields/registry.ts'
import { pulseHits, pulseLength, euclid } from '../core/fields/generators.ts'
import {
  indexToMidi,
  midiToY,
  nearestIndex,
  noteName,
  scaleSteps,
  yToMidi,
} from '../core/music.ts'
import { BG, FONT, FONT_SMALL, INK, rgba } from './theme.ts'
import { soundDetail, soundPath } from './glyphs.ts'
import { drawPalette } from './palette.ts'
import { drawTimeline, STRIP_H } from './timeline.ts'
import { drawPanel } from './panel.ts'
import { drawMotionBar } from './motionbar.ts'

const TAU = Math.PI * 2

export function draw(app: App): void {
  const g = app.g
  g.setTransform(app.dpr, 0, 0, app.dpr, 0, 0)
  g.fillStyle = BG
  g.fillRect(0, 0, app.W, app.H)
  drawGuides(app)

  const objs = app.view.objects.slice().sort(byLayer)
  for (const o of objs) if (o.kind === 'field') drawField(app, o)
  drawRipples(app)
  drawCauses(app)
  for (const o of objs) if (o.kind === 'sound') drawSound(app, o)

  const sel = app.obj(app.sel)
  if (sel) drawMotionGuide(app, sel)
  if (app.cam.zoom >= HANDLE_ZOOM) {
    const ids = new Set([
      app.sel,
      app.hover?.kind === 'object' || app.hover?.kind === 'handle'
        ? app.hover.id
        : null,
    ])
    for (const id of ids) {
      const o = app.obj(id)
      if (o) drawHandles(app, o)
    }
  }
  if (app.drag?.kind === 'move') {
    const o = app.obj(app.drag.id)
    if (o?.kind === 'sound') drawPitchLadder(app, o)
  }

  drawMotionBar(app)
  drawTabStack(app)
  drawLogo(app)
  drawPalette(app)
  drawTimeline(app)
  if (app.scrub && !app.scrub.cancelled) {
    g.strokeStyle = rgba('transformer', 0.5)
    g.lineWidth = 2
    g.strokeRect(1, 1, app.W - 2, app.H - STRIP_H - 2)
    g.font = FONT
    g.fillStyle = rgba('transformer', 0.8)
    g.textAlign = 'right'
    g.textBaseline = 'top'
    g.fillText('HISTORY PREVIEW', app.W - 14, 12)
  }
  if (app.panel) drawPanel(app)
  if (app.showHelp) drawHelp(app)
  drawToast(app)
}

/** After Tab: the stack under the cursor, with the current pick marked. */
function drawTabStack(app: App): void {
  const info = app.tabInfo
  if (!info) return
  const age = performance.now() - info.t
  if (age > 2500) return
  const g = app.g
  const a = Math.min(1, (2500 - age) / 400)
  g.font = FONT_SMALL
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  const rows = info.stack.map((id) => {
    const o = app.obj(id)
    const label = !o
      ? id
      : o.kind === 'sound'
        ? (soundTypes[o.type]?.label ?? o.type)
        : (fieldTypes[o.type]?.label ?? o.type)
    const role: Role | 'sound' =
      !o || o.kind === 'sound' ? 'sound' : (fieldTypes[o.type]?.role ?? 'fx')
    return { id, text: `${label} ${id}`, role }
  })
  const w = Math.max(...rows.map((r) => g.measureText(r.text).width)) + 34
  const x = Math.min(app.mouse.x + 16, app.W - w - 8)
  const y = Math.min(
    app.mouse.y + 14,
    app.H - STRIP_H - rows.length * 17 - 14,
  )
  g.fillStyle = `rgba(11,11,14,${0.9 * a})`
  g.beginPath()
  g.roundRect(x, y, w, rows.length * 17 + 10, 6)
  g.fill()
  rows.forEach((r, i) => {
    const on = r.id === app.sel
    g.fillStyle = rgba(r.role, (on ? 1 : 0.5) * a)
    g.fillText((on ? '▸ ' : '  ') + r.text, x + 8, y + 13 + i * 17)
  })
  g.fillStyle = `rgba(233,228,218,${0.3 * a})`
  g.textAlign = 'right'
  g.fillText(
    `${info.stack.indexOf(app.sel ?? '') + 1}/${info.stack.length}`,
    x + w - 8,
    y + 13,
  )
}

function drawLogo(app: App): void {
  const g = app.g
  g.font = "50px 'gener8-logo', ui-monospace, Menlo, monospace"
  g.textAlign = 'left'
  g.textBaseline = 'top'
  g.fillStyle = 'rgba(233,228,218,0.7)'
  g.fillText('GENER8', 10, 4)
}

function dim(app: App, sx: number, sy: number, id: string): number {
  if (!app.mouse.inside || id === app.sel || app.drag) return 1
  if (
    (app.hover?.kind === 'object' || app.hover?.kind === 'handle') &&
    app.hover.id === id
  )
    return 1
  const d = Math.hypot(sx - app.mouse.x, sy - app.mouse.y)
  return Math.min(1, Math.max(0.35, 1 - (d - 260) / 420))
}

function drawGuides(app: App): void {
  const g = app.g
  const z = app.cam.zoom
  const root = app.view.key.root
  g.font = FONT_SMALL
  g.textAlign = 'left'
  g.textBaseline = 'bottom'
  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
    if ((((m - root) % 12) + 12) % 12 !== 0) continue
    const [, sy] = app.w2s(0, midiToY(m))
    if (sy < 0 || sy > app.H - STRIP_H) continue
    g.fillStyle = 'rgba(233,228,218,0.035)'
    g.fillRect(0, sy, app.W, 1)
    if (z >= 0.3) {
      g.fillStyle = 'rgba(233,228,218,0.22)'
      g.fillText(noteName(m), 82, sy - 2)
    }
  }
  g.setLineDash([2, 6])
  g.strokeStyle = 'rgba(233,228,218,0.06)'
  g.lineWidth = 1
  for (const x of [-STAGE_HALF, STAGE_HALF]) {
    const [sx] = app.w2s(x, 0)
    g.beginPath()
    g.moveTo(sx, 0)
    g.lineTo(sx, app.H - STRIP_H)
    g.stroke()
    g.fillStyle = 'rgba(233,228,218,0.2)'
    g.textBaseline = 'top'
    g.fillText(x < 0 ? 'L' : 'R', sx + 4, 6)
  }
  g.setLineDash([])
}

function fieldPath(
  g: CanvasRenderingContext2D,
  f: FieldObj,
  sx: number,
  sy: number,
  R: number,
  now: number,
): void {
  g.beginPath()
  if (f.type === 'drift') {
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * TAU
      const rr =
        R *
        (1 +
          0.025 * Math.sin(a * 5 + now / 900) +
          0.015 * Math.sin(a * 3 - now / 1300))
      const x = sx + Math.sin(a) * rr
      const y = sy - Math.cos(a) * rr
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
  } else {
    g.arc(sx, sy, R, 0, TAU)
  }
}

function drawField(app: App, f: FieldObj): void {
  const g = app.g
  const t = fieldTypes[f.type]
  const role = t?.role ?? 'fx'
  const p = app.poseOf(f)
  const [sx, sy] = app.w2s(p.x, p.y)
  const z = app.cam.zoom
  const a = dim(app, sx, sy, f.id)
  const fl = app.fieldFlash.get(f.id)
  const k = fl ? Math.max(0, 1 - (app.now - fl) / 220) : 0
  const sel = app.sel === f.id
  const stroke = rgba(
    role,
    Math.min(1, (0.36 + 0.45 * k + (sel ? 0.35 : 0)) * a),
  )

  if (isCircle(f.shape)) {
    const R = f.shape.r * p.scale * z
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, R)
    grad.addColorStop(0, rgba(role, (role === 'fx' ? 0.15 : 0.085) * a))
    grad.addColorStop(1, rgba(role, 0.012 * a))
    g.fillStyle = grad
    fieldPath(g, f, sx, sy, R, app.now)
    g.fill()
    g.strokeStyle = stroke
    g.lineWidth = sel ? 1.6 : 1.1
    if (role === 'transformer') g.setLineDash([6, 5])
    g.stroke()
    g.setLineDash([])
    if (f.type === 'pulse') drawPulseRing(app, f, sx, sy, R, a)
    if (R > 26) {
      g.font = '13px ui-monospace, Menlo, monospace'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = rgba(role, 0.75 * a)
      g.fillText(t?.glyph ?? '?', sx, sy - R + 16)
    }
    if (z >= 1.1 || sel) fieldLabel(app, f, sx, sy - R - 10, a)
  } else {
    const w = f.shape.w * p.scale * z
    const h = f.shape.h * p.scale * z
    const x0 = sx - w / 2
    const y0 = sy - h / 2
    g.fillStyle = rgba(role, 0.04 * a)
    g.fillRect(x0, y0, w, h)
    const grid = app.grids.get(f.id)
    if (grid) {
      const cw = w / grid.cols
      const ch = h / grid.rows
      const fresh = Math.max(0, 1 - (app.now - grid.t) / 200)
      g.fillStyle = rgba(role, (0.22 + 0.15 * fresh) * a)
      for (let r = 0; r < grid.rows; r++)
        for (let c = 0; c < grid.cols; c++)
          if (grid.cells[r * grid.cols + c])
            g.fillRect(x0 + c * cw + 1, y0 + r * ch + 1, cw - 2, ch - 2)
      if (z >= 0.8) {
        g.strokeStyle = rgba(role, 0.07 * a)
        g.lineWidth = 1
        g.beginPath()
        for (let c = 1; c < grid.cols; c++) {
          g.moveTo(x0 + c * cw, y0)
          g.lineTo(x0 + c * cw, y0 + h)
        }
        for (let r = 1; r < grid.rows; r++) {
          g.moveTo(x0, y0 + r * ch)
          g.lineTo(x0 + w, y0 + r * ch)
        }
        g.stroke()
      }
    }
    g.strokeStyle = stroke
    g.lineWidth = sel ? 1.6 : 1.1
    if (role === 'transformer') g.setLineDash([6, 5])
    g.strokeRect(x0, y0, w, h)
    g.setLineDash([])
    g.font = '13px ui-monospace, Menlo, monospace'
    g.textAlign = 'left'
    g.textBaseline = 'top'
    g.fillStyle = rgba(role, 0.75 * a)
    g.fillText(t?.glyph ?? '?', x0 + 6, y0 + 5)
    if (z >= 1.1 || sel) fieldLabel(app, f, sx, y0 - 10, a)
  }
}

function fieldLabel(
  app: App,
  f: FieldObj,
  x: number,
  y: number,
  a: number,
): void {
  const g = app.g
  const t = fieldTypes[f.type]
  if (!t) return
  const parts = [
    t.label,
    ...t.handles.map((h) => h.format(f.handles[h.key] ?? h.default, f.handles)),
  ]
  g.font = FONT_SMALL
  g.textAlign = 'center'
  g.textBaseline = 'bottom'
  g.fillStyle = rgba(t.role, 0.7 * a)
  g.fillText(parts.join(' · ') + `  [${f.layer}]`, x, y)
}

/** Music-box metaphor: the pattern's hits rotate clockwise; a sound fires when a hit passes its angle. */
function drawPulseRing(
  app: App,
  f: FieldObj,
  sx: number,
  sy: number,
  R: number,
  a: number,
): void {
  const g = app.g
  const n = pulseLength(f.handles)
  const k = pulseHits(f.handles)
  const phase = app.tickNow / (PPQ / 4)
  const rr = R - 9
  if (rr < 8) return
  for (let i = 0; i < n; i++) {
    const ang = ((i + phase) / n) * TAU
    const x = sx + Math.sin(ang) * rr
    const y = sy - Math.cos(ang) * rr
    g.beginPath()
    if (euclid(i, k, n)) {
      g.fillStyle = rgba('generator', 0.85 * a)
      g.arc(x, y, i === 0 ? 3.6 : 2.8, 0, TAU)
      g.fill()
    } else {
      g.fillStyle = rgba('generator', 0.25 * a)
      g.arc(x, y, 1.2, 0, TAU)
      g.fill()
    }
  }
  // each member's listening position on the rim
  const fp = app.poseOf(f)
  g.strokeStyle = rgba('sound', 0.5 * a)
  g.lineWidth = 1.5
  for (const o of app.view.objects) {
    if (o.kind !== 'sound') continue
    const sp = app.poseOf(o)
    if (depthAt(f.shape, fp.x, fp.y, fp.scale, sp.x, sp.y) <= 0) continue
    const rot = Math.round(angleTurns(fp.x, fp.y, sp.x, sp.y) * n) % n
    const ang = (rot / n) * TAU
    g.beginPath()
    g.moveTo(sx + Math.sin(ang) * (R - 2), sy - Math.cos(ang) * (R - 2))
    g.lineTo(sx + Math.sin(ang) * (R + 5), sy - Math.cos(ang) * (R + 5))
    g.stroke()
  }
}

function drawRipples(app: App): void {
  const g = app.g
  const z = app.cam.zoom
  g.lineWidth = 1
  for (const r of app.ripples) {
    const rad = ((app.tickNow - r.tick) / PPQ) * RIPPLE_SPEED
    if (rad <= 0) continue
    const al = (1 - rad / r.maxR) * 0.4 * (0.4 + 0.6 * r.vel)
    if (al <= 0) continue
    const [sx, sy] = app.w2s(r.x, r.y)
    g.strokeStyle = `rgba(233,228,218,${al})`
    g.beginPath()
    g.arc(sx, sy, rad * z, 0, TAU)
    g.stroke()
  }
}

function drawCauses(app: App): void {
  const g = app.g
  for (const c of app.causes) {
    const a = app.obj(c.from)
    const b = app.obj(c.to)
    if (!a || !b) continue
    const pa = app.poseOf(a)
    const pb = app.poseOf(b)
    const [ax, ay] = app.w2s(pa.x, pa.y)
    const [bx, by] = app.w2s(pb.x, pb.y)
    const k = 1 - (app.now - c.t) / 500
    g.strokeStyle = `rgba(233,228,218,${0.45 * k})`
    g.lineWidth = 1
    g.setLineDash([2, 4])
    g.beginPath()
    g.moveTo(ax, ay)
    g.lineTo(bx, by)
    g.stroke()
    g.setLineDash([])
  }
}

function soundPitch(app: App, o: SoundObj): number {
  const p = app.poseOf(o)
  const m = yToMidi(p.y)
  const k = app.view.key
  const steps = scaleSteps(k.scale)
  return indexToMidi(nearestIndex(m, k.root, steps), k.root, steps)
}

function drawSound(app: App, o: SoundObj): void {
  const g = app.g
  const t = soundTypes[o.type]
  const glyph = t?.glyph ?? 'ring'
  const p = app.poseOf(o)
  const [sx, sy] = app.w2s(p.x, p.y)
  const r = app.soundRadius(o)
  const a = dim(app, sx, sy, o.id)
  const pulse = app.pulses.get(o.id)
  const dur = pulse?.accent ? 700 : 320
  const age = pulse ? app.now - pulse.t : 1e9
  const k = Math.max(0, 1 - age / dur)
  const vel = pulse?.vel ?? 0
  const listener = t?.mode === 'event' && !app.driven.has(o.id)
  const zoomedOut = app.cam.zoom < HANDLE_ZOOM

  if (k > 0) {
    g.fillStyle = rgba('sound', 0.09 * k * (0.4 + vel))
    g.beginPath()
    g.arc(sx, sy, r * (1.5 + 0.8 * k) + (zoomedOut ? 8 * k : 0), 0, TAU)
    g.fill()
  }
  soundPath(g, glyph, sx, sy, r)
  if (listener) {
    g.fillStyle = rgba('sound', (0.06 + 0.6 * k) * a)
    g.fill()
    g.strokeStyle = rgba('sound', 0.85 * a)
    g.lineWidth = 1.5
    g.stroke()
  } else {
    g.fillStyle = rgba('sound', Math.min(1, (0.6 + 0.4 * k) * a))
    g.fill()
  }
  g.strokeStyle = listener ? rgba('sound', 0.6 * a) : BG
  g.lineWidth = 1.2
  soundDetail(g, glyph, sx, sy, r)
  if (k > 0) {
    g.strokeStyle = rgba('sound', 0.7 * k)
    g.lineWidth = 1.2
    g.beginPath()
    g.arc(sx, sy, r + 3 + (1 - k) * (8 + 16 * vel), 0, TAU)
    g.stroke()
  }
  if (app.sel === o.id) {
    g.strokeStyle = INK
    g.lineWidth = 1
    g.setLineDash([3, 3])
    g.beginPath()
    g.arc(sx, sy, r + 7, 0, TAU)
    g.stroke()
    g.setLineDash([])
  }
  const hovered = app.hover?.kind === 'object' && app.hover.id === o.id
  if (app.cam.zoom >= 1.1 || hovered || app.sel === o.id) {
    g.font = FONT_SMALL
    g.textAlign = 'center'
    g.textBaseline = 'top'
    g.fillStyle = rgba('sound', 0.6 * a)
    g.fillText(
      `${noteName(soundPitch(app, o))} · ${t?.label ?? o.type}`,
      sx,
      sy + r + 6,
    )
  }
}

function drawMotionGuide(app: App, o: PatchObject): void {
  const m = o.motion
  if (!m?.pos && !m?.breathe) return
  const g = app.g
  const [hx, hy] = app.w2s(o.x, o.y)
  g.strokeStyle = 'rgba(233,228,218,0.25)'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(hx - 5, hy)
  g.lineTo(hx + 5, hy)
  g.moveTo(hx, hy - 5)
  g.lineTo(hx, hy + 5)
  g.stroke()
  if (m.pos) {
    const period = m.pos.type === 'drift' ? 64 : m.pos.periodBeats
    const tmp = { x: 0, y: 0, scale: 1 }
    g.setLineDash([3, 5])
    g.beginPath()
    for (let i = 0; i <= 128; i++) {
      pose(o, app.beat + (period * i) / 128, app.view.seed, tmp)
      const [x, y] = app.w2s(tmp.x, tmp.y)
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
    g.setLineDash([])
  }
  g.font = FONT_SMALL
  g.textAlign = 'left'
  g.textBaseline = 'bottom'
  g.fillStyle = 'rgba(233,228,218,0.4)'
  const parts: string[] = []
  if (m.pos)
    parts.push(
      `${m.pos.type} ${'periodBeats' in m.pos ? m.pos.periodBeats : m.pos.rateBeats} beats`,
    )
  if (m.breathe) parts.push(`breathe ${m.breathe.periodBeats} beats`)
  g.fillText(parts.join(' · '), hx + 8, hy - 8)
}

function drawHandles(app: App, o: PatchObject): void {
  const g = app.g
  const role = o.kind === 'sound' ? 'sound' : (fieldTypes[o.type]?.role ?? 'fx')
  const hov =
    app.hover?.kind === 'handle' && app.hover.id === o.id ? app.hover.h : null
  const act =
    app.drag?.kind === 'handle' && app.drag.id === o.id ? app.drag.h : null
  for (const h of app.handlesFor(o)) {
    const on = same(h, hov) || same(h, act)
    g.lineWidth = 1.2
    if (h.kind === 'char' && o.kind === 'field') {
      const v = o.handles[h.key!] ?? 0
      g.fillStyle = BG
      g.strokeStyle = rgba(role, 0.9)
      g.beginPath()
      g.arc(h.x, h.y, 7, 0, TAU)
      g.fill()
      g.stroke()
      g.fillStyle = rgba(role, 0.9)
      g.beginPath()
      g.moveTo(h.x, h.y)
      g.arc(h.x, h.y, 7, -Math.PI / 2, -Math.PI / 2 + v * TAU)
      g.closePath()
      g.fill()
      if (on) {
        const spec = fieldTypes[o.type]?.handles.find((s) => s.key === h.key)
        if (spec)
          tag(
            app,
            h.x + 12,
            h.y,
            `${spec.label}: ${spec.format(v, o.handles)}  ↕ drag`,
            role,
          )
      }
    } else if (h.kind === 'size') {
      g.fillStyle = on ? rgba(role, 0.9) : BG
      g.strokeStyle = rgba(role, 0.9)
      g.beginPath()
      g.rect(h.x - 4, h.y - 4, 8, 8)
      g.fill()
      g.stroke()
      if (on)
        tag(
          app,
          h.x + 10,
          h.y,
          o.kind === 'sound'
            ? `size ${o.size} (loudness, reach)`
            : 'size (intensity)',
          role,
        )
    } else {
      g.fillStyle = on ? INK : BG
      g.strokeStyle = 'rgba(233,228,218,0.7)'
      g.beginPath()
      g.arc(h.x, h.y, 4.5, 0, TAU)
      g.fill()
      g.stroke()
    }
  }
}

function same(a: HandlePos, b: HandlePos | null): boolean {
  return !!b && a.kind === b.kind && a.key === b.key && a.index === b.index
}

function tag(
  app: App,
  x: number,
  y: number,
  text: string,
  role: 'sound' | 'generator' | 'transformer' | 'fx',
): void {
  const g = app.g
  g.font = FONT_SMALL
  const w = g.measureText(text).width + 10
  g.fillStyle = 'rgba(11,11,14,0.85)'
  g.fillRect(x, y - 9, w, 18)
  g.fillStyle = rgba(role, 0.95)
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText(text, x + 5, y)
}

function drawPitchLadder(app: App, o: SoundObj): void {
  if (soundTypes[o.type]?.mode !== 'event') return
  const g = app.g
  const k = app.view.key
  const steps = scaleSteps(k.scale)
  const p = app.poseOf(o)
  const [sx] = app.w2s(p.x, p.y)
  const r = app.soundRadius(o)
  const idx = nearestIndex(yToMidi(p.y), k.root, steps)
  g.font = FONT_SMALL
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  for (let d = -5; d <= 5; d++) {
    const m = indexToMidi(idx + d, k.root, steps)
    const [, y] = app.w2s(0, midiToY(m))
    g.fillStyle = d === 0 ? INK : 'rgba(233,228,218,0.3)'
    g.fillRect(sx + r + 10, y, d === 0 ? 14 : 8, 1)
    if (d === 0) g.fillText(noteName(m), sx + r + 28, y)
  }
}

const HELP = [
  'gener8: place sounds, overlap fields. no cables.',
  '',
  'space            start / pause audio',
  'drag palette     place a sound or field',
  'drag object      move (y = pitch, x = pan) · alt-drag duplicates',
  'size handle ▪    sound: loudness + ripple reach · field: extent',
  'character ◔      drag up/down',
  'pinch / ⌘-wheel  zoom · two-finger / right-drag / space-drag: pan',
  'zoom in on sound or double-click   open its internals',
  'select anything  motion bar below it: breathe / orbit / drift / path',
  '                 drag or scroll its values (depth, period, radius…)',
  'm / b            shortcuts: cycle motion / toggle breathe',
  'tab / shift-tab  cycle through everything under the cursor (incl. field edges)',
  '[ ]              layer down / up (order within a role)',
  '↑ ↓ ← →          nudge a semitone (shift: an octave)',
  'delete           remove selection',
  'c                capture last 30 s (WAV + patch/seed/edit log)',
  't                tap tempo · wheel over bpm / root / scale / seed',
  'timeline strip   drag to preview the past · release to branch',
  '⌘S / ⌘O / drop   save / open patch JSON',
  'shift-D / shift-T / shift-R / shift-X  ambient / tape / rhythmic demo / stress patch',
  '',
  'colour = role: warm white sound · amber generator · teal transformer · violet fx',
  'filled sounds are driven by a generator · hollow sounds listen for ripples',
]

function drawHelp(app: App): void {
  const g = app.g
  const w = 560
  const h = HELP.length * 17 + 30
  const x = (app.W - w) / 2
  const y = (app.H - h) / 2
  g.fillStyle = 'rgba(11,11,14,0.94)'
  g.strokeStyle = 'rgba(233,228,218,0.2)'
  g.beginPath()
  g.roundRect(x, y, w, h, 8)
  g.fill()
  g.stroke()
  g.font = FONT
  g.textAlign = 'left'
  g.textBaseline = 'top'
  HELP.forEach((l, i) => {
    g.fillStyle = i === 0 ? INK : 'rgba(233,228,218,0.7)'
    g.fillText(l, x + 18, y + 16 + i * 17)
  })
}

function drawToast(app: App): void {
  if (!app.toastMsg) return
  const age = performance.now() - app.toastT
  if (age > 2600) return
  const a = Math.min(1, (2600 - age) / 400)
  const g = app.g
  g.font = FONT
  g.textAlign = 'center'
  g.textBaseline = 'bottom'
  g.fillStyle = `rgba(233,228,218,${0.85 * a})`
  g.fillText(app.toastMsg, app.W / 2, app.H - STRIP_H - 12)
}
