# At a glance

The whole instrument on one page. Each section links to the page with the details.

## The idea

You place **sounds** on an infinite canvas and lay **fields** over them. Where things sit is the patch: there are no cables. A sound plays when a generator field covers it or a ripple reaches it, and every field it sits in shapes what it plays. The deeper inside a field, the stronger its effect.

| Colour | Role | Does |
|---|---|---|
| warm white | [sound](sounds.md) | Makes audio. Filled: driven by a generator. Hollow: listens for ripples. |
| amber | [generator](fields.md) | Plays notes on the sounds inside it. |
| teal | [transformer](fields.md) | Changes those notes on the way. |
| violet | [FX](fields.md) | Processes the audio of the sounds inside. |
| steel | [map](maps.md) | Turns position into pitch, pan, level and more. |

## The screen

| Where | What |
|---|---|
| left | The palette. Drag a sound or field onto the canvas. On a phone, **+** opens it. |
| middle | The canvas. Drag empty space to pan, scroll or pinch to zoom. On touch, one finger pans anywhere; see [On a phone or tablet](touch.md). |
| under a selection | The selection bar: motion, follow, note, retrigger and axis controls. |
| top right | The minimap. Click or drag in it to move the view, <kbd>n</kbd> hides it. |
| bottom | The bar: play, level, tempo, key and seed; mixer, capture, render; the **patch ▾** and **examples ▾** menus; this help. On a phone, **☰** opens the rest. |
| along the bar's top | The timeline: the last five minutes. |

## Building

- **Place**: drag from the palette. <kbd>alt</kbd>-drag an object to duplicate it.
- **Shape**: select something and drag its handles. ▪ sets a sound's loudness and ripple reach, or a field's size. ◔ sets a field's character: drag it up or down.
- **Go inside**: double-click a sound, or zoom right in on it, for its oscillators, filter and envelope. See [Sounds](sounds.md).
- **Pick through a stack**: <kbd>tab</kbd> cycles through everything under the cursor, field edges included. <kbd>[</kbd> <kbd>]</kbd> change the layer.
- **Pitch**: [map fields](maps.md) set it from position, snapped to the patch's key. <kbd>↑</kbd> <kbd>↓</kbd> move a sound a semitone (<kbd>shift</kbd>: an octave). Where no map sets pitch, they change the sound's own note.

## Making it move

- **Motion**: the selection bar gives anything breathe, orbit, drift, path or bounce, with values you drag or scroll. <kbd>m</kbd> cycles motion, <kbd>b</kbd> toggles breathe. See [Motion and groups](motion.md).
- **Groups**: ⛓ **follow…** then click a leader, and the follower rides along with it.
- **Ripples**: every note sends out a ring that retriggers the hollow sounds it reaches, so layout alone makes call and response. See [Ripples and retriggers](retrigger.md).

## Playing

- <kbd>space</kbd> or ▶ starts and pauses.
- **vol**, **bpm** and **seed** in the bar: drag or scroll (<kbd>shift</kbd>: fine), or click and type. Double-click **vol** for 0 dB. <kbd>t</kbd> or **tap** taps the tempo.
- **The timeline**: drag along it to hear the patch as it was, and let go to branch from there. <kbd>esc</kbd> cancels. Nothing is lost by experimenting.
- **mixer**: a fader, mute and solo per sound, plus FX returns and the master. See [Mixing](mixing.md).

## Keeping it

| | |
|---|---|
| <kbd>c</kbd> / **● capture** | The last 30 seconds as a WAV, with the patch and edit log. |
| <kbd>shift</kbd>+<kbd>C</kbd> / **render ▾** | The patch from a fresh start, up to an hour, as a WAV. |
| <kbd>shift</kbd>+<kbd>V</kbd> | The same as an MP4 of the whole window, or a portrait [short](mixing.md#shorts). |
| <kbd>⌘S</kbd> / <kbd>⌘O</kbd> | Save a patch in this browser by name, or open one saved there. |
| <kbd>⇧⌘S</kbd> / <kbd>⇧⌘O</kbd> | Export the patch as a file, or import one. You can also drop a file on the canvas. |
| **share** | Copy a link to the patch. |
| <kbd>i</kbd> | Title, artist and notes: [patch info](mixing.md#patch-info). |
| <kbd>r</kbd> | A new patch from a random seed. **patch ▾** also makes one from a seed you type. |

Your patch is saved in the browser as you go.

## Where next

- New here? [Getting started](README.md) walks through a first patch.
- Every key and gesture: [Shortcuts](shortcuts.md).
- How a patch is put together: [Patch structure](model.md).
