// Efekty jednorazowe.
//
// Każdy jest krótkim szumem przepuszczonym przez rezonansowy filtr — to, co
// odróżnia krok po kamieniu od kroku po ziemi, siedzi w częstotliwości filtra
// i długości wybrzmienia, a nie w innej próbce. Kamień jest wysoki i krótki,
// ziemia niska i głucha, trawa najcichsza i najbardziej rozmyta.

import { makeNoiseBuffer } from './waveforms.js';

const SURFACES = {
  stone: { frequency: 1500, q: 2.2, length: 0.055, gain: 0.34 },
  wood:  { frequency: 780,  q: 3.4, length: 0.075, gain: 0.32 },
  dirt:  { frequency: 420,  q: 1.4, length: 0.085, gain: 0.30 },
  grass: { frequency: 2600, q: 0.8, length: 0.10,  gain: 0.17 },
};

export class Sfx {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.noise = makeNoiseBuffer(ctx, 2);
  }

  burst({ frequency, q, length, gain: peak, type = 'bandpass', rate = 1 }) {
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = rate;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);

    source.connect(filter).connect(gain).connect(this.destination);
    source.start(now, Math.random() * 1.5);
    source.stop(now + length + 0.02);
  }

  step(surface) {
    const preset = SURFACES[surface] ?? SURFACES.dirt;
    // Lekkie rozstrojenie co krok — dwa identyczne kroki z rzędu brzmią sztucznie.
    this.burst({
      ...preset,
      frequency: preset.frequency * (0.85 + Math.random() * 0.3),
      gain: preset.gain * (0.8 + Math.random() * 0.4),
      rate: 0.9 + Math.random() * 0.3,
    });
  }

  /** Uderzenie młota o kowadło — na potem, gdy dojdzie interakcja z kowadłem. */
  hammer() {
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1650, now);
    oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    oscillator.connect(gain).connect(this.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.95);

    this.burst({ frequency: 3200, q: 1.2, length: 0.05, gain: 0.18 });
  }
}
