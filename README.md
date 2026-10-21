<p align="center"><img src="public/og.png" alt="GENER8" width="720"></p>

# GENER8

A generative music instrument on an infinite canvas. You place **sounds**, overlap them with **fields**, and let proximity, motion and ripples do the rest. There are no cables, tracks or patterns. Where things sit *is* the patch, and **map fields** decide what position means.

It runs in the browser on custom DSP (no samples, no native Web Audio nodes), and every render is **bit-identical from a single seed**.

## Quick start

```sh
npm install
npm run dev        # open the printed URL, press space
```

Press **space** to start audio. The ambient demo loads first. **examples ▾** in the bottom bar has eight more: tape, loops (airport-style phasing), rainfall, bloom, choir (motion only), cells (automaton), rhythmic and a stress patch.

**The guide:** press **docs** in the bottom bar (or <kbd>g</kbd>) for the full guide, rendered in the app. The same pages are in [`docs/guide/`](docs/guide/README.md) and read fine on GitHub too. Link to a page with `#docs/<page>`, e.g. `#docs/maps`. The guide's last page, [Patch structure](docs/guide/model.md) (`#docs/model`), walks through the metamodel diagram below.

**On a phone or tablet** the layout adapts: tap ▶ to start, **+** opens the palette, pinch to zoom, drag empty space to pan, tap a selected object again to step down through what's under it, and double-tap a sound for its internals.

## Sharing

**share** copies a link. Everything is in the URL fragment (`#…`), which browsers never send to a server.

- **Seed links** (`#s=3041872655&g=1`) are used when the patch is exactly what the generator builds from its seed, i.e. you pressed **random** or typed a seed and haven't changed anything since. They are short and stay valid forever: `g` is the generator version, and old versions are kept.
- **Patch links** (`#p=…`) are used for everything else. The patch JSON is deflated and base64url-encoded, about 1–2k characters for a typical patch.

Opening a link loads the patch but never starts audio. Press space or ▶ to hear it. Pasting a new link into an open tab works too. The patch you had before is kept in `localStorage` under `gener8.patch.prev`.

Links are treated as untrusted. A patch from a link is size-capped, decompressed with a hard byte limit, and rebuilt from a whitelist with every number checked and clamped (`src/core/sanitise.ts`). Links are limited to 24 sounds and 12 fields, the tested scale target, plus up to 8 map fields. A link with an unknown sound or field type is refused with a message rather than half-loaded, and a bad link never replaces your current patch.

## How it works

**Sounds** are synth voices. **Fields** are regions that affect any sound inside them. How deep a sound sits in a field sets how strongly that field acts on it, and overlap and proximity are the only relationships.

| Colour | Role | What it does |
|---|---|---|
| warm white | **sound** | Makes the audio. Filled sounds are driven by a generator; hollow ones listen for ripples. |
| amber | **generator** | Triggers notes on the sounds inside it. |
| teal | **transformer** | Changes those notes (thins, transposes, harmonises, stretches…). |
| violet | **fx** | Processes the audio (filter, tape, delay, chorus, reverb, shimmer). |
| steel | **map** | Maps position inside it to pitch, pan, level, ripple reach/angle/spread, or a sound parameter. |

**Map fields give the canvas its meaning.** Each has one or more axes. An axis has a target and a value at each end, and a sound inside the field takes the value at its position.

| | shape | axes |
|---|---|---|
| **xy** ⊹ | rectangle (resizes from the corner) | x left → right, y bottom → top |
| **radial** ◎ | circle | centre → edge: a spotlight, e.g. louder in the middle |
| **sweep** ↻ | circle | once round clockwise from the top. Orbit a sound inside it for a cycling melody. |
| **tri** △ | triangle | a, b, c: each from the opposite edge to its corner, blended like a colour triangle |

Typical uses of an XY field:
- The usual stage: y is pitch (up is higher, snapped to the key) and x is pan. Every bundled example has one, and **new** starts with one.
- A wide, gentle pan field (say 4000 units wide, L50 to R50), so sounds can sit far apart without ripples reaching each other or being panned hard.
- A small field over a few sounds that maps x to filter cutoff and y to level.

