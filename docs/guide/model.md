# Patch structure

Everything you build is one **patch**: a small JSON document listing the objects on the canvas. The diagram below is its metamodel, generated from [`gener8.ecore`](https://github.com/gcoulby/gener8/blob/main/docs/gener8.ecore). It shows every kind of object, what each one holds and how they relate.

![GENER8 patch metamodel](../gener8-model.svg)

Drag to pan, <kbd>⌘</kbd>-scroll or pinch to zoom, double-click to zoom in (<kbd>shift</kbd>: out). **⤢** fills the guide with it; <kbd>esc</kbd> leaves. **open ↗** shows the SVG on its own, where hovering a class shows its notes.

## Reading the diagram

| Mark | Means |
|---|---|
| box | A class: one kind of thing in a patch, with its attributes and their types. *Italic* names are abstract: you never place one directly, only one of its subclasses. |
| hollow triangle | Inheritance. The arrow points at the parent: a `PluckSound` *is a* `EventSound`, which *is a* `Sound`. |
| filled diamond | Containment. The diamond end owns the other end, which is stored inside it in the JSON. |
| plain arrow | A reference to an object stored elsewhere, by its id. |
| colour | The same roles as on the canvas: sounds warm white, generators amber, transformers teal, FX violet, maps steel. |

## The parts

### Patch

The root. It holds the `seed`, `tempo`, the `key` (a root note and a `Scale`), an optional `master` level in dB and the list of `objects`. `version` is 2. Version 1 patches, which had a fixed y = pitch and x = pan, are upgraded when they load: they get a stage XY field that reproduces the old mapping exactly.

### PatchInfo

Optional: who made the patch and what it is. Its `title`, `artist`, `genre`, `url` and `notes` are plain text, and every one is optional. It's shown when the patch is opened and never changes the sound (see [Patch info](mixing.md#patch-info)).

### SceneObject

Everything on the canvas is a `SceneObject`: it has an `id`, a position `x`, `y`, a `layer` (higher draws on top and wins where maps overlap) and optional `motion`. `follow` is the [group link](motion.md#groups-follow): the id of the leader it rides along with.

There are two branches:

- **Sound**: makes audio. It has a `size`, a `note` for when no map sets pitch, and optional `RippleSettings`. Below it, `EventSound`s (subtractive, FM, pluck, percussion, macro, bass, wavetable, organ, chip, pipe, bowed) play notes that end, and `SustainedSound`s (pad, drone, additive, noise, shepard, bowl, cloud) swell and fade as they enter and leave generators. A sound can also carry `midiOut`, set from the [mixer](mixing.md#midi). Their attributes are the knobs in the [internals panel](sounds.md).
- **Field**: acts on the sounds inside its `Shape` (a `Circle` or a `Rectangle`). Its subclasses are the four roles, and each concrete field's attributes are its handles, stored 0 to 1.

### Fields by role

| Abstract class | Concrete fields | See |
|---|---|---|
| `GeneratorField` | pulse, drift, arp, rain, strum, grid, phase, chords, turing, topo, plinko, wave, bounce, poly, sequencer, L-system, bells, automaton, pendulum, flock, midi in | [Generators](fields.md#generators-amber) |
| `TransformerField` | probability, transpose, quantise, harmony, humanise, hold, ratchet, every-nth, canon, mirror, swing, accent, throttle, scatter, smooth, glide, echo, retrograde | [Transformers](fields.md#transformers-teal-dashed) |
| `FxField` → `InsertFx` | filter, tape, resonator, tremolo, lofi, drive, wax, phaser, flanger, ring mod, octaver, beat repeat: processed per sound | [FX](fields.md#fx-violet) |
| `FxField` → `BusFx` | delay, chorus, reverb, shimmer, freeze, spring: shared sends | [FX](fields.md#fx-violet) |
| `MapField` | XY, radial, sweep, tri, spiral, tonnetz, midi cc | [Map fields](maps.md) |

### Map fields and axes

A `MapField` contains one `Axis` per direction it measures: `x` and `y` for XY, `r` for radial, `t` for sweep and spiral, `a`, `b`, `c` for tri, `n` for tonnetz and `v` for midi cc. Each axis says what it drives (`to`: pitch, pan, level, a ripple setting, or `param:<knob>`) and the values at its two ends (`min`, `max`). See [targets](maps.md#targets).

### Motion

`Motion` holds a position motion (orbit, drift, path with its `PathPoint`s, bounce, pendulum, lissajous, spiral, rose, spirograph, hop, spring or shuttle), `BreatheMotion`, which scales the object, `SpinMotion` and `StretchMotion`, and a `lag` for followers. Periods are in beats, so motion stays locked to the tempo. A sequencer also stores its steps, as `seq`. See [Motion and groups](motion.md).

### RippleSettings

How a sound's ripples spread when it plays: `mode` (ripple, point or multi), `angle`, `count`, `spread`, `reach`, `falloff` and `stop`. Missing values take the defaults, and map axes can override angle, spread, reach and fall-off. See [Ripples and retriggers](retrigger.md).

## In JSON

A patch file is the diagram written out. Containment becomes nesting, and references become ids:

```json
{
  "format": "gener8.patch",
  "version": 2,
  "seed": 6600,
  "tempo": 66,
  "key": { "root": 7, "scale": "mixolydian" },
  "objects": [
    { "id": "xy1", "kind": "field", "type": "xy", "x": 0, "y": 0, "layer": 0,
      "shape": { "w": 1600, "h": 720 }, "handles": {},
      "axes": { "x": { "to": "pan", "min": -1, "max": 1 },
                "y": { "to": "pitch", "min": 24, "max": 96 } } },
    { "id": "f1", "kind": "field", "type": "pulse", "x": -100, "y": 0, "layer": 1,
      "shape": { "r": 160 }, "handles": { "hits": 0.5, "length": 0.4 } },
    { "id": "s1", "kind": "sound", "type": "pluck", "x": -100, "y": 20, "size": 42, "layer": 10,
      "params": { "decay": 0.5, "bright": 0.6, "damp": 0.3 },
      "ripple": { "mode": "point", "angle": 90 },
      "motion": { "pos": { "type": "bounce", "height": 120, "bounces": 4, "periodBeats": 8 } } },
    { "id": "s2", "kind": "sound", "type": "pluck", "x": 200, "y": 20, "size": 36, "layer": 11,
      "params": { "decay": 0.5, "bright": 0.6, "damp": 0.3 }, "follow": "s1" }
  ]
}
```

Save a patch with <kbd>⌘S</kbd> to see a real one. Loading checks a file first: out-of-range values are clamped and unknown keys dropped, so a hand-edited patch is safe to open. See [Saving, opening and new](mixing.md#saving-opening-and-new).
