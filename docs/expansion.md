# Palette expansion: scope

## Status (built on the `expansion` branch)

Everything below is implemented, tested (`test/expansion.test.ts`, plus the
registry test for every type) and documented in the guide. Where the build
differs from this scope:

- **pipe** is a spectral breathy-pipe model (near-sine tone, tuned breath
  noise, chiff), not the STK waveguide: the waveguide wouldn't hold pitch
  across the range.
- **tonnetz** has one axis, `n` (the cell's offset in semitones, folded into
  ±6), rather than two summed axes.
- **cc** has no depth weighting; every sound inside gets the same value.
- **glide** is followed by subtractive, FM, wavetable, organ, chip, pipe and
  bowed; bass uses its own glide rate; macro, pluck and percussion ignore it.
- **sequencer** steps live in `FieldObj.seq` (not `steps`, which is already
  the key's scale steps in `FieldContext`) and are edited as chips in the
  motion bar.
- MIDI in releases notes through tagged `off` events (`NoteEvent.tag/off`);
  notes whose off never arrives stop after 16 beats.
- Spin and stretch are full pose channels (`Pose.angle/sx/sy`): fields carry
  members, maps and generator geometry round with them; labels stay upright.

Goal: move the palette from 2 columns to 3 and add more motion. Sounds,
transformers and fx get a 6th row; maps get a 3rd (for CC): 28 rows total, up
from 24. Rule kept throughout: motion
stays closed-form in beats (no integration state), and every engine input is
deterministic or logged so renders and captures replay exactly.

## Slot budget

| Group | Now | Planned | Rows (3 col) |
|---|---|---|---|
| sounds | 10 | 18 | 6 |
| generators | 14 | 21 | 7 |
| transformers | 10 | 18 | 6 |
| fx | 10 | 18 | 6 |
| maps | 4 | 7 | 3 |

Palette cells shrink ~14% on short windows. MIDI out takes no palette slot:
it lives on the mixer (see Phase 4).

---

## Phase 0: infrastructure

| Work | Where | Notes |
|---|---|---|
| 3-column palette | [palette.ts](../src/ui/palette.ts) `layoutFor` | Default `cols = 3`, fall back to 4 below `MIN_SIZE`. Check the mobile drawer width. |
| Pose gains `angle`, `sx`, `sy` | [motion.ts](../src/core/motion.ts), [types.ts](../src/core/types.ts) | Needed for spin and stretch. `followPose` adds angle and multiplies sx/sy. |
| Rotated fields | [placement.ts](../src/core/placement.ts), [geometry.ts](../src/core/geometry.ts), [draw.ts](../src/ui/draw.ts) | Rotate (dx, dy) into the field's frame before `locate` and the depth test. Draw rotated. |
| `MapType.locate` gets handles | types.ts, maps.ts | Needed for the CC map (and any map whose output isn't purely positional). |
| Field data beyond handles | types.ts `FieldObj`, [sanitise.ts](../src/core/sanitise.ts), [canonical.ts](../src/core/canonical.ts), `gener8.ecore` | `steps?: (number \| null)[]` for the sequencer. Bump nothing: an absent key is valid v2. |
| Glide on events | `NoteEvent.glide?: number` (ticks), `Voice.noteOn(pitch, vel, glide?)` | Event voices that are reused (mono) slide; others ignore it. |
| Motion bar redesign | [motionbar.ts](../src/ui/motionbar.ts) | 5 toggles today; 13 position types won't fit, especially on mobile. Replace position toggles with one `move ▾` picker plus breathe, spin and stretch toggles. |
| Live input log | engine + [protocol.ts](../src/worklet/protocol.ts) | MIDI note/CC messages are stamped at the engine sample and appended to the edit log so renders replay them. Not undoable; [history.ts](../src/ui/history.ts) must skip them. |

## Phase 1: stateless or near-stateless (no infra needed)

### Transformers

| Id | Handles | How | State |
|---|---|---|---|
| swing | amount · grid (1/8, 1/16) | Push off-beat ticks later only. | none |
| scatter | range (±1–3 oct) · chance | `ctx.rand` on tick + chain, then `fold`. | none |
| accent | every N · strength | Velocity up on `tick % (N·step) == 0`, down elsewhere. | none |
| echo | gap · decay | Like canon but same pitch, more repeats, pitch drift by depth. | none |
| retrograde | window (1/2 bar–4 bars) · share | Note at t in window k lands at `2·(k+1)·W − t − dur` in window k+1. Pure function, like canon. | none |
| throttle | max / beat · keep (first, loudest) | Count per beat per sound; drop excess. | `ctx.state`, keyed by sound |
| smooth | max leap · fold/clamp | Previous pitch per sound; fold leaps back by octaves. | `ctx.state` |

`glide` needs the Phase 0 event change.

### FX

| Id | Kind | Handles | Notes |
|---|---|---|---|
| drive | insert | drive · curve (soft → fold) | 2× oversample the fold end or it aliases badly. |
| wax | insert | crackle · wear | Crackle from `ctx.rand` (deterministic); wear = rumble + LP + slight wow. |
| phaser | insert | rate · depth | 4–6 allpass stages. |
| flanger | insert | rate · feedback | Reuse [delay.ts](../src/core/dsp/delay.ts) with a short modulated tap. |
| ring mod | insert | ratio to key · mix | Carrier = key root (`ctx.keyRoot`) × ratio, so it stays musical. |
| octaver | insert | down (-1/-2 oct) · mix | Flip-flop divider on zero crossings for the analog sound; mono-pitched sources work best. |

### Maps

| Id | Shape | Axes | Notes |
|---|---|---|---|
| spiral | circle | `t` along the spiral | Default `to: pitch`, one octave per ring: angle gives pitch class, ring gives octave. |
| tonnetz | rect | `q`, `r` (lattice) | Snap position to a hex lattice; pitch = 7q + 4r (fifths × thirds), snapped to key. Needs a combined pitch output rather than two independent axes; see the note on `locate` below. |

`locate` returns one value per axis, and the placement code sums axis targets independently. Tonnetz
pitch is 7q + 4r, so either both axes target pitch with mins and maxes that make the sum work out (scales 7 and 4), or add a `combine` hint. Prototype the first.

### Motion (all closed-form)

| Type | Params | Formula sketch |
|---|---|---|
| pendulum | length · swing° · period | angle = swing · cos(2πu); hangs from home. |
| lissajous | size · ratio (1:2, 2:3, 3:4…) · period | x = sin(a·u), y = sin(b·u + π/2). |
| spiral | radius · turns · period | r = radius · tri(u), angle = turns · u. |
| rose | size · petals · period | r = size · cos(k·θ). |
| spirograph | R · r · period | Hypotrochoid. |
| hop | spots · every N beats | Spot index = floor(beat / N); position from `strHash(id)` + `fbm`-style hash. Eased jump between spots. |
| spring | stretch · damping · period | Per cycle: `A · e^(−d·t) · cos(ω·t)` along a hashed direction. |
| shuttle | angle · distance · period | Back and forth on a line, with easing. |

Upgrades to existing motion:
- **path dwell**: `dwell?: number` (0–0.9 of each segment) on `path`. Time is remapped per segment so the object holds at each point. Spatial step sequencing.
- **easing**: `ease?: 'linear' | 'smooth' | 'elastic'` on orbit, path and shuttle.
- **stagger**: `stagger?: number` beats on the follower; it evaluates its leader at `beat − stagger`.
- **breathe shape**: `shape?: 'sine' | 'tri' | 'ramp' | 'square' | 'step'` (step = hashed random level per period).

Each new motion field needs: [types.ts](../src/core/types.ts), [motion.ts](../src/core/motion.ts) `pose`, [sanitise.ts](../src/core/sanitise.ts) `motion()`, motion bar defaults and rows, [motion.md](guide/motion.md), `gener8.ecore`, and [motion.test.ts](../test/motion.test.ts).

## Phase 2: sounds and generators

### Sounds

| Id | Mode | Core | Key params |
|---|---|---|---|
| wavetable | event | Mipmapped tables built at load (additive, band-limited) | table, position, warp, ADSR, filter |
| organ | event | 9 sine drawbars + key click | drawbar preset, percussion, leslie rate/depth |
| chip | event | BLEP pulse + 4-bit triangle + noise | duty, arp speed/shape, vibrato |
| pipe | event | Blown waveguide (jet + bore delay) | breath, overblow, noise |
| bowed | event | Bow-string friction waveguide | pressure, position, brightness |
| shepard | sustained | 8 octave-spaced partials under a fixed bell envelope, phase rising | rate, direction, spread |
| bowl | sustained | Inharmonic modal partials with paired detune (beating) | strike, beat rate, size |
| cloud | sustained | Granular haze over an internal oscillator bank (no samples) | density, grain size, spray |

Each sound needs: file in [sounds/](../src/core/sounds/), registry line, glyph in [glyphs.ts](../src/ui/glyphs.ts), [sounds.md](guide/sounds.md) section and `doc-icons`, golden regen (`npm run golden`), and a CPU check in the stress test at `maxVoices`. Wavetable table memory: keep under ~2 MB total.

### Generators

| Id | Handles | Notes |
|---|---|---|
| bells | bells (4–8) · method (plain hunt, Grandsire, Stedman…) | Members sorted by angle = bells. Deterministic, no state beyond row index. |
| L-system | generations · rule | Expand at createState; walk the string, with symbols as step up, step down, rest or branch. |
| rule 30/110 | rule · width | 1D automaton, one row per step; `visual()` like grid. |
| pendulum | ratio · chaos | Double pendulum or Lorenz stepped at a fixed rate in state. Use [dspmath.ts](../src/core/dspmath.ts) trig, not `Math.sin`, so results match across JS engines. Fires on zero crossings. |
| flock | count · cohesion | Boids stepped at a fixed rate in generator state (allowed: generators aren't motion). Note when a boid crosses a member sound. Needs `visual()`. |

Each generator: [generator-golden](../scripts/generator-golden.ts) regen, [fields.md](guide/fields.md), [generate.ts](../src/core/generate.ts) picks it up via the registry but check weights.

### FX (stateful)

| Id | Kind | Handles | Notes |
|---|---|---|---|
| spring | bus | tension · drip | Dispersive allpass cascade + feedback; the "drip" is the chirp. |
| beat repeat | insert | slice (1/16–1/2) · chance | Tempo-synced from `ctx.tick`; decide per slice with `ctx.rand` so it's deterministic. |

## Phase 3: infra-dependent

| Item | Depends on |
|---|---|
| spin (fields rotate; point/multi ripple angle rotates) | Pose angle, rotated fields |
| stretch | Pose sx/sy, rect `locate` and depth with separate scales |
| glide transformer | `NoteEvent.glide` + voice support |
| sequencer generator: handles rate · length, steps in `steps[]` | Field data + a step editor in [panel.ts](../src/ui/panel.ts) (tap cells: degree or rest) |

## Phase 4: MIDI

Web MIDI is Chrome/Edge/Firefox desktop only; no Safari or iOS. Every MIDI
module must show a clear unavailable state and still be playable without it.

| Item | Design |
|---|---|
| midi in (generator) | Handles: channel · octave. Main thread → worklet `midi` message → engine stamps and logs it → emits to members at the current tick. Without MIDI, members are silent and the panel says why. |
| cc (map) | A zone: every sound inside gets the same value on its axis (pitch, pan, level or `param:*`, min..max). Handles: `cc` (0–127, with a learn button) and `value`, written by incoming CC as a logged edit, throttled and not undoable. With no MIDI, `value` is a draggable macro fader saved in the patch. Optional depth weighting (full at centre, nothing at the edge). Draw a fill bar for the current value. `locate` ignores position and writes `value` as the axis offset, so it needs the Phase 0 handles change. |
| midi out (mixer) | A per-sound output on each mixer strip: `midiOut?: { channel: number; only?: boolean }` on `SoundObj` (saved like trim/mute/solo; sanitise + ecore). The strip button cycles off → audio + MIDI → MIDI only (the fader floor is −40 dB, not silence, so "only" is needed). Mute and solo apply to MIDI too. The main thread sends notes from tele `EventRecord`s (they carry `soundId`, `pitch`, `velocity`, after the whole transformer chain), timestamped via `AudioContext.getOutputTimestamp` so they land with the audio. Note-off needs `durTicks` on `EventRecord` (not there today). Global: output device and a ± latency trim in the mixer header. Sustained sounds: send note-on at pitch change, off at the previous pitch. |
| permissions UX | Request access the first time a MIDI module is placed or a strip's MIDI out is switched on, not at load. Device pickers: in the midi in / cc panel, and in the mixer header for out. |

## Per-item checklist

- [ ] type file + registry line
- [ ] glyph (sounds) or field glyph char
- [ ] guide docs section + `npm run doc-icons`
- [ ] sanitise for any new patch keys; canonical order; `gener8.ecore` + `npm run model-svg`
- [ ] goldens regenerated and reviewed (`npm run golden`, `npm run generator-golden`)
- [ ] registry, determinism and stress tests pass
- [ ] share link still under `MAX_PAYLOAD_CHARS` for a full stress patch

## Decisions

- Sounds, transformers and fx get a 6th row.
- MIDI CC is a map.
- VHS is dropped: tape, lofi and wax cover it.

- MIDI in is a generator, MIDI CC is a map, MIDI out is a per-strip setting on the mixer.