Map fields can overlap. For each target, the highest layer wins, so a small field can override part of a big one. Where no map field sets pitch, a sound plays its own **note**: middle C unless you change it with the note chip in the bar below it, or with ↑ ↓ (shift: an octave). Outside every map field it's also centred. Map fields can move and breathe like anything else, which modulates whatever they map. They sit under everything, so you select one by its edge or its label (or with Tab), and its axes are set in the bar below it.

With room to sprawl, the **minimap** in the top-right corner shows the whole patch and the current view. Click or drag in it to move the view, scroll over it to zoom, and press `n` to hide it.

A sound's size is its loudness and, with its reach, how far its retriggers travel.

**Processing order** is fixed by role: generators → transformers → sound → fx. Within a role, the layer order (`[` `]`) decides.

**Motion is modulation.** Any object can breathe, orbit, drift, follow a path or **bounce** (drop from a height and bounce lower and lower onto its spot, then the same in reverse back up to the top). A sound sliding through a filter field gets a sweep, and a breathing field changes intensity. There is no separate modulation matrix.

**Groups:** any object can **follow** another. Click ⛓ follow… in the bar below it, then click the leader. The follower then rides along with the leader's motion and breathing, on top of its own. Give a generator orbit motion and have its sounds, transformer and FX follow it, and the whole rig moves as one. Dragging a leader moves its followers with it, and chains work (a follows b follows c).

**Ripples:** every note sends out a retrigger that travels at a tempo-synced speed. Hollow sounds it reaches answer, delayed by distance, so layout alone gives you call-and-response. Chain depth and per-sound refractory periods keep feedback in check. Each sound sets its own retrigger in the bar below it:

| | |
|---|---|
| **ripple** | an expanding ring (the default) |
| **point** | one trace fired at **angle** (0° is up, 90° is right) |
| **multi** | **count** traces fanned across **spread** around the angle. At 360° they're spaced evenly all the way round. |
| **reach** | how far it travels, as a multiple of the sound's size (default ×6). 0 never retriggers. |
| **fall-off** | how much strength it loses on the way. 100% (the default) fades to nothing at the reach; 0% hits as hard at the reach as next door. |
| **stop on impact** | the ring, or each trace, ends at the first listener it reaches |

A trace hits a listener when it passes through the listener's body. A selected sound has a ● handle: its direction is the angle and its distance is the reach, so you aim and size the retrigger in one drag. Drag it onto the sound to turn retriggers off. If a map field overrides the angle or reach at that spot, the handle's tag says so.

## Elements

| | |
|---|---|
| **Sounds** | subtractive · fm · pluck · percussion · pad · drone · additive · noise |
| **Generators** | pulse (Euclidean) · drift (random walk) · arp · rain · strum · grid (cellular automaton) |
| **Transformers** | probability · transpose · quantise · harmony · humanise · hold · ratchet · every Nth |
| **FX** | filter · tape · tape delay · chorus · reverb · shimmer |
| **Maps** | xy · radial · sweep · tri |

## Controls

| | |
|---|---|
| space | start / pause audio |
| drag from palette | place a sound or field |
| drag object | move it (alt-drag duplicates) |
| handles | ▪ size · ◔ character (drag up/down) |
| select anything | the motion bar appears: breathe / orbit / drift / path / bounce, plus ⛓ follow, with drag-or-scroll values; sounds add a retrigger row, XY fields an x and a y row (click the target for a menu, or scroll it to step through) |
| tab / shift-tab | cycle through everything under the cursor, including field edges |
| double-click or zoom into a sound | open its internals (oscillators, filter, ADSR) |
| pinch / ⌘-scroll | zoom · two-finger / right-drag / space-drag: pan |
| minimap | click or drag to move the view, scroll to zoom · `n` shows / hides it |
| l | lit (everything at full brightness) or reactive (lit by nearness to the cursor) |
| ↑ ↓ ← → | nudge a semitone along the pitch axis under the sound (shift: an octave). Where no map sets pitch, ↑ ↓ change the sound's own note. |
| `[` `]` | layer down / up |
| timeline strip | drag to preview the last 5 minutes, release to branch from there |
| c / ● capture | save the last 30 s as WAV, plus the patch, seed and edit log |
| shift-C / render… | render the patch from a fresh start for up to 1 h (e.g. `5`, `90s`, `1:00:00`), faster than real time in a worker; click again to cancel |
| shift-V / video… | the same render as an MP4 of the whole window, e.g. `5`, `90s 60fps`, `1:00:00 4k` (default 1080p, 30 fps); click again to cancel |
| vol | master level (drag or scroll) |
| mixer | per-sound level, mute and solo, FX returns, master, with live meters. Double-click a fader to reset it. |
| bottom bar | new · open · save · random · seed… · share · examples |
| r / random | a new patch from a random seed (asks again before replacing an edited patch) |
| seed… | type a seed: a number, or any text (hashed to a number) |
| share | copy a link to the current patch |
| h / ? | quick help |
| g / docs | the full guide |

