// Zarządzanie dźwiękiem.
//
// Przeglądarki nie pozwalają odezwać się stronie, dopóki użytkownik czegoś nie
// kliknie albo nie naciśnie — dlatego cały układ dźwiękowy powstaje dopiero przy
// pierwszym geście, a nie przy starcie gry.
//
// Trzy osobne szyny: muzyka, otoczenie (ogień, wiatr) i efekty (kroki). Każda ma
// własny suwak, bo proporcji między nimi nie da się ustawić raz na zawsze —
// zależą od sprzętu, na którym się gra.

import { buildInstruments } from './waveforms.js';
import { Tracker } from './tracker.js';
import { FORGE_AMBIENT } from './songs.js';
import { Ambience } from './ambience.js';
import { Sfx } from './sfx.js';

// Górny pułap każdej szyny. Suwak przesuwa się w zakresie 0-1 i jest przez ten
// pułap mnożony. Zakresy dobrane tak, żeby ustawienia domyślne wypadały mniej
// więcej w połowie drogi każdego suwaka — zostaje zapas w obie strony.
const CEILING = { master: 1.0, music: 0.35, ambience: 1.0, sfx: 3.0 };

// Miks wystrojony ze słuchu: cicha muzyka, otoczenie w tle, wyraźne kroki.
const DEFAULTS = { master: 0.75, music: 0.34, ambience: 0.44, sfx: 0.67 };

// Numer wersji ustawień. Zmiana pułapów sprawia, że te same pozycje suwaków
// znaczą co innego niż wcześniej, więc stare zapisy trzeba porzucić — inaczej
// gracz, który raz coś ustawił, dostałby po aktualizacji zupełnie inny miks.
const SETTINGS_VERSION = '2';

const readStored = (name, fallback) => {
  if (localStorage.getItem('szab_vol_v') !== SETTINGS_VERSION) return fallback;
  const raw = Number(localStorage.getItem(`szab_vol_${name}`));
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : fallback;
};

class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = localStorage.getItem('szab_mute') === '1';
    this.musicOn = localStorage.getItem('szab_music') !== '0';
    this.volumes = Object.fromEntries(
      Object.entries(DEFAULTS).map(([name, value]) => [name, readStored(name, value)])
    );
    this.listeners = new Set();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const callback of this.listeners) callback(this);
  }

  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }

    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    this.ctx = new Context();

    this.master = this.ctx.createGain();

    // Zabezpieczenie przed przesterowaniem. Kroki mają teraz wysoki pułap, więc
    // kilka dźwięków naraz mogłoby przekroczyć zakres wyjścia i zatrzeszczeć.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.15;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Filtr ścinający wysokie tony obsługuje WYŁĄCZNIE muzykę. Fale o 64 próbkach
    // na cykl mają sporo aliasingu i bez tego kłują w uszy — ale gdy wisiał na
    // sumie wszystkiego, dusił przy okazji trzaski ognia, dzwonki stygnącego
    // żelaza i krople, czyli dźwięki, które żyją właśnie w górze pasma.
    this.tone = this.ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 9000;
    this.tone.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.tone);

    // Otoczenie i efekty idą prosto na sumę, z pełnym pasmem.
    this.ambienceBus = this.ctx.createGain();
    this.ambienceBus.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);

    this.applyVolumes(0);

    this.instruments = buildInstruments(this.ctx);
    this.music = new Tracker(this.ctx, this.musicBus, this.instruments);
    this.music.play(FORGE_AMBIENT);

    this.ambience = new Ambience(this.ctx, this.ambienceBus);
    this.sfx = new Sfx(this.ctx, this.sfxBus);

    this.ready = true;
    this.notify();
  }

  applyVolumes(smoothing = 0.06) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const set = (node, value) => {
      if (smoothing > 0) node.gain.setTargetAtTime(value, now, smoothing);
      else node.gain.value = value;
    };
    set(this.master, this.muted ? 0 : this.volumes.master * CEILING.master);
    set(this.musicBus, this.musicOn ? this.volumes.music * CEILING.music : 0);
    set(this.ambienceBus, this.volumes.ambience * CEILING.ambience);
    set(this.sfxBus, this.volumes.sfx * CEILING.sfx);
  }

  setVolume(name, value) {
    if (!(name in this.volumes)) return;
    this.volumes[name] = Math.max(0, Math.min(1, value));
    localStorage.setItem('szab_vol_v', SETTINGS_VERSION);
    localStorage.setItem(`szab_vol_${name}`, String(this.volumes[name]));
    this.applyVolumes();
    this.notify();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('szab_mute', this.muted ? '1' : '0');
    this.applyVolumes();
    this.notify();
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    localStorage.setItem('szab_music', this.musicOn ? '1' : '0');
    this.applyVolumes(0.3);
    this.notify();
  }

  setFire(level) {
    this.ambience?.setFire(level);
  }

  setWind(level) {
    this.ambience?.setWind(level);
  }

  setZone(zone) {
    this.ambience?.setZone(zone);
  }

  step(surface) {
    this.sfx?.step(surface);
  }
}

export const audio = new GameAudio();

/** Podpina odblokowanie dźwięku pod pierwszy dowolny gest użytkownika. */
export function armAudioUnlock() {
  const unlock = () => audio.unlock();
  for (const event of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(event, unlock, { passive: true });
  }
}
