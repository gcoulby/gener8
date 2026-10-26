# Mixing, capture and sharing

## The mixer

Click **mixer** in the bar. Every sound gets a fader with **M** (mute), **S** (solo) and **midi** (MIDI out). Every bus FX (delay, chorus, reverb, shimmer…) gets a return fader, and there's a master. Meters are live.

- Drag a fader or scroll over it. Double-click a fader to reset it to 0 dB.
- Click a sound's name to select it on the canvas.
- Click **midi** to send the sound's notes to MIDI out as well; click again for MIDI **only** (its own audio goes quiet); again for off. Scroll over it to change the channel. See [MIDI](#midi).

Levels, mutes and solos are saved in the patch, so they're part of captures and links. **vol** in the bar is the master level as well.

## MIDI

GENER8 talks to MIDI gear in three ways. It needs a browser with Web MIDI: Chrome, Edge or Firefox on a computer. Safari and iOS don't have it, so there the MIDI parts show as unavailable, and everything else works as usual. The browser asks for permission the first time you place a MIDI field or switch on MIDI out.

| | |
|---|---|
| **midi in** (a [generator](fields.md#generators-amber)) | Play a keyboard or sequencer into the sounds inside it. Set the **channel** (or omni) and shift by octaves. |
| **midi cc** (a [map](maps.md#midi-cc)) | A knob or fader moves a value for every sound inside: level, pan, pitch or any sound parameter. **◎ learn** picks the controller. |
| **MIDI out** (the mixer) | A sound's notes, after every transformer, go to a hardware synth on the channel you set. Sustained sounds send their accents as short notes. |

Incoming notes and knob moves are recorded with everything else, so the timeline, captures and renders play them back exactly.

Under the master fader, once MIDI is in use: the **output** (click or scroll to step through the ports) and a **latency** trim in milliseconds (scroll). Notes are sent timed to when their audio reaches the speakers; nudge the trim if your synth sounds early or late against GENER8.

## Level, tempo, key and seed

On the left of the bar. **vol**, **bpm** and **seed** all work the same way: drag sideways or scroll over them to change them, holding <kbd>shift</kbd> for fine steps, or click and type a value, then press <kbd>enter</kbd>. Double-click **vol** to go straight back to 0 dB.

| | |
|---|---|
| **vol** | The master level, −40 to +12 dB. |
| **bpm** | The tempo. **tap** next to it (or <kbd>t</kbd>) taps it in: three taps or more. |
| **root**, **scale** | The key. Pick from the menu, or scroll over it to step. |
| **seed** | The seed behind every random choice in the patch: the same patch with other chances. Type any number or text. **roll** picks a new one. |

On a phone the bar has **▶**, **vol**, **bpm** and the key, which you can drag too, and the **pan** / **select** mode button ([On a phone or tablet](touch.md)). Tap any of them, or **☰**, for a sheet with everything else in it, sized for fingers. The sheet stays above the keyboard while you type.

## The timeline: going back

The strip along the top of the bar holds the last five minutes of what you did. Drag along it to hear and see the patch as it was. Let go to **branch** from that moment, or press <kbd>esc</kbd> to cancel. Nothing is lost by experimenting.

## Capture

Press <kbd>c</kbd> or **● capture** to save the last 30 seconds as a WAV, plus a JSON file with the patch, seed and every edit. That JSON re-renders the same WAV bit for bit:

```sh
npm run render-capture capture.json capture.wav
```

## Render

Capture records what you just heard. To get a longer take, press <kbd>shift</kbd>+<kbd>C</kbd> or open **render ▾**. Pick a length of up to an hour and the fades, or type a spec: `5` (minutes), `90s`, `1:30` or `1:00:00`, then press <kbd>enter</kbd>. The current patch is rendered from a fresh start, exactly as it would sound if you reloaded and pressed play, but faster than real time and in the background, so you can keep playing. While it runs, the bar shows its progress. Open the menu again to see how far it's got or to cancel it. When it finishes, you get a WAV and a JSON file with the patch and seed. An hour is about 1.4 GB of 32-bit float audio, and a typical patch takes a few minutes to render it.

To fade in and out, add `fade` after the length: `10m fade` fades over 3 seconds at each end. Set the time with `fade:10s`, or set each end on its own with `in:` and `out:`, e.g. `1:00:00 in:2s out:30s`. A fade length on its own is in seconds. The fades are smooth S-curves, starting and ending in silence. The fade buttons set the same thing. The menu remembers what you last rendered.

The same render from the command line, with the same fades, matches the in-app one bit for bit:

```sh
npm run render patch.json 3600 out.wav
npm run render patch.json 3600 out.wav -- --fade 2,30   # 2 s in, 30 s out
```

## Video

To get a video, for YouTube say, press <kbd>shift</kbd>+<kbd>V</kbd> or open **render ▾** and choose **video · mp4**. Pick the length, fades, size and frame rate, or type them as for a render: `5` is five minutes at 1080p and 30 fps, `90s 60fps fade` is 90 seconds at 60 fps fading in and out, and `1:00:00 4k out:30s` is an hour in 4K with a 30-second fade out. The picture fades from and to black along with the sound. The sizes are `720p`, `1080p`, `1440p` and `4k`, all 16:9. 30 fps suits the slow motion of most patches and halves the render time and file size compared with 60 fps.

The video shows the whole window, not only the canvas: the palette, minimap and timeline, a readout of the tempo, key, seed and level where the bar's controls are, plus anything open, such as the mixer or a selected object's bar. It frames the patch as your window does now, widened or narrowed to 16:9. As with a render, the patch plays from a fresh start, faster than real time and in the background. The sound comes from the same render as the picture, so the two stay in step. Everything is drawn [lit](shortcuts.md), at full brightness, because there's no cursor in the video.

Every video carries the GENER8 logo in its usual top-left spot. With a fade, the logo starts large in the middle of the dark screen, like a title card, and glides up into place as the patch fades in. At the end it comes back to the middle as the patch fades out.

### Shorts

Choose **short** (or type `short`) for a portrait video to post as a YouTube Short, an Instagram Reel or a TikTok: 1080 × 1920, a minute long unless you type a length, so `short` alone or `short 30s fade`. A short shows just the elements: sounds, fields, ripples and the generators' moving parts. It leaves out the palette, bar, minimap, panels, labels and the map fields underneath. It frames everything your window shows, fitted into the portrait frame, so zoom and pan to frame the patch first. The logo sits at the top centre.

In Chrome and Edge, you choose where to save the MP4 first, and it's written straight to disk as it renders. In other browsers it downloads when it's done. You also get a JSON file with the patch and seed. Expect roughly 3.5 GB for an hour at 1080p and 30 fps. The video is H.264 with AAC audio, falling back to other codecs where the browser can't encode those. The audio is compressed, so it isn't bit-identical to a WAV render. Use **audio · wav** when you want the exact audio.

## Saving, opening and new

These are in **patch ▾**, apart from the examples.

| | |
|---|---|
| **save…** (<kbd>⌘S</kbd>) | Keep the patch in this browser under a name. It suggests the name you last saved or opened it as, or its title. Saving under a name that's taken replaces that patch. |
| **open…** (<kbd>⌘O</kbd>) | The patches saved in this browser, newest first. Click one to open it; ✕ then **delete?** removes it. |
| **export** (<kbd>⇧⌘S</kbd>) | Download the patch as a JSON file, named after its title if it has one. |
| **import…** (<kbd>⇧⌘O</kbd>) | Load a patch file. You can also drop one on the canvas. |
| **info…** (<kbd>i</kbd>) | Edit the patch info (see below). |
| **new** | Start an empty stage (keeps the tempo, key and seed). |
| **random** (<kbd>r</kbd>) | A new patch from a random seed. |
| **new from a seed** | Type a seed, a number or any text, and press **make**. The same seed always makes the same patch. |
| **examples ▾** | The bundled demos, framed in the window as they load. |

Saved patches stay in this browser on this device: clearing the site's data removes them, and a private window forgets them when it closes. Export a patch to keep it anywhere else or move it to another device.

Your working patch is also saved in the browser as you go, separately from the saved ones, so a reload picks up where you left off. Replacing an edited patch with **random** asks you to press again to confirm.

## Patch info

**info…** (<kbd>i</kbd>) gives a patch a title, artist, genre, link and notes. Info is saved in the patch file and travels in share links. When you open a saved patch, a patch file, a link or one of the examples and it has info, a card shows it first.

Tick **remember my artist name and link** and they're kept in this browser. Every patch you save or export afterwards that has no artist yet is signed with them. A patch that already names an artist keeps it, so saving someone else's patch doesn't claim it as yours. Info isn't part of the sound: it never changes a render.

## Sharing

**share** copies a link with the whole patch inside it. Nothing is uploaded: the patch lives in the part of the link after `#`, which browsers never send to a server.

- An unedited random patch shares as a short **seed link**.
- Anything else shares as a **patch link** of about 1 to 2 thousand characters.

Opening a link loads the patch but never starts audio on its own. The patch you had before is kept in the browser. Links can hold up to 24 sounds, 12 fields and 8 map fields.

You can link to these docs too: add `#docs/maps` (or any page name) to the app's address.