Mixer levels, mutes and solos are stored in the patch, so they're part of every capture and replay.

## Determinism

The DSP is plain TypeScript in `src/core/`, shared unchanged by the AudioWorklet and Node. It avoids `Math.sin/exp/pow/…` (not bit-identical across JS engines) in favour of its own implementations, and all randomness is counter-based on the seed. As a result:
- A patch renders bit-identically every time, at any buffer size.
- A capture's JSON (root patch + edit log) re-renders its WAV bit for bit: `npm run render-capture capture.json capture.wav`.
- An in-app render matches `npm run render` of the same patch and length bit for bit.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm test` | determinism, golden hashes, every registered type, ripples, stress |
| `npm run stress` | renders 24 sounds × 12 fields for 60 s and reports speed against real time |
| `npm run render patch.json 60 out.wav` | offline render |
| `npm run golden` | regenerate reference hashes after an intended sound change |
| `npm run model-svg` | regenerate `docs/gener8-model.svg` from `docs/gener8.ecore` |
| `npm run generator-golden` | regenerate seed → patch hashes (only when adding a generator version; v1 is frozen) |

Tests run on Node's built-in runner with native TypeScript (Node ≥ 22.18). The one runtime dependency is [mediabunny](https://mediabunny.dev), for MP4 muxing in video renders, and it loads only when one starts. The rest are dev dependencies: Vite, TypeScript and `@types/node`.

## Adding a sound or field type

Each type is one file plus one line in `src/core/sounds/registry.ts` or `src/core/fields/registry.ts`, with no changes to core code. `test/registry.test.ts` picks up new types automatically: each must render finite, audible, non-clipping audio, and each field must audibly change the sound.

## Layout

```
src/core/      engine, DSP, sound and field types (no browser APIs)
src/worklet/   AudioWorkletProcessor wrapper
src/ui/        canvas, input, panels, timeline
patches/       example patches (JSON is the source of truth)
test/          node:test suites
scripts/       render, capture replay, golden hashes, stress patch
docs/          the guide (docs/guide/*.md, shown in the app), patch metamodel (Ecore) and its diagram
```

## Patch metamodel

Patches are plain JSON, and their structure is also described as an Eclipse Ecore metamodel: [`docs/gener8.ecore`](docs/gener8.ecore). It covers the patch, key and scale, shapes, the motion kinds, follow (groups), map fields and their axes, ripple settings, and every sound and field type.

The current format is version 2. Version 1 patches, which had a fixed y = pitch and x = pan, still load: old files, share links, seed links and captures all get a stage XY field that reproduces the old mapping bit for bit, so they sound exactly as they did. The diagram below is generated from it by `npm run model-svg` (`scripts/model-svg.ts`), so after changing the metamodel, rerun that and commit both files. Hover a class in the SVG to see its notes. The original diagram was made with the [Model Viewer](https://gcoulby.github.io/model-viewer/).

[![GENER8 patch metamodel](docs/gener8-model.svg)](docs/gener8-model.svg)

*Click the diagram to open it full size (it's wide).*

## Deploying

`.github/workflows/pages.yml` tests, builds and publishes to GitHub Pages on every push to `main`. Enable it once under **Settings → Pages → Source: GitHub Actions**.

## AI use

AI tools were used in the development of this app. No AI was used to create any music or audio in the app. The design and architecture of the app is entirely my own. I think it's the responsible thing to say so openly, and I review and take responsibility for everything that ships.

---

Logo set in *Free Fat Font* by Thom Niessink, free for personal and commercial use.

Metamodel diagram rendered with [gcoulby/model-viewer](https://gcoulby.github.io/model-viewer/).
