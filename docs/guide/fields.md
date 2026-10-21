# Fields

Fields are coloured regions that act on every sound inside them. How strongly a field acts depends on **depth**: 0 at the edge, 1 at the centre. Each field has a **▪ size handle** and up to two **◔ character handles**: drag those up or down to set the field's character. Hover a handle to see its value.

Processing order is fixed by role: generators → transformers → the sound → FX. Within a role, the **layer** order decides. Select a field and press <kbd>[</kbd> or <kbd>]</kbd> to move it down or up; its layer number shows in its label.

## Generators (amber)

Generators play notes on the sounds inside them. Most play each sound in its own register, so moving a sound changes what it plays.

| Generator | What it does | Handles |
|---|---|---|
| ![pulse](icons/field-pulse.svg) **pulse** | A Euclidean rhythm that turns like a music box. A sound fires when a hit passes its angle around the centre. | **hits** out of **length** steps (16ths) |
| ![drift](icons/field-drift.svg) **drift** | A seeded random-walk melody per sound. Deeper sounds play more often. | **rate** (notes per beat), **entropy** (how far it wanders) |
| ![arp](icons/field-arp.svg) **arp** | Up-and-down chord-tone arpeggio. Each sound's angle offsets where it starts. | **rate**, **span** (how many chord tones) |
| ![rain](icons/field-rain.svg) **rain** | Sparse droplets off the grid, at seeded pitches near the sound's note. | **density**, **range** |
| ![strum](icons/field-strum.svg) **strum** | Every few beats, a slow strummed chord on each sound. Sounds take turns by angle. | **every** (beats), **strum** (gap between strings) |
| ![grid](icons/field-grid.svg) **grid** | Conway's Game of Life on a grid. A sound fires when a cell is born under it. | **rate** (generations per beat), **entropy** (random births) |
| ![phase](icons/field-phase.svg) **phase** | Each sound loops a short seeded motif. The farther it is from the centre, the longer its loop, so loops drift in and out of step, as in *Music for Airports*. | **motif** (notes), **spread** (how much longer the outer loops get) |
| ![chords](icons/field-chords.svg) **chords** | A seeded chord progression in the key. Each sound takes a chord tone by its angle, in the octave nearest its own note, so voices lead smoothly. Sounds deeper than halfway restrike every bar. | **every** (bars per chord), **colour** (triads, 7ths, 9ths) |
| ![turing](icons/field-turing.svg) **turing** | After the Music Thing Modular Turing Machine: a looping register of bits that may flip as they come round. Each sound reads it from its own angle, firing on set bits; the next bits pick the note, over a wider range the deeper it sits. The register shows round the rim. | **length** (steps, in 8ths), **change** (0 locks the loop) |
| ![topo](icons/field-topo.svg) **topo** | After Mutable Instruments Grids: a map of drum patterns. Where a sound sits blends between them, so moving it morphs its groove; its angle picks low, mid or high parts. | **density**, **chaos** |
| ![plinko](icons/field-plinko.svg) **plinko** | The sounds inside are pegs. Balls drop in near the top centre, fall and bounce off them; each peg a ball hits fires, harder the faster it's going. Move the pegs to change the tune. | **drop every**, **snap** (free, or hits moved onto 1/32, 1/16 or 1/8) |
| ![wave](icons/field-wave.svg) **wave** | A line sweeps across the field and fires each sound it passes. | **period** (beats per sweep), **sweep** (one way, or there and back) |
| ![bounce](icons/field-bounce.svg) **bounce** | Every few beats, each sound plays a bouncing ball: hits that come faster and softer until they settle. Depth sets the height of the drop. (Not the same as the bounce *motion*, which moves an object.) | **every** (beats), **bounciness** |
| ![polyrhythm](icons/field-poly.svg) **polyrhythm** | One cycle, divided differently for each sound: deeper sounds get more hits, so 3 plays against 4 against 5. | **cycle** (beats), **up to** (the most hits per cycle, at the centre) |

## Transformers (teal, dashed)

Transformers change notes on their way from a generator to the sound.

| Transformer | What it does | Handles |
|---|---|---|
| ![probability](icons/field-probability.svg) **probability** | Drops a share of notes. | **thinning** |
| ![transpose](icons/field-transpose.svg) **transpose** | Shifts notes up or down. | **interval** (±12 semitones) |
| ![quantise](icons/field-quantise.svg) **quantise** | Snaps notes to another scale and root. | **scale**, **root** |
| ![harmony](icons/field-harmony.svg) **harmony** | Adds in-key voices above each note: one at the edge, three at the centre. | **stack** (3rds, 4ths, 5ths, 6ths or octaves), **level** |
| ![humanise](icons/field-humanise.svg) **humanise** | Pushes notes late and varies their velocity. | **timing**, **dynamics** |
| ![hold](icons/field-hold.svg) **hold** | Stretches notes into long swells. | **length** (up to 32×) |
| ![ratchet](icons/field-ratchet.svg) **ratchet** | Repeats each note as a fading burst. | **rate** |
| ![every Nth](icons/field-everyNth.svg) **every Nth** | Keeps only every Nth note. | **N**, **offset** |
| ![canon](icons/field-canon.svg) **canon** | A round: each note comes back later, moved by an interval in the key and softer each time. One repeat at the edge, three at the centre. The repeats are real notes, so later transformers and ripples treat them like any other. | **delay**, **interval** (an octave down to an octave up) |
| ![mirror](icons/field-mirror.svg) **mirror** | Turns melodies upside down around an axis note, staying in key. Deeper sounds have more of their notes flipped. | **axis** (C2 to C6), **share** |

## FX (violet)

**Insert** FX process each sound inside them in series, with depth as the amount. **Bus** FX collect a send from every sound inside: the send level is the depth, and the effect returns on its own mixer channel.

| FX | Kind | Handles |
|---|---|---|
| ![filter](icons/field-filter.svg) **filter** | insert | **cutoff**, **resonance**. Fully open at the edge, closing towards the centre. |
| ![tape](icons/field-tape.svg) **tape** | insert | **age** (saturation, dulling, hiss), **wobble** (wow and flutter) |
| ![tape delay](icons/field-delay.svg) **tape delay** | bus | **time**, **feedback** |
| ![chorus](icons/field-chorus.svg) **chorus** | bus | **rate**, **depth** |
| ![reverb](icons/field-reverb.svg) **reverb** | bus | **size** (1 to 25 s), **damping** |
| ![shimmer](icons/field-shimmer.svg) **shimmer** | bus | **size**, **shimmer** (octave-up bloom) |
| ![resonator](icons/field-resonator.svg) **resonator** | insert | **decay**, **mix**. Strings tuned to the key (root, 5th, octave, 10th, 12th) that ring in sympathy with whatever passes through. |
| ![freeze](icons/field-freeze.svg) **freeze** | bus | **size** (grain length), **density** (grains per second). Holds what's sent to it as an endless, slowly smearing cloud of grains. |
| ![tremolo](icons/field-tremolo.svg) **tremolo** | insert | **rate** (1/16 to a bar, locked to the beat), **depth** |
| ![lo-fi](icons/field-lofi.svg) **lo-fi** | insert | **bits**, **rate** (sample rate). Crushed, from clean at the edge to fully crunchy at the centre. |

## Tips

- Overlapping fields stack. A sound in a pulse, a harmony and a reverb plays the rhythm, harmonised, wet.
- Give a field **breathe** motion and its depth on every sound rises and falls: a filter that opens and closes, or a reverb that swells. See [Motion](motion.md).
- Move a sound slowly through a filter or reverb for a sweep.
