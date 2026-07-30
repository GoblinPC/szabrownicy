// Tło dźwiękowe: ogień, wiatr i pojedyncze odgłosy otoczenia.
//
// Trzy warstwy, każda z innego powodu:
//
// 1. Ogień — ciągły pomruk plus trzaski strzelające w losowych odstępach.
//    Jedna zapętlona próbka nie wystarcza, bo ucho po kilku sekundach wyłapuje
//    powtórzenie; losowe trzaski sprawiają, że ogień nigdy nie brzmi tak samo.
//
// 2. Wiatr — dwie warstwy zamiast jednej. Niska daje ciągły szum, wysoka wchodzi
//    tylko w podmuchach i to ona odpowiada za zawodzenie. Pojedyncze pasmo szumu
//    brzmi jak szum, dopiero druga warstwa brzmi jak wiatr.
//
// 3. Zdarzenia — rzadkie, pojedyncze dźwięki zależne od miejsca: stygnące żelazo
//    i skrzypienie belek w hali, podmuchy i grzechot łańcucha studni na placu.
//    To one najmocniej budują wrażenie, że miejsce żyje, właśnie dlatego, że
//    zdarzają się rzadko i nie da się ich przewidzieć.

import { makeNoiseBuffer } from './waveforms.js';

export class Ambience {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.noise = makeNoiseBuffer(ctx, 4);

    this.fireLevel = 0;
    this.windLevel = 0;
    this.rainLevel = 0;
    this.zone = 'yard';
    this.nextCrackle = ctx.currentTime;
    this.nextGust = ctx.currentTime + 4;
    this.nextEvent = ctx.currentTime + 3;

    this.fire = this.buildLoop({ type: 'lowpass', frequency: 420, q: 1 });
    this.windLow = this.buildLoop({ type: 'bandpass', frequency: 480, q: 0.9 });
    this.windHigh = this.buildLoop({ type: 'bandpass', frequency: 1100, q: 4.5 });

    // Deszcz też dwiema warstwami i z tego samego powodu co wiatr. Syk wysokich
    // to krople o coś uderzające i on sam brzmi jak szum radia; dopiero warstwa
    // niska daje wrażenie ściany wody. Mżawka to prawie sam syk, ulewa dokłada dół.
    this.rainHiss = this.buildLoop({ type: 'highpass', frequency: 1700, q: 0.7 });
    this.rainBody = this.buildLoop({ type: 'bandpass', frequency: 640, q: 0.7 });

    this.crackleBus = ctx.createGain();
    this.crackleBus.gain.value = 0;
    this.crackleBus.connect(destination);

