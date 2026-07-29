// Odtwarzacz modułów w stylu amigowym.
//
// Utwór to wzorce (patterns) złożone z wierszy. Co wiersz każdy z czterech
// kanałów może zagrać nutę. Tempo liczy się tak jak w oryginalnych trackerach:
// jeden „tik" trwa 2.5/BPM sekundy, a wiersz tyle tików, ile wynosi `speed`.
// Przy 125 BPM i szybkości 6 daje to 0.12 s na wiersz, czyli szesnastkę.
//
// Nuty planujemy z wyprzedzeniem na zegarze karty dźwiękowej, a nie na zegarze
// przeglądarki. Timery JavaScriptu potrafią zgubić kilkanaście milisekund, co
// przy szesnastkach słychać natychmiast jako chwiejący się rytm.

const SEMITONES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

const TOKEN = /^(r|[A-G]#?-?\d)(?:!(\w+))?(?:\^([\d,]+))?(?:@([\d.]+))?(?::(\d+))?$/;

export function noteToMidi(name) {
  const match = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`Nieznana nuta: ${name}`);
  return (Number(match[2]) + 1) * 12 + SEMITONES[match[1]];
}

export const midiToFrequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Rozwija zapis ścieżki na tablicę wierszy.
 *
 * Składnia pojedynczego tokenu: NUTA[!instrument][^arpeggio][@głośność][:długość]
 *   'A4:4'          — A w czwartej oktawie przez cztery wiersze
 *   'r:2'           — dwa wiersze ciszy
 *   'A3^0,3,7:8'    — akord rozłożony (molowy) trzymany przez osiem wierszy
 *   'C4!kick:2'     — nuta zagrana innym instrumentem niż domyślny dla kanału
 */
export function track(spec, rows) {
  const out = new Array(rows).fill(null);
  let cursor = 0;

  for (const token of spec.trim().split(/\s+/)) {
    const match = TOKEN.exec(token);
    if (!match) throw new Error(`Nieczytelny zapis nuty: ${token}`);
    const [, note, instrument, arpeggio, volume, length] = match;
    const rowCount = Number(length ?? 1);

    if (note !== 'r') {
      out[cursor] = {
        midi: noteToMidi(note),
        instrument,
        rows: rowCount,
        volume: volume === undefined ? undefined : Number(volume),
        arpeggio: arpeggio ? arpeggio.split(',').map(Number) : null,
      };
    }
    cursor += rowCount;
  }

  if (cursor !== rows) throw new Error(`Ścieżka ma ${cursor} wierszy zamiast ${rows}`);
  return out;
}

export class Tracker {
  constructor(ctx, destination, instruments) {
    this.ctx = ctx;
    this.instruments = instruments;
    this.output = ctx.createGain();
    this.output.connect(destination);
    this.channelGains = [];
    this.timer = null;
    this.song = null;
  }

  get tickDuration() {
    return 2.5 / this.song.bpm;
  }

  get rowDuration() {
    return this.tickDuration * this.song.speed;
  }

  play(song) {
    this.stop();
    this.song = song;
    this.orderIndex = 0;
    this.row = 0;
    this.nextRowTime = this.ctx.currentTime + 0.12;

    this.channelGains = song.patterns[0].channels.map(() => {
      const gain = this.ctx.createGain();
      gain.connect(this.output);
      return gain;
    });

    // Wyprzedzenie 0.2 s przy odpytywaniu co 25 ms daje spory zapas nawet wtedy,
    // gdy przeglądarka zatnie się na klatce renderowania.
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setVolume(value, when = 0.05) {
    this.output.gain.setTargetAtTime(value, this.ctx.currentTime, when);
  }

  schedule() {
    if (!this.song) return;
    const horizon = this.ctx.currentTime + 0.2;
    while (this.nextRowTime < horizon) {
      this.playRow(this.nextRowTime);
      this.nextRowTime += this.rowDuration;
      this.advance();
    }
  }

  advance() {
    this.row += 1;
    if (this.row < this.song.rows) return;
    this.row = 0;
    this.orderIndex = (this.orderIndex + 1) % this.song.order.length;
  }

  playRow(time) {
    const pattern = this.song.patterns[this.song.order[this.orderIndex]];
    pattern.channels.forEach((channel, index) => {
      const note = channel.notes[this.row];
      if (note) this.trigger(note, channel, this.channelGains[index], time);
    });
  }

  trigger(note, channel, destination, time) {
    const instrument = this.instruments[note.instrument ?? channel.instrument];
    if (!instrument) return;

    const source = this.ctx.createBufferSource();
    source.buffer = instrument.buffer;
    source.loop = instrument.loop;

    const rateFor = (midi) => (instrument.fixedPitch ? 1 : midiToFrequency(midi) / instrument.baseFrequency);
    source.playbackRate.value = rateFor(note.midi);

    const duration = instrument.loop
      ? this.rowDuration * note.rows
      : instrument.buffer.duration;

    const ticks = Math.round(duration / this.tickDuration);

    // Akord rozłożony: przeskakiwanie między stopniami co tik. To była sztuczka
    // na obejście czterech kanałów i dziś jest znakiem rozpoznawczym tego brzmienia.
    if (note.arpeggio && !instrument.fixedPitch) {
      for (let tick = 0; tick < ticks; tick++) {
        const offset = note.arpeggio[tick % note.arpeggio.length];
        source.playbackRate.setValueAtTime(rateFor(note.midi + offset), time + tick * this.tickDuration);
      }
    } else if (channel.vibrato && !instrument.fixedPitch) {
      // Bez tego długa nuta brzmi jak wciśnięty i przytrzymany klawisz. Wibracja
      // narasta dopiero po chwili, tak jak u instrumentalisty — natychmiastowa
      // brzmi mechanicznie.
      const { depth, rate, delay = 0.22 } = channel.vibrato;
      for (let tick = 0; tick < ticks; tick++) {
        const elapsed = tick * this.tickDuration;
        const swell = Math.min(1, Math.max(0, elapsed - delay) / 0.3);
        const offset = Math.sin(elapsed * Math.PI * 2 * rate) * depth * swell;
        source.playbackRate.setValueAtTime(rateFor(note.midi + offset), time + elapsed);
      }
    }

    const gain = this.ctx.createGain();
    const volume = note.volume ?? channel.volume ?? 0.4;
    // Powolne narastanie zamienia impulsowy pisk w oddychający dźwięk — stąd
    // osobne ustawienia dla każdego kanału zamiast jednego twardego ataku.
    const attack = Math.min(channel.attack ?? 0.004, duration * 0.5);
    const release = Math.min(channel.release ?? 0.05, duration * 0.45);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + attack);
    gain.gain.setValueAtTime(volume, time + Math.max(attack, duration - release));
    gain.gain.linearRampToValueAtTime(0, time + duration);

    source.connect(gain);
    gain.connect(destination);
    source.start(time);
    source.stop(time + duration + 0.02);
  }
}
