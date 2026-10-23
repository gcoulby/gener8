// Web MIDI on the main thread. Incoming notes go to the engine as logged
// edits (so captures replay them); CC moves the value handle of every cc map
// listening to that controller; sounds with MIDI out on their mixer strip send
// their notes to the chosen output, timed to when the audio is heard.
// Web MIDI isn't in Safari or on iOS: everything here degrades to "unavailable".

import type { App } from './app.ts';
import type { EventRecord, FieldObj, SoundObj } from '../core/types.ts';
import { SR } from '../core/constants.ts';
import { ccNumber } from '../core/fields/maps.ts';

export type MidiStatus = 'off' | 'asking' | 'on' | 'unsupported' | 'denied';

const OUT_KEY = 'gener8.midiOut';
const LAT_KEY = 'gener8.midiLatency';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable */
  }
}

export class MidiLink {
  status: MidiStatus = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'off' : 'unsupported';
  /** cc map waiting to learn its controller from the next CC that arrives. */
  learn: string | null = null;
  /** Chosen output's id (kept per browser, not in the patch). */
  outId = stored(OUT_KEY) ?? '';
  /** Added to every outgoing note's time, to line hardware up with the speakers. */
  latencyMs = Number(stored(LAT_KEY) ?? 0) || 0;
  private access: MIDIAccess | null = null;
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** Ask for MIDI access (once). Call from a click or key press: browsers may prompt. */
  enable(): void {
    if (this.status !== 'off' && this.status !== 'denied') return;
    this.status = 'asking';
    navigator
      .requestMIDIAccess()
      .then((access) => {
        this.access = access;
        this.status = 'on';
        const hook = () => {
          for (const input of access.inputs.values()) input.onmidimessage = (e) => e.data && this.onMessage(e.data);
          if (!this.outId || !access.outputs.has(this.outId)) this.outId = access.outputs.keys().next().value ?? '';
        };
        hook();
        access.onstatechange = hook;
      })
      .catch(() => {
        this.status = 'denied';
      });
  }

  get inputCount(): number {
    return this.access ? this.access.inputs.size : 0;
  }

  outputs(): MIDIOutput[] {
    return this.access ? [...this.access.outputs.values()] : [];
  }

  output(): MIDIOutput | null {
    return this.access?.outputs.get(this.outId) ?? null;
  }

  /** Step to the next (or previous) output. */
  cycleOutput(dir = 1): void {
    const outs = this.outputs();
    if (!outs.length) return;
    const i = outs.findIndex((o) => o.id === this.outId);
    this.outId = outs[(i + dir + outs.length) % outs.length].id;
    store(OUT_KEY, this.outId);
  }

  nudgeLatency(ms: number): void {
    this.latencyMs = Math.max(-200, Math.min(500, this.latencyMs + ms));
    store(LAT_KEY, String(this.latencyMs));
  }

  /** A short status for the motion bar and mixer. */
  label(): string {
    switch (this.status) {
      case 'unsupported':
        return 'MIDI isn’t available in this browser';
      case 'denied':
        return 'MIDI blocked · click to try again';
      case 'asking':
        return 'asking for MIDI…';
      case 'off':
        return 'click to connect MIDI';
    }
    const n = this.inputCount;
    return n ? `MIDI · ${n} input${n === 1 ? '' : 's'}` : 'MIDI · no inputs found';
  }

  private onMessage(d: Uint8Array): void {
    const app = this.app;
    const kind = d[0] & 0xf0;
    if ((kind === 0x90 || kind === 0x80) && d.length >= 3) {
      if (app.patch.objects.some((o) => o.kind === 'field' && o.type === 'midi')) app.audio.send({ op: 'midi', data: [d[0], d[1], d[2]] });
    } else if (kind === 0xb0 && d.length >= 3) {
      const learner = this.learn && (app.obj(this.learn) as FieldObj | undefined);
      if (learner) {
        app.commit({ op: 'set', id: learner.id, path: ['handles', 'cc'], value: d[1] / 127 });
        this.learn = null;
        app.toast(`${learner.id} listens to CC ${d[1]}`);
      }
      for (const o of app.patch.objects) {
        if (o.kind !== 'field' || o.type !== 'cc' || ccNumber(o.handles) !== d[1]) continue;
        app.commitCoalesced(`cc:${o.id}`, { op: 'set', id: o.id, path: ['handles', 'value'], value: d[2] / 127 });
      }
    }
  }

  /** Send the notes of sounds with MIDI out on, at the moment their audio is heard. */
  sendNotes(events: EventRecord[]): void {
    const out = this.output();
    if (!out) return;
    const app = this.app;
    const solo = app.anySolo();
    for (const e of events) {
      const s = app.obj(e.soundId) as SoundObj | undefined;
      const mo = s?.midiOut;
      if (!s || !mo || s.mute || (solo && !s.solo)) continue;
      const ch = (Math.max(1, Math.min(16, mo.channel)) - 1) & 0x0f;
      const note = Math.max(0, Math.min(127, Math.round(e.pitch)));
      const vel = Math.max(1, Math.min(127, Math.round(e.velocity * 127)));
      const at = app.audio.perfTimeOf(e.sample) + this.latencyMs;
      out.send([0x90 | ch, note, vel], at);
      out.send([0x80 | ch, note, 0], at + (e.dur / SR) * 1000);
    }
  }
}
