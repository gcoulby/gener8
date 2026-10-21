# Map fields

Nothing about the canvas has a fixed meaning. **Map fields** (steel, dashed) decide what position does: each one maps where a sound sits inside it to targets like pitch and pan.

## The four shapes

| Map | Shape | Axes |
|---|---|---|
| ![xy](icons/field-xy.svg) **xy** | rectangle | **x** left → right, **y** bottom → top |
| ![radial](icons/field-radial.svg) **radial** | circle | **r** from the centre out to the edge |
| ![sweep](icons/field-sweep.svg) **sweep** | circle | **around**, once round clockwise from the top |
| ![tri](icons/field-tri.svg) **tri** | triangle | **a**, **b**, **c**, each from the opposite edge to its own corner |

Every bundled example, and every **new** patch, starts with one big XY field: pitch on y, pan on x.

## Selecting and editing a map

Map fields sit under everything else, so clicking inside one does nothing to it: you can still click and drag the canvas there. Select a map by its **edge**, its **label** (top-left of an XY field, above a circle or triangle), or with <kbd>tab</kbd>.

A selected map shows one row per axis in its bar:

- Click the **target** chip (e.g. `pitch ▾`) for a menu of targets. Scroll over it to step through them.
- Drag or scroll the two **end** chips to set the value at each end (left/right, bottom/top, centre/edge…). Putting the bigger value at the low end flips the axis.

Drag the **▪** corner to resize. An XY field resizes from its corner, and the opposite corner stays put. Drag the edge to move it.

## Targets

| Target | Range | |
|---|---|---|
| **pitch** | C1 to C7 | Snapped to the key afterwards. |
| **pan** | L100 to R100 | |
| **level** | −40 to +12 dB | On top of size and the mixer. |
| **reach** | ×0 to ×24 | How far [retriggers](retrigger.md) travel. |
| **angle** | 0° to 360° | Retrigger direction. |
| **spread** | 0° to 360° | Retrigger fan width. |
| **fall-off** | 0% to 100% | How much strength retriggers lose. |
| **sound params** | 0% to 100% | Any parameter of the sounds inside (cutoff, decay, brightness…), over its full range. |

Retrigger targets override each sound's own settings while it's inside the map.

## Overlapping maps

When maps overlap, each target comes from the **highest layer** that sets it. A small map over part of a big one overrides just that patch of ground, and only for the targets it sets. A sound outside every map plays its own [note](sounds.md#pitch-and-note), centred.

## Recipes

- **Spread out without hard panning.** Make an XY field 4000 wide with pan from L50 to R50. Sounds can sit far apart, out of each other's ripple reach, and still sit near the centre of the mix.
- **A spotlight.** A radial map with level 0 dB at the centre and −24 dB at the edge. Sounds fade as they drift out.
- **Cycling melodies.** A sweep map on pitch, with a sound orbiting inside it. The sound plays a rising line once per orbit.
- **A three-way blend.** A tri map with pitch, pan and reach on its corners. Moving a sound blends all three.
- **Moving maps.** Maps can move and breathe too. A drifting XY field slowly re-pitches everything on it.
