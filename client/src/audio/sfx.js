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

  /** Krótki ton z opadającą wysokością — trzon każdego uderzenia. */
  thump({ from, to, length, gain: peak, type = 'triangle', delay = 0 }) {
    const now = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + length);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);

    oscillator.connect(gain).connect(this.destination);
    oscillator.start(now);
    oscillator.stop(now + length + 0.02);
  }

  /**
   * Świst ostrza przecinającego powietrze.
   *
   * Szum przepuszczony przez pasmo, którego środek **wędruje w górę i z powrotem** —
   * to przesunięcie, a nie sam szum, daje wrażenie ruchu. Nieruchomy filtr brzmi
   * jak syk pary, nie jak zamach.
   */
  swing(power = 1) {
    const now = this.ctx.currentTime;
    const length = 0.19;

    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = 0.9 + Math.random() * 0.25;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    // Wysokość świstu rośnie do połowy zamachu i opada — ostrze przyspiesza,
    // mija ucho i oddala się.
    filter.frequency.setValueAtTime(700, now);
    filter.frequency.exponentialRampToValueAtTime(2600 * power, now + length * 0.45);
    filter.frequency.exponentialRampToValueAtTime(900, now + length);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3 * power, now + length * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);

    source.connect(filter).connect(gain).connect(this.destination);
    source.start(now, Math.random() * 1.5);
    source.stop(now + length + 0.02);
  }

  /**
   * Trafienie w cel z siana i drewna — trzy warstwy złożone w jedno zdarzenie.
   *
   * Pojedynczy dźwięk trafienia zawsze brzmi płasko. Ucho czyta uderzenie jako
   * **zdarzenie złożone**: najpierw twardy stuk (ostrze o słupek), pod nim głuchy
   * łomot (masa celu), a na wierzchu krótki chrzęst (rozrywane siano). Rozjechane
   * o kilka milisekund, bo idealnie równoczesne warstwy zlewają się w klik.
   */
  hit(power = 1) {
    // Stuk drewna — ostrze wchodzące w słupek.
    this.thump({ from: 420, to: 90, length: 0.13, gain: 0.34 * power });
    // Głuchy łomot pod spodem: to on daje ciężar.
    this.thump({ from: 150, to: 55, length: 0.22, gain: 0.30 * power, type: 'sine' });
    // Chrzęst siana — szeroki, krótki, lekko opóźniony.
    this.burst({ frequency: 2100, q: 0.7, length: 0.09, gain: 0.26 * power });
    this.burst({ frequency: 5200, q: 0.5, length: 0.045, gain: 0.14 * power });
  }

  /** Mokre prychnięcie — krew. Nisko i krótko, żeby nie zagłuszało stuku. */
  blood(power = 1) {
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = 0.5 + Math.random() * 0.2;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Opadające pasmo czyta się jako coś mokrego; stałe brzmiałoby jak szelest.
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.14);
    filter.Q.value = 3;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22 * power, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    source.connect(filter).connect(gain).connect(this.destination);
    source.start(now, Math.random() * 1.5);
    source.stop(now + 0.2);
  }

  /** Cios, który poszedł w powietrze — sam świst, bez trafienia. */
  /**
   * Naładowany ładunek uniku — krótki, jasny dzwonek w górę.
   *
   * Musi być **wyraźnie inny od ciosu**: cios idzie w dół (od wysokiego do
   * niskiego) i ma pod spodem łomot, więc ładunek idzie w górę i jest sam.
   * Dzięki temu ucho rozpoznaje go bez patrzenia na pasek, a o to chodzi —
   * unik odzyskuje się w trakcie walki, kiedy oczy są zajęte przeciwnikiem.
   */
  charge() {
    this.thump({ from: 620, to: 1180, length: 0.08, gain: 0.10, type: 'sine' });
    this.thump({ from: 930, to: 1560, length: 0.06, gain: 0.05, type: 'triangle', delay: 0.03 });
  }

  miss() {
    this.swing(0.85);
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
