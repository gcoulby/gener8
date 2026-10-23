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
| ![sequencer](icons/field-sequencer.svg) **sequencer** | A step sequence you write by hand: select it and drag or scroll the **steps** chips in its bar. Each step is a scale degree from the sound's own note (−7 to +7), or **·** for a rest. Each sound starts at the step its angle points to, so sounds round the circle play it as a round. | **rate** (1/16 to 1/4), **length** (1 to 16 steps) |
| ![L-system](icons/field-lsystem.svg) **L-system** | A short rule rewritten into itself, generation after generation, grows a long self-similar melody in 8ths: **algae** (Fibonacci), **koch**, **tree**, or **cantor**, a rhythm full of gaps. Sounds round the circle play staggered copies. | **rule**, **generations** |
| ![bells](icons/field-bells.svg) **bells** | Change ringing. The sounds inside are bells, numbered clockwise from the top. Every change rings each bell once; the method swaps neighbours to weave them through every position. **plain hunt** comes back to rounds after twice as many changes as bells; **plain bob** runs much longer. As in a tower, there's a gap before each handstroke. | **method** (rounds, plain hunt, plain bob, shuffle), **rate** (strikes per beat) |
| ![automaton](icons/field-automaton.svg) **automaton** | A one-dimensional cellular automaton: a row of cells, each generation worked out from the one before. Rule 30 is chaotic, 90 draws a Sierpiński triangle, 110 crawls. A sound fires when its column lights up. The field shows the recent rows, newest at the bottom. | **rule**, **rate** (rows per beat) |
| ![pendulum](icons/field-pendulum.svg) **pendulum** | A double pendulum hangs from the centre and swings without friction: regular when calm, wildly chaotic with energy. A sound fires each time the lower bob sweeps past its angle. (Not the same as the pendulum *motion*, which swings an object.) | **speed**, **energy** |
| ![flock](icons/field-flock.svg) **flock** | A flock of boids wheels round inside the field, turning back at its edge. A sound fires when a boid flies into it. High cohesion makes a tight swarm that sweeps from sound to sound; low cohesion scatters it. | **boids** (3 to 16), **cohesion** |
| ![midi in](icons/field-midi.svg) **midi in** | Plays incoming MIDI notes on every sound inside, at the note's own pitch, louder the deeper a sound sits. Sustained sounds take them as accents. See [MIDI](mixing.md#midi). | **channel** (omni or 1 to 16), **octave** (±2) |

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
| ![swing](icons/field-swing.svg) **swing** | Pushes every second 8th or 16th late, up to a 75% swing at the centre. Nothing moves earlier. | **amount**, **grid** (1/8, 1/16) |
| ![accent](icons/field-accent.svg) **accent** | Makes notes on every Nth 16th louder and the rest softer, so a flat pattern finds a downbeat. | **every**, **strength** |
| ![throttle](icons/field-throttle.svg) **throttle** | A density limit: each sound keeps its first notes in each window, and notes over the limit are dropped, more often the deeper it sits. Tames busy generators like rain and plinko. | **max** notes, **per** window |
| ![scatter](icons/field-scatter.svg) **scatter** | Throws a share of notes up or down by whole octaves, spreading a narrow pattern across the keyboard. | **range** (±1 to 3 octaves), **chance** |
| ![smooth](icons/field-smooth.svg) **smooth** | Keeps lines singable. A note that leaps further than the limit from the sound's last note is folded back by octaves, or squeezed to the in-key note at the limit. Nearer the edge, bigger leaps get through. | **max leap**, **mode** (fold, squeeze) |
| ![glide](icons/field-glide.svg) **glide** | Portamento: a share of notes slide in from the sound's previous note. See [Glide](sounds.md#glide) for the sounds that follow it. | **time**, **share** |
| ![echo](icons/field-echo.svg) **echo** | Each note repeats at the same pitch, fading each time: two repeats at the edge, six at the centre. The repeats are real notes, so they ripple and transform like any other. | **gap**, **decay** |
| ![retrograde](icons/field-retrograde.svg) **retrograde** | Plays each window backwards in the next one: a rising line comes back falling, a window later. | **window** (half a bar to 4 bars), **share** |

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
| ![drive](icons/field-drive.svg) **drive** | insert | **drive**, **curve** (soft saturation through to a wavefolder). |
| ![wax](icons/field-wax.svg) **wax** | insert | **crackle**, **wear** (dull top, rumble and groove noise). A worn record. |
| ![phaser](icons/field-phaser.svg) **phaser** | insert | **rate** (1/8 to 4 bars, locked to the beat), **depth**. Six allpass stages sweeping notches through the sound. |
| ![flanger](icons/field-flanger.svg) **flanger** | insert | **rate** (locked to the beat), **feedback**. The jet-plane whoosh. |
| ![ring mod](icons/field-ringmod.svg) **ring mod** | insert | **ratio**, **mix**. Multiplies the sound by a sine tuned to the key's root, times the ratio, so the clangour stays related to the key. |
| ![octaver](icons/field-octaver.svg) **octaver** | insert | **down** (one octave, two or both), **mix**. An analog-style divider; best on single notes. |
| ![spring](icons/field-spring.svg) **spring** | bus | **tension**, **drip**. A spring tank: the boing and the chirping drip of a guitar amp's reverb. |
| ![beat repeat](icons/field-beatRepeat.svg) **beat repeat** | insert | **slice** (1/16 to 1/2), **chance**. At each slice it may grab the slice that just played and stutter it one to three times, locked to the beat. |

## Tips

- Overlapping fields stack. A sound in a pulse, a harmony and a reverb plays the rhythm, harmonised, wet.
- Give a field **breathe** motion and its depth on every sound rises and falls: a filter that opens and closes, or a reverb that swells. See [Motion](motion.md).
- Move a sound slowly through a filter or reverb for a sweep.
