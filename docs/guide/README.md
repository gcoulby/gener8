# Getting started

GENER8 is a generative music instrument on an infinite canvas. You don't patch cables or draw notes. You place **sounds**, lay **fields** over them, and let position, overlap, motion and ripples make the music. Where things sit *is* the patch.

## Your first minute

1. Press <kbd>space</kbd> (or tap ▶ on a phone) to start audio. The **ambient** demo is loaded the first time you open GENER8.
   On a phone you start in **pan** mode, where one finger just moves around: tap **pan** in the bar to switch to **select** before step 3. See [On a phone or tablet](touch.md).
2. Drag the canvas to look around. Scroll or pinch to zoom.
3. Drag a sound into or out of an amber circle and hear it start or stop.
4. Open **examples ▾** in the bottom bar to try the other demos.
5. Press **random** in **patch ▾** for a patch built from a random seed.

## What's on screen

| Where | What |
|---|---|
| Left | The **palette**: sounds, then generators, transformers, FX and maps. Drag one onto the canvas. |
| Middle | The **canvas**. Everything here is part of the patch. |
| Under a selection | The **selection bar**: motion, group, note, retrigger and axis controls for whatever you selected. On touch, a strip above the bottom bar shows the selection instead; tap **edit** in it to open the selection bar ([more](touch.md#the-selection-strip)). |
| Top right | The **minimap**: the whole patch and your view. Click or drag in it to move. |
| Bottom | The **bar**: play, volume, tempo, key and seed on the left; mixer, capture, render, the patch and examples menus, **? help** and **discord ↗** on the right. Along its top is the **timeline strip**. On a phone, **☰** opens everything else. |

## The colours mean roles

| Colour | Role | |
|---|---|---|
| warm white | **sound** | Makes audio. Filled: driven by a generator. Hollow: listens for ripples. |
| amber | **generator** | Plays notes on the sounds inside it. |
| teal | **transformer** | Changes those notes on the way. |
| violet | **FX** | Processes the audio of the sounds inside. |
| steel | **map** | Turns position into pitch, pan, level and more. |

The deeper a sound sits inside a field, the more that field acts on it: depth runs from 0 at the edge to 1 at the centre. Overlap and proximity are the only connections.

## A simple patch from scratch

1. Press **new**. You get an empty stage: one XY map field with pitch going up and pan going across.
2. Drag a **pluck** (or any sound) onto the stage.
3. Drag a **pulse** generator over it. The sound fills in and starts playing a rhythm.
4. Drag a **reverb** over both.
5. Drag a second pluck just outside the pulse. It stays hollow and answers the first one's ripples.
6. Select the first pluck and try **⤓ bounce** or **◯ orbit** in its bar.

## Read on

- [Sounds](sounds.md): the ten voices (one with eight models), their internals, size and note
- [Fields](fields.md): generators, transformers and FX
- [Map fields](maps.md): what position means, and how to spread out
- [Ripples and retriggers](retrigger.md): call and response between sounds
- [Motion and groups](motion.md): breathe, orbit, drift, path, bounce and follow
- [Mixing, capture and sharing](mixing.md)
- [Shortcuts](shortcuts.md)
- [On a phone or tablet](touch.md): pan and select modes, the selection strip, gestures
- [Patch structure](model.md): the metamodel diagram, and what a patch file holds

## Community

Join the [GENER8 Discord](https://discord.gg/yA3CC5vTYn) to share patches, ask questions and hear what others are making. In the app, **discord ↗** is at the right end of the bottom bar.

## AI use

AI tools were used in the development of this app. No AI was used to create any music or audio in the app. The design and architecture of the app is entirely my own. I think it's the responsible thing to say so openly, and I review and take responsibility for everything that ships.
