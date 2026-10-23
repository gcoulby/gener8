# Motion and groups

**Motion is modulation.** Anything can move: sounds, generators, FX, even map fields. A sound sliding through a filter gets a sweep, a breathing reverb swells, and a drifting map slowly changes what everything on it plays. Motion is tempo-synced and repeats exactly, so it scrubs and captures like everything else.

Select an object and use the first row of its bar: **∿ breathe**, **↻ spin**, **⇔ stretch** (fields only) and **move ▾**, a menu of the ways it can travel. Press <kbd>m</kbd> to cycle through the movements and <kbd>b</kbd> to toggle breathe.

## Movements

Pick one from **move ▾**, or **still** to stop. Each has its own row of values in the bar.

| | |
|---|---|
| **◯ orbit** | Circles its home spot. **radius** and **every N beats**. Drag the handle on the circle to set the radius. |
| **≈ drift** | Wanders smoothly around home, the same way every time for a given seed. **range** and **speed**. |
| **⌇ path** | Follows a looped curve through points. Drag the points; switch between **loop** and **pingpong**. **dwell** makes it wait at each point for a share of the way to the next: a sequencer laid out in space. |
| **⤓ bounce** | Drops from a height and bounces lower and lower onto its spot, then does the same in reverse back up to the top. **height**, **bounces** and **every N beats**. Drag the handle above it to set the height. |
| **⟟ pendulum** | Hangs from a pivot above its home and swings, slowing at each end. **length** and **swing** (degrees each way). |
| **∞ lissajous** | Sideways and up-and-down at different speeds, tracing a figure: **x ×1**, **y ×2** is a figure eight; 3 against 2 is a knot. |
| **꩜ spiral** | Winds out from home and back in, **turns** times each way, once a period. |
| **✿ rose** | A rose curve of **petals**, passing back through home between each. |
| **⚙ spirograph** | A circle rolling inside a circle: **loops** and **arm** (how far out the pen sits). |
| **⁖ hop** | Jumps between a few seeded **spots** within range, gliding quickly then sitting still: one hop every N beats. |
| **⌁ spring** | Flicked out in a seeded direction once a period, wobbling back to rest. **stretch** and **damping**. |
| **⇹ shuttle** | Back and forth along a line at an **angle**, **distance** each way. |

Orbit, path and shuttle also have an **ease**: **linear**, **smooth** (easing in and out) or **elastic** (overshooting and settling).

## Breathe, spin and stretch

These work alongside a movement.

| | |
|---|---|
| **∿ breathe** | Grows and shrinks. On a field that changes depth on every sound inside; on a sound, its loudness. **depth**, **every N beats** and a **shape**: sine, triangle, ramp, square (a pumping on/off) or step (a new seeded size each period). |
| **↻ spin** | Turns once every N beats, clockwise or anticlockwise. A spinning field carries what it does round with it: a pulse's music box turns, a map's axes rotate, a grid's cells sweep past the sounds. A spinning sound turns its point and multi [retriggers](retrigger.md), like a lighthouse. |
| **⇔ stretch** | Fields only: squashes one way as it stretches the other, by **amount**, every N beats. A circle becomes an ellipse; a map's axes stretch with it. |

A selected moving object shows its route as a dotted line, with a cross at its home spot. <kbd>alt</kbd>-scroll halves or doubles the period.

Periods run from 1 beat up to **256 bars**. Set a long one for slow changes across a whole piece: a reverb that swells once every 128 bars, or a filter that drifts open over 256. From 16 bars up, the bar shows the period in bars.

## Groups: follow

Any object can **follow** another:

1. Select the object that should follow.
2. Click **⛓ follow…** in its bar.
3. Click the leader.

A follower rides along with its leader's motion, breathing, spin and stretch, on top of its own. Dragging or nudging a leader moves its followers with it. Give a follower a **lag** to trail its leader by that many beats: followers with different lags string out behind a moving leader like a ripple. With a leader selected, its bar says how many it leads, and dotted lines link it to its followers. **× unfollow** breaks the link.

Chains work: a can follow b, which follows c. A follow that would make a loop is refused.

### A moving rig

Put a pulse generator, a couple of sounds, a harmony and a reverb together. Make everything follow the pulse. Give the pulse a slow orbit. The whole rig now travels round the canvas: through map fields that change its pitch and pan, and past hollow sounds that answer as it goes by.
