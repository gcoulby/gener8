import { HANDLE_ZOOM, type App, type HandlePos } from './app.ts'
import type {
  Axis,
  FieldObj,
  PatchObject,
  Role,
  SoundObj,
} from '../core/types.ts'
import { PPQ, RIPPLE_SPEED, MIDI_MAX, MIDI_MIN } from '../core/constants.ts'
import { byLayer } from '../core/patch.ts'
import { angleTurns, depthAt, isCircle, shapeDims } from '../core/geometry.ts'
import { followPose } from '../core/motion.ts'
import { soundTypes } from '../core/sounds/registry.ts'
import { fieldTypes, isMap, mapTypeOf } from '../core/fields/registry.ts'
import { triCorner } from '../core/fields/maps.ts'
import { pulseHits, pulseLength, euclid } from '../core/fields/generators.ts'
import {
  indexToMidi,
  nearestIndex,
  noteName,
  scaleSteps,
} from '../core/music.ts'
import {
  axisOffset,
  governingAxis,
  rippleOf,
  targetOf,
  traceTurns,
} from '../core/placement.ts'
import { targetLabel } from './motionbar.ts'
import { BG, FONT, FONT_SMALL, INK, rgba } from './theme.ts'
import { soundDetail, soundPath } from './glyphs.ts'
import { drawPalette } from './palette.ts'
import { drawTimeline } from './timeline.ts'
import { drawPanel } from './panel.ts'
import { drawAxisMenu, drawMotionBar } from './motionbar.ts'
import { drawMixer } from './mixer.ts'
import { drawMinimap } from './minimap.ts'

const TAU = Math.PI * 2

