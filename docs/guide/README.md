# Getting started

GENER8 is a generative music instrument on an infinite canvas. You don't patch cables or draw notes. You place **sounds**, lay **fields** over them, and let position, overlap, motion and ripples make the music. Where things sit *is* the patch.

## Your first minute

1. Press <kbd>space</kbd> (or tap ▶ on a phone) to start audio. The **ambient** demo is loaded the first time you open GENER8.
2. Drag the canvas to look around. Scroll or pinch to zoom.
3. Drag a sound into or out of an amber circle and hear it start or stop.
4. Open **examples ▾** in the bottom bar to try the other demos.
5. Press **random** for a patch built from a random seed.

## What's on screen

| Where | What |
|---|---|
| Left | The **palette**: sounds, then generators, transformers, FX and maps. Drag one onto the canvas. |
| Middle | The **canvas**. Everything here is part of the patch. |
| Under a selection | The **selection bar**: motion, group, note, retrigger and axis controls for whatever you selected. |
| Top right | The **minimap**: the whole patch and your view. Click or drag in it to move. |
| Bottom | The **bar**: patch actions on the left; play, volume, tempo, key, seed, mixer, capture, render and help on the right. Above it is the **timeline strip**. |

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

- [Sounds](sounds.md): the eight voices, their internals, size and note
- [Fields](fields.md): generators, transformers and FX
- [Map fields](maps.md): what position means, and how to spread out
- [Ripples and retriggers](retrigger.md): call and response between sounds
- [Motion and groups](motion.md): breathe, orbit, drift, path, bounce and follow
- [Mixing, capture and sharing](mixing.md)
- [Shortcuts](shortcuts.md)
- [Patch structure](model.md): the metamodel diagram, and what a patch file holds