    this.timer = setInterval(() => this.tick(), 80);
  }

  buildLoop({ type, frequency, q }) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter).connect(gain).connect(this.destination);
    source.start();
    return { gain, filter };
  }

  setFire(level) {
    this.fireLevel = Math.max(0, Math.min(1, level));
  }

  setWind(level) {
    this.windLevel = Math.max(0, Math.min(1, level));
  }

  setRain(level) {
    this.rainLevel = Math.max(0, Math.min(1, level));
  }

  setZone(zone) {
    this.zone = zone;
  }

  tick() {
    const now = this.ctx.currentTime;

    // Poziomy dobrane tak, by szum przebijał się obok muzyki. Szum przy tej samej
    // głośności szczytowej co ton słychać wyraźnie ciszej, bo jego energia rozkłada
    // się na całe pasmo zamiast skupiać w jednej częstotliwości.
    this.fire.gain.gain.setTargetAtTime(this.fireLevel * 0.75, now, 0.25);
    this.crackleBus.gain.gain.setTargetAtTime(this.fireLevel * 1.9, now, 0.25);

    // Dwie niewspółmierne sinusoidy — oddech wiatru nie łapie słyszalnego rytmu.
    const breath = 0.55 + 0.3 * Math.sin(now * 0.19) + 0.15 * Math.sin(now * 0.071);
    this.windLow.gain.gain.setTargetAtTime(this.windLevel * 0.34 * breath, now, 0.6);
    this.windLow.filter.frequency.setTargetAtTime(400 + 240 * breath, now, 0.9);
    this.windHigh.gain.gain.setTargetAtTime(this.windLevel * 0.075 * Math.max(0, breath - 0.5), now, 0.7);

    // Deszcz dochodzi i cichnie wolno (stała czasowa 1,5 s), bo ulewa nie zaczyna
    // się w jednej chwili. Dół rośnie z kwadratem siły — mżawka ma sam syk.
    this.rainHiss.gain.gain.setTargetAtTime(this.rainLevel * 0.5, now, 1.5);
    this.rainBody.gain.gain.setTargetAtTime(this.rainLevel ** 2 * 0.34, now, 1.5);

    this.scheduleCrackles(now);
    this.scheduleGusts(now);
    this.scheduleEvents(now);
  }

  // --- Ogień --------------------------------------------------------------

  scheduleCrackles(now) {
    if (this.fireLevel < 0.03) {
      this.nextCrackle = now;
      return;
    }
    while (this.nextCrackle < now + 0.4) {
      this.crackle(this.nextCrackle);
      this.nextCrackle += 0.02 + (Math.random() * 0.26) / Math.max(0.2, this.fireLevel);
    }
  }

  crackle(time) {
    this.noiseBurst({
      time,
      destination: this.crackleBus,
      frequency: 900 + Math.random() * 2600,
      q: 3 + Math.random() * 5,
      peak: 0.12 + Math.random() * 0.3,
      length: 0.014 + Math.random() * 0.05,
      rate: 0.8 + Math.random() * 0.7,
    });
  }

  // --- Wiatr --------------------------------------------------------------

  scheduleGusts(now) {
    if (this.windLevel < 0.4) {
      this.nextGust = now + 3;
      return;
    }
    if (this.nextGust > now) return;
    this.gust(now);
    this.nextGust = now + 5 + Math.random() * 9;
  }

  /** Podmuch: szum, którego barwa i głośność narastają i opadają przez kilka sekund. */
  gust(time) {
    const length = 2 + Math.random() * 2.5;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.5 + Math.random() * 3;
    filter.frequency.setValueAtTime(320, time);
    filter.frequency.linearRampToValueAtTime(700 + Math.random() * 600, time + length * 0.45);
    filter.frequency.linearRampToValueAtTime(300, time + length);

    const gain = this.ctx.createGain();
    const peak = 0.13 * this.windLevel;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + length * 0.45);
    gain.gain.linearRampToValueAtTime(0, time + length);

    source.connect(filter).connect(gain).connect(this.destination);
    source.start(time, Math.random() * 2);
    source.stop(time + length + 0.05);
  }

  // --- Pojedyncze odgłosy -------------------------------------------------

  scheduleEvents(now) {
    if (this.nextEvent > now) return;
    const inside = this.zone === 'forge';
    const choices = inside
      ? [() => this.tink(), () => this.tink(), () => this.creak(), () => this.drip(), () => this.distantClang()]
      : [() => this.creak(), () => this.chain(), () => this.drip()];
    choices[Math.floor(Math.random() * choices.length)]();
    this.nextEvent = now + 7 + Math.random() * 14;
  }

  /** Stygnące żelazo — wysoki, krótki dzwon z drugą, rozstrojoną składową. */
  tink() {
    const now = this.ctx.currentTime;
    const base = 1900 + Math.random() * 1500;
    for (const [ratio, level, decay] of [[1, 0.13, 0.6], [2.76, 0.055, 0.38]]) {
      const oscillator = this.ctx.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = base * ratio;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(level, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      oscillator.connect(gain).connect(this.destination);
      oscillator.start(now);
      oscillator.stop(now + decay + 0.02);
    }
  }

  /** Kropla — sinus, którego wysokość szybko idzie w górę. Stąd charakterystyczne „plink". */
  drip() {
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(560 + Math.random() * 260, now);
    oscillator.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 700, now + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain).connect(this.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }

  /** Skrzypienie belki — niska piła z pełzającą wysokością. */
  creak() {
    const now = this.ctx.currentTime;
    const length = 0.5 + Math.random() * 0.7;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = 'sawtooth';
    const base = 92 + Math.random() * 60;
    oscillator.frequency.setValueAtTime(base, now);
    oscillator.frequency.linearRampToValueAtTime(base * 1.4, now + length * 0.6);
    oscillator.frequency.linearRampToValueAtTime(base * 1.1, now + length);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700;
    filter.Q.value = 6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.09, now + length * 0.3);
    gain.gain.linearRampToValueAtTime(0, now + length);

    oscillator.connect(filter).connect(gain).connect(this.destination);
    oscillator.start(now);
    oscillator.stop(now + length + 0.05);
  }

  /** Ktoś w głębi hali kuje — przygaszone, żeby brzmiało jak zza ściany. */
  distantClang() {
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(1200, now);
    oscillator.frequency.exponentialRampToValueAtTime(620, now + 0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    oscillator.connect(filter).connect(gain).connect(this.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.85);
  }

  /** Łańcuch przy studni — kilka metalicznych stuknięć nierówno rozłożonych. */
  chain() {
    const now = this.ctx.currentTime;
    const count = 3 + Math.floor(Math.random() * 4);
    let time = now;
    for (let i = 0; i < count; i++) {
      this.noiseBurst({
        time,
        destination: this.destination,
        frequency: 2400 + Math.random() * 1800,
        q: 8,
        peak: 0.07 + Math.random() * 0.05,
        length: 0.05,
        rate: 1,
      });
      time += 0.06 + Math.random() * 0.13;
    }
  }

  noiseBurst({ time, destination, frequency, q, peak, length, rate }) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = rate;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);

    source.connect(filter).connect(gain).connect(destination);
    source.start(time, Math.random() * 3);
    source.stop(time + length + 0.02);
  }
}
