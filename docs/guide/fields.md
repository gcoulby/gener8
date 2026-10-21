# Fields

Fields are coloured regions that act on every sound inside them. How strongly a field acts depends on **depth**: 0 at the edge, 1 at the centre. Each field has a **▪ size handle** and up to two **◔ character handles**: drag those up or down to set the field's character. Hover a handle to see its value.

Processing order is fixed by role: generators → transformers → the sound → FX. Within a role, the **layer** order decides. Select a field and press <kbd>[</kbd> or <kbd>]</kbd> to move it down or up; its layer number shows in its label.

## Generators (amber)

Generators play notes on the sounds inside them. Most play each sound in its own register, so moving a sound changes what it plays.

| Generator | What it does | Handles |
|---|---|---|
| **pulse** ◉ | A Euclidean rhythm that turns like a music box. A sound fires when a hit passes its angle around the centre. | **hits** out of **length** steps (16ths) |
| **drift** ≈ | A seeded random-walk melody per sound. Deeper sounds play more often. | **rate** (notes per beat), **entropy** (how far it wanders) |
| **arp** ⋰ | Up-and-down chord-tone arpeggio. Each sound's angle offsets where it starts. | **rate**, **span** (how many chord tones) |
| **rain** ∴ | Sparse droplets off the grid, at seeded pitches near the sound's note. | **density**, **range** |
| **strum** ⫼ | Every few beats, a slow strummed chord on each sound. Sounds take turns by angle. | **every** (beats), **strum** (gap between strings) |
| **grid** ▦ | Conway's Game of Life on a grid. A sound fires when a cell is born under it. | **rate** (generations per beat), **entropy** (random births) |

## Transformers (teal, dashed)

Transformers change notes on their way from a generator to the sound.

| Transformer | What it does | Handles |
|---|---|---|
| **probability** % | Drops a share of notes. | **thinning** |
| **transpose** ↕ | Shifts notes up or down. | **interval** (±12 semitones) |
| **quantise** ♮ | Snaps notes to another scale and root. | **scale**, **root** |
| **harmony** ⊕ | Adds in-key voices above each note: one at the edge, three at the centre. | **stack** (3rds, 4ths, 5ths, 6ths or octaves), **level** |
| **humanise** ~ | Pushes notes late and varies their velocity. | **timing**, **dynamics** |
| **hold** ⌒ | Stretches notes into long swells. | **length** (up to 32×) |
| **ratchet** ≡ | Repeats each note as a fading burst. | **rate** |
| **every Nth** ÷ | Keeps only every Nth note. | **N**, **offset** |

## FX (violet)

**Insert** FX process each sound inside them in series, with depth as the amount. **Bus** FX collect a send from every sound inside: the send level is the depth, and the effect returns on its own mixer channel.

| FX | Kind | Handles |
|---|---|---|
| **filter** ∿ | insert | **cutoff**, **resonance**. Fully open at the edge, closing towards the centre. |
| **tape** ▭ | insert | **age** (saturation, dulling, hiss), **wobble** (wow and flutter) |
| **tape delay** ⋯ | bus | **time**, **feedback** |
| **chorus** ◎ | bus | **rate**, **depth** |
| **reverb** ◌ | bus | **size** (1 to 25 s), **damping** |
| **shimmer** ✦ | bus | **size**, **shimmer** (octave-up bloom) |

## Tips

- Overlapping fields stack. A sound in a pulse, a harmony and a reverb plays the rhythm, harmonised, wet.
- Give a field **breathe** motion and its depth on every sound rises and falls: a filter that opens and closes, or a reverb that swells. See [Motion](motion.md).
- Move a sound slowly through a filter or reverb for a sweep.