export function draw(app: App): void {
  const g = app.g
  g.setTransform(app.dpr, 0, 0, app.dpr, 0, 0)
  g.fillStyle = BG
  g.fillRect(0, 0, app.W, app.H)

  const objs = app.view.objects.slice().sort(byLayer)
  // XY fields are the ground: drawn first, under every other field
  for (const o of objs) if (isMap(o)) drawMap(app, o)
  for (const o of objs) if (o.kind === 'field' && !isMap(o)) drawField(app, o)
  drawRipples(app)
  drawCauses(app)
  drawFollowLinks(app)
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
  drawMinimap(app)
  drawAxisMenu(app)
  drawTabStack(app)
  drawLogo(app)
  drawPalette(app)
  drawTimeline(app)
  drawMixer(app)
  if (app.scrub && !app.scrub.cancelled) {
    g.strokeStyle = rgba('transformer', 0.5)
    g.lineWidth = 2
    g.strokeRect(1, 1, app.W - 2, app.H - app.barH - 2)
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
  const y = Math.min(app.mouse.y + 14, app.H - app.barH - rows.length * 17 - 14)
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

const SUBTITLE = 'A GENERATIVE MUSIC INSTRUMENT'
const SANS =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif'

/** Bottom edge of the logo block, for laying out what sits under it. */
export let logoBottom = 0

function drawLogo(app: App): void {
  const g = app.g
  const x = 10
  const y = 4
  g.font = app.mobile
    ? "32px 'gener8-logo', ui-monospace, Menlo, monospace"
    : "50px 'gener8-logo', ui-monospace, Menlo, monospace"
  g.textAlign = 'left'
  g.textBaseline = 'top'
  g.fillStyle = 'rgba(233,228,218,0.7)'
  g.fillText('GENER8', x, y)

  // Subtitle in a plain sans, sized so its ink spans exactly the logo's ink.
  const m = g.measureText('GENER8')
  const left = x - m.actualBoundingBoxLeft
  const width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
  const inkW = (size: number) => {
    g.font = `600 ${size}px ${SANS}`
    const t = g.measureText(SUBTITLE)
    return t.actualBoundingBoxLeft + t.actualBoundingBoxRight
  }
  let size = (10 * width) / inkW(10)
  size *= width / inkW(size) // one correction pass: glyph widths don't scale perfectly linearly
  g.font = `600 ${size}px ${SANS}`
  const t = g.measureText(SUBTITLE)
  const top = y + m.actualBoundingBoxDescent + Math.max(4, size * 0.5)
  g.fillStyle = 'rgba(233,228,218,0.5)'
  g.fillText(SUBTITLE, left + t.actualBoundingBoxLeft, top)
  logoBottom = top + t.actualBoundingBoxDescent
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

/** Values worth a guide line on an axis: the key's root in every octave for pitch, centre for pan. */
function guideValues(a: Axis, root: number): number[] {
  const lo = Math.min(a.min, a.max)
  const hi = Math.max(a.min, a.max)
  if (a.to === 'pitch') {
    const out: number[] = []
    for (
      let m = Math.max(MIDI_MIN, Math.ceil(lo));
      m <= Math.min(MIDI_MAX, hi);
      m++
    )
      if ((((m - root) % 12) + 12) % 12 === 0) out.push(m)
    return out
  }
  if (a.to === 'pan' && lo < 0 && hi > 0) return [0]
  return []
}

function drawMap(app: App, f: FieldObj): void {
  if (isCircle(f.shape)) drawRoundMap(app, f, f.shape.r)
  else drawXYMap(app, f)
}

/** Selected, hovered or neither: how strongly a map field is drawn. */
function mapEmphasis(app: App, f: FieldObj): number {
  if (app.sel === f.id) return 1
  const hov =
    (app.hover?.kind === 'object' || app.hover?.kind === 'handle') &&
    app.hover.id === f.id
  return hov ? 0.7 : 0.45
}

function axisEnds(a: Axis | undefined) {
  const t = a && targetOf(a.to)
  return a && t
    ? { label: targetLabel(a.to), lo: t.fmt(a.min), hi: t.fmt(a.max) }
    : null
}

/** Radial, sweep and triangle maps: shape outline, guides for pitch and pan, labels. */
function drawRoundMap(app: App, f: FieldObj, r: number): void {
  const t = mapTypeOf(f)
  if (!t) return
  const g = app.g
  const p = app.poseOf(f)
  const z = app.cam.zoom
  const [sx, sy] = app.w2s(p.x, p.y)
  const R = r * p.scale * z
  if (sx + R < 0 || sx - R > app.W || sy + R < 0 || sy - R > app.H) return
  const k = mapEmphasis(app, f)
  const sel = app.sel === f.id
  const axes = f.axes ?? t.defaultAxes
  const root = app.view.key.root
  const tri = t.shape === 'triangle'
  const corner = (i: number, rr = R): [number, number] => {
    const [cx, cy] = triCorner(i, rr)
    return [sx + cx, sy - cy]
  }
  const outline = () => {
    g.beginPath()
    if (tri) {
      for (let i = 0; i < 3; i++) {
        const [x, y] = corner(i)
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.closePath()
    } else g.arc(sx, sy, R, 0, TAU)
  }

  outline()
  g.fillStyle = rgba('map', 0.03)
  g.fill()
  g.save()
  outline()
  g.clip()
  g.strokeStyle = rgba('map', 0.12)
  g.fillStyle = rgba('map', 0.35)
  g.lineWidth = 1
  g.font = FONT_SMALL
  g.textAlign = 'center'
  g.textBaseline = 'bottom'
  t.axes.forEach((spec, i) => {
    const a = axes[spec.key]
    if (!a) return
    for (const v of guideValues(a, root)) {
      const u = axisOffset(a, v, 0.5) + 0.5 // 0..1 along the axis
      g.beginPath()
      if (t.id === 'radial') {
        g.arc(sx, sy, u * R, 0, TAU)
        g.stroke()
        if (a.to === 'pitch' && z >= 0.3 && u > 0.05)
          g.fillText(noteName(v), sx, sy - u * R - 2)
      } else if (t.id === 'sweep') {
        g.moveTo(sx, sy)
        g.lineTo(sx + Math.sin(u * TAU) * R, sy - Math.cos(u * TAU) * R)
        g.stroke()
        if (a.to === 'pitch' && z >= 0.3)
          g.fillText(
            noteName(v),
            sx + Math.sin(u * TAU) * R * 0.8,
            sy - Math.cos(u * TAU) * R * 0.8,
          )
      } else if (tri) {
        // a line of equal weight runs parallel to the edge opposite corner i
        const [ax, ay] = corner(i)
        const [bx, by] = corner((i + 1) % 3)
        const [cx, cy] = corner((i + 2) % 3)
        g.moveTo(ax + (1 - u) * (bx - ax), ay + (1 - u) * (by - ay))
        g.lineTo(ax + (1 - u) * (cx - ax), ay + (1 - u) * (cy - ay))
        g.stroke()
      }
    }
  })
  if (t.id === 'sweep') {
    // where the sweep starts and which way it goes
    g.strokeStyle = rgba('map', 0.35 * k)
    g.beginPath()
    g.moveTo(sx, sy)
    g.lineTo(sx, sy - R)
    g.stroke()
    g.beginPath()
    g.arc(sx, sy, R * 0.92, -Math.PI / 2 + 0.08, -Math.PI / 2 + 0.5)
    g.stroke()
  }
  g.restore()

  outline()
  g.strokeStyle = rgba('map', 0.35 * k)
  g.lineWidth = sel ? 1.4 : 1
  g.setLineDash([4, 6])
  g.stroke()
  g.setLineDash([])

  const lb = app.mapLabelBox(f)
  g.font = FONT_SMALL
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = rgba('map', 0.8 * k)
  g.fillText(
    `${t.glyph} ${f.id}  [${f.layer}]`,
    lb.x + lb.w / 2,
    lb.y + lb.h / 2,
  )
  if (R < 40 || (!sel && k < 0.7 && z < 0.5)) return
  g.fillStyle = rgba('map', 0.6 * k)
  if (tri) {
    t.axes.forEach((spec, i) => {
      const e = axisEnds(axes[spec.key])
      if (!e) return
      const [x, y] = corner(i, R + 14)
      g.textAlign = i === 0 ? 'center' : i === 1 ? 'left' : 'right'
      g.textBaseline = i === 0 ? 'bottom' : 'top'
      g.fillText(
        `${spec.key}: ${e.label} ${e.hi}`,
        i === 0 ? x : x + (i === 1 ? -6 : 6),
        i === 0 ? y - 10 : y,
      )
    })
  } else {
    const spec = t.axes[0]
    const e = axisEnds(axes[spec.key])
    if (e) {
      g.textAlign = 'center'
      g.textBaseline = 'top'
      g.fillText(
        `${e.label}: ${spec.lo} ${e.lo} → ${spec.hi} ${e.hi}`,
        sx,
        sy + R + 6,
      )
    }
  }
}

function drawXYMap(app: App, f: FieldObj): void {
  const g = app.g
  const p = app.poseOf(f)
  const z = app.cam.zoom
  const [sx, sy] = app.w2s(p.x, p.y)
  const d = shapeDims(f.shape, p.scale)
  const w = d.w * z
  const h = d.h * z
  const x0 = sx - w / 2
  const y0 = sy - h / 2
  if (x0 > app.W || y0 > app.H || x0 + w < 0 || y0 + h < 0) return
  const sel = app.sel === f.id
  const k = mapEmphasis(app, f)
  const axes = f.axes ?? mapTypeOf(f)?.defaultAxes ?? {}
  const root = app.view.key.root
  // labels stay on the visible part of the field (clear of the palette and bar)
  const vx0 = Math.max(x0, 76)
  const vx1 = Math.min(x0 + w, app.W)
  const vy0 = Math.max(y0, 0)
  const vy1 = Math.min(y0 + h, app.H - app.barH)

  g.fillStyle = rgba('map', 0.022)
  g.fillRect(x0, y0, w, h)

  g.save()
  g.beginPath()
  g.rect(x0, y0, w, h)
  g.clip()
  g.font = FONT_SMALL
  for (const ax of ['x', 'y']) {
    const a = axes[ax]
    if (!a) continue
    const half = (ax === 'x' ? d.w : d.h) / 2
    for (const v of guideValues(a, root)) {
      const off = axisOffset(a, v, half) * z
      g.fillStyle = rgba('map', 0.07)
      if (ax === 'y') {
        const y = sy - off
        g.fillRect(x0, y, w, 1)
        if (a.to === 'pitch' && z >= 0.3) {
          g.fillStyle = rgba('map', 0.3)
          g.textAlign = 'left'
          g.textBaseline = 'bottom'
          g.fillText(noteName(v), vx0 + 6, y - 2)
        }
      } else {
        const x = sx + off
        g.fillRect(x, y0, 1, h)
        if (a.to === 'pitch' && z >= 0.3) {
          g.fillStyle = rgba('map', 0.3)
          g.textAlign = 'left'
          g.textBaseline = 'top'
          g.fillText(noteName(v), x + 3, vy0 + 24)
        }
      }
    }
  }
  g.restore()

  g.strokeStyle = rgba('map', 0.35 * k)
  g.lineWidth = sel ? 1.4 : 1
  g.setLineDash([4, 6])
  g.strokeRect(x0, y0, w, h)
  g.setLineDash([])

  // labels: id top-left (also its pick handle), axis ends along the bottom and right edges
  g.font = FONT_SMALL
  g.fillStyle = rgba('map', 0.8 * k)
  g.textAlign = 'left'
  g.textBaseline = 'top'
  g.fillText(
    `${fieldTypes[f.type]?.glyph ?? '⊹'} ${f.id}  [${f.layer}]`,
    x0 + 6,
    y0 + 5,
  )
  if (vx1 - vx0 < 140 || vy1 - vy0 < 60) return
  g.fillStyle = rgba('map', 0.6 * k)
  const ex = axisEnds(axes.x)
  const ey = axisEnds(axes.y)
  g.textBaseline = 'bottom'
  // an end label is only shown when that edge is on screen
  const lOn = x0 >= vx0 - 1
  const rOn = x0 + w <= vx1 + 1
  const tOn = y0 >= vy0 - 1
  const bOn = y0 + h <= vy1 + 1
  if (ex) {
    g.textAlign = 'left'
    g.fillText(lOn ? `← ${ex.lo}` : `x: ${ex.label}`, vx0 + 6, vy1 - 4)
    if (lOn) {
      g.textAlign = 'center'
      g.fillText(`x: ${ex.label}`, (vx0 + vx1) / 2, vy1 - 4)
    }
    if (rOn) {
      g.textAlign = 'right'
      g.fillText(`${ex.hi} →`, vx1 - 6, vy1 - 4)
    }
  }
  if (ey) {
    g.textAlign = 'right'
    if (tOn) {
      g.textBaseline = 'top'
      g.fillText(`↑ ${ey.hi}`, vx1 - 6, vy0 + 5)
    }
    g.textBaseline = 'middle'
    g.fillText(`y: ${ey.label}`, vx1 - 6, (vy0 + vy1) / 2)
    if (bOn) {
      g.textBaseline = 'bottom'
      g.fillText(`↓ ${ey.lo}`, vx1 - 6, vy1 - (ex ? 18 : 4))
    }
  }
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
    // fades as it loses strength: fully with fall-off 100%, barely with 0%
    const al =
      (1 - (0.15 + 0.85 * r.falloff) * (rad / r.maxR)) *
      0.4 *
      (0.4 + 0.6 * r.vel)
    if (al <= 0) continue
    const [sx, sy] = app.w2s(r.x, r.y)
    if (r.dirs) {
      // traces: a short comet travelling out along each direction
      g.strokeStyle = `rgba(233,228,218,${Math.min(1, al * 1.6)})`
      g.lineWidth = 1.5
      r.dirs.forEach((t, i) => {
        const len = r.lens?.[i] ?? r.maxR
        if (rad > len) return
        const ux = Math.sin(t * TAU)
        const uy = Math.cos(t * TAU)
        const tail = Math.max(0, rad - 36)
        g.beginPath()
        g.moveTo(sx + ux * tail * z, sy - uy * tail * z)
        g.lineTo(sx + ux * rad * z, sy - uy * rad * z)
        g.stroke()
      })
      g.lineWidth = 1
      continue
    }
    if (r.stopR !== undefined && rad > r.stopR) continue
    g.strokeStyle = `rgba(233,228,218,${al})`
    g.beginPath()
    g.arc(sx, sy, rad * z, 0, TAU)
    g.stroke()
  }
}

/** Group links for the selection: to what it follows, and from what follows it. */
function drawFollowLinks(app: App): void {
  const sel = app.sel
  if (!sel) return
  const g = app.g
  g.strokeStyle = 'rgba(233,228,218,0.4)'
  g.lineWidth = 1
  g.setLineDash([1, 4])
  g.beginPath()
  for (const o of app.view.objects) {
    if (!o.follow || (o.id !== sel && o.follow !== sel)) continue
    const leader = app.obj(o.follow)
    if (!leader) continue
    const [ax, ay] = app.w2s(app.poseOf(o).x, app.poseOf(o).y)
    const [bx, by] = app.w2s(app.poseOf(leader).x, app.poseOf(leader).y)
    g.moveTo(ax, ay)
    g.lineTo(bx, by)
  }
  g.stroke()
  g.setLineDash([])
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
  const m = app.places.get(o.id)?.pitch ?? 60
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
  const silenced = o.mute || (app.anySolo() && !o.solo)
  const a = dim(app, sx, sy, o.id) * (silenced ? 0.3 : 1)
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
  if (t?.mode === 'event') drawAim(app, o, sx, sy, r, a)
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

/** Point / multi sounds: a tick out from the rim for each trace direction. */
function drawAim(
  app: App,
  o: SoundObj,
  sx: number,
  sy: number,
  r: number,
  a: number,
): void {
  const rip = rippleOf(o.ripple)
  if (rip.mode === 'ripple') return
  const pl = app.places.get(o.id)
  const turns = traceTurns(
    rip.mode,
    pl?.angle ?? rip.angle,
    rip.count,
    pl?.spread ?? rip.spread,
  )
  if (!turns) return
  const g = app.g
  g.strokeStyle = rgba('sound', 0.55 * a)
  g.lineWidth = 1.2
  g.beginPath()
  for (const t of turns) {
    const ux = Math.sin(t * TAU)
    const uy = Math.cos(t * TAU)
    g.moveTo(sx + ux * (r + 3), sy - uy * (r + 3))
    g.lineTo(sx + ux * (r + 11), sy - uy * (r + 11))
  }
  g.stroke()
  if (rip.stop) {
    g.beginPath()
    for (const t of turns) {
      const ux = Math.sin(t * TAU)
      const uy = Math.cos(t * TAU)
      g.moveTo(sx + ux * (r + 11) - uy * 3, sy - uy * (r + 11) - ux * 3)
      g.lineTo(sx + ux * (r + 11) + uy * 3, sy - uy * (r + 11) + ux * 3)
    }
    g.stroke()
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
      followPose(
        o,
        app.beat + (period * i) / 128,
        app.view.seed,
        app.lookup,
        tmp,
      )
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
            : isMap(o)
              ? isCircle(o.shape)
                ? 'size'
                : 'resize (top-left stays put)'
              : 'size (intensity)',
          role,
        )
    } else if (h.kind === 'ripple' && o.kind === 'sound') {
      // angle + reach handle: a dotted line out to it, and while in use the full extent
      const sp = app.poseOf(o)
      const [cx, cy] = app.w2s(sp.x, sp.y)
      const rip = rippleOf(o.ripple)
      const pl = app.places.get(o.id)
      const reachPx =
        (pl?.reach ?? rip.reach) * o.size * sp.scale * app.cam.zoom
      g.strokeStyle = rgba('sound', 0.35)
      g.setLineDash([2, 3])
      g.beginPath()
      g.moveTo(cx, cy)
      g.lineTo(h.x, h.y)
      g.stroke()
      if (on && reachPx > 0) {
        g.strokeStyle = rgba('sound', 0.18)
        g.beginPath()
        if (rip.mode === 'ripple') g.arc(cx, cy, reachPx, 0, TAU)
        else
          for (const t of traceTurns(
            rip.mode,
            pl?.angle ?? rip.angle,
            rip.count,
            pl?.spread ?? rip.spread,
          ) ?? []) {
            g.moveTo(cx, cy)
            g.lineTo(
              cx + Math.sin(t * TAU) * reachPx,
              cy - Math.cos(t * TAU) * reachPx,
            )
          }
        g.stroke()
      }
      g.setLineDash([])
      g.fillStyle = on ? INK : BG
      g.strokeStyle = rgba('sound', 0.9)
      g.beginPath()
      g.arc(h.x, h.y, 5, 0, TAU)
      g.fill()
      g.stroke()
      if (on) {
        const over: string[] = []
        if (pl && pl.reach !== rip.reach)
          over.push(`reach ×${Math.round(pl.reach * 10) / 10}`)
        if (pl && rip.mode !== 'ripple' && pl.angle !== rip.angle)
          over.push(`angle ${Math.round(pl.angle)}°`)
        tag(
          app,
          h.x + 10,
          h.y,
          `${rip.mode === 'ripple' ? '' : `angle ${Math.round(rip.angle)}° · `}reach ×${rip.reach}${rip.reach <= 0 ? ' (off)' : ''}  drag` +
            (over.length ? `  · a map sets ${over.join(', ')}` : ''),
          'sound',
        )
      }
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
  role: Role | 'sound',
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

/** While dragging an event sound: the neighbouring scale notes along whichever axis gives it pitch. */
function drawPitchLadder(app: App, o: SoundObj): void {
  if (soundTypes[o.type]?.mode !== 'event') return
  const p = app.poseOf(o)
  const gov = governingAxis(p.x, p.y, app.maps, 'pitch')
  if (!gov) return
  const g = app.g
  const k = app.view.key
  const steps = scaleSteps(k.scale)
  const [sx, sy] = app.w2s(p.x, p.y)
  const r = app.soundRadius(o)
  const idx = nearestIndex(app.places.get(o.id)?.pitch ?? 60, k.root, steps)
  const mp = gov.m.pose
  g.font = FONT_SMALL
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  for (let d = -5; d <= 5; d++) {
    const m = indexToMidi(idx + d, k.root, steps)
    if (m < MIDI_MIN || m > MIDI_MAX) continue
    const off = axisOffset(gov.a, m, gov.half)
    g.fillStyle = d === 0 ? INK : 'rgba(233,228,218,0.3)'
    if (gov.axis === 'y') {
      const [, y] = app.w2s(0, mp.y + off)
      g.fillRect(sx + r + 10, y, d === 0 ? 14 : 8, 1)
      if (d === 0) g.fillText(noteName(m), sx + r + 28, y)
    } else {
      const [x] = app.w2s(mp.x + off, 0)
      g.fillRect(x, sy + r + 10, 1, d === 0 ? 14 : 8)
      if (d === 0) g.fillText(noteName(m), x + 4, sy + r + 30)
    }
  }
}

const HELP = [
  'gener8: place sounds, overlap fields. no cables.',
  'g or docs (bottom bar)   the full guide: how everything works',
  '',
  'space            start / pause audio',
  'drag palette     place a sound or field',
  'drag object      move · alt-drag duplicates',
  'maps ⊹ ◎ ↻ △     xy · radial (centre→edge) · sweep (around) · tri (3 corners)',
  '                 position → pitch / pan / level / reach / angle / params',
  '                 select by its edge or label · set each axis in the bar below it',
  'size handle ▪    sound: loudness + ripple reach · field: extent',
  'character ◔      drag up/down',
  'pinch / ⌘-wheel  zoom · two-finger / right-drag / space-drag: pan',
  'zoom in on sound or double-click   open its internals',
  'select anything  motion bar below it: breathe / orbit / drift / path',
  '                 drag or scroll its values (depth, period, radius…)',
  'retrigger        sounds: ripple ring · point trace · multi traces',
  '                 reach, fall-off, angle, count, spread, stop on impact',
  '                 the ● handle: its direction is the angle, its distance the reach',
  'm / b            shortcuts: cycle motion (orbit, drift, path, bounce) / toggle breathe',
  'group ⛓          follow…, then click a leader: its motion and breathing carry this too',
  '                 dragging a leader moves its followers with it',
  'tab / shift-tab  cycle through everything under the cursor (incl. field edges)',
  '[ ]              layer down / up (order within a role)',
  '↑ ↓ ← →          nudge a semitone along the pitch axis (shift: an octave)',
  "                 no map sets pitch? ↑ ↓ change the sound's own note",
  'delete           remove selection',
  'c                capture last 30 s (WAV + patch/seed/edit log)',
  'n                minimap on / off · click or drag in it to move the view',
  'mixer / vol      levels, mute, solo, FX returns · master level (drag/scroll)',
  't                tap tempo · wheel over bpm / root / scale / seed',
  'timeline strip   drag to preview the past · release to branch',
  '⌘S / ⌘O / drop   save / open patch JSON',
  'r / random       new patch from a random seed',
  'seed…            type a seed (a number, or any text)',
  'share            copy a link to this patch (seed link when unedited)',
  'shift-D / shift-T / shift-R / shift-X  ambient / tape / rhythmic demo / stress patch',
  '',
  'colour = role: warm white sound · amber generator · teal transformer · violet fx · steel xy',
  'filled sounds are driven by a generator · hollow sounds listen for ripples',
]

function drawHelp(app: App): void {
  const g = app.g
  const w = 720
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
  g.fillText(app.toastMsg, app.W / 2, app.H - app.barH - 12)
}
