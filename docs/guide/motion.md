# Motion and groups

**Motion is modulation.** Anything can move: sounds, generators, FX, even map fields. A sound sliding through a filter gets a sweep, a breathing reverb swells, and a drifting map slowly changes what everything on it plays. Motion is tempo-synced and repeats exactly, so it scrubs and captures like everything else.

Select an object and use the first row of its bar. Press <kbd>m</kbd> to cycle through the movements and <kbd>b</kbd> to toggle breathe.

## Movements

| | |
|---|---|
| **∿ breathe** | Grows and shrinks. On a field that changes depth on every sound inside; on a sound, its loudness. **depth** and **every N beats**. |
| **◯ orbit** | Circles its home spot. **radius** and **every N beats**. Drag the handle on the circle to set the radius. |
| **≈ drift** | Wanders smoothly around home, the same way every time for a given seed. **range** and **speed**. |
| **⌇ path** | Follows a looped curve through points. Drag the points; switch between **loop** and **pingpong**. |
| **⤓ bounce** | Drops from a height and bounces lower and lower onto its spot, then does the same in reverse back up to the top. **height**, **bounces** and **every N beats**. Drag the handle above it to set the height. |

A selected moving object shows its route as a dotted line, with a cross at its home spot. <kbd>alt</kbd>-scroll halves or doubles the period.

## Groups: follow

Any object can **follow** another:

1. Select the object that should follow.
2. Click **⛓ follow…** in its bar.
3. Click the leader.

A follower rides along with its leader's motion and breathing, on top of its own. Dragging or nudging a leader moves its followers with it. With a leader selected, its bar says how many it leads, and dotted lines link it to its followers. **× unfollow** breaks the link.

Chains work: a can follow b, which follows c. A follow that would make a loop is refused.

### A moving rig

Put a pulse generator, a couple of sounds, a harmony and a reverb together. Make everything follow the pulse. Give the pulse a slow orbit. The whole rig now travels round the canvas: through map fields that change its pitch and pan, and past hollow sounds that answer as it goes by.
