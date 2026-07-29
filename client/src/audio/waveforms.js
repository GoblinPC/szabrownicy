// Instrumenty. Na Amidze były to krótkie próbki odtwarzane w kółko z różną
// prędkością — i dokładnie to tu robimy: jeden cykl fali o długości 64 próbek,
// zapętlony, a wysokość dźwięku wychodzi ze zmiany prędkości odtwarzania.
//
// Ta chropowatość jest zamierzona. Przy 64 próbkach na cykl powstaje aliasing,
// który daje charakterystyczny szklisty brud starych modułów. Gładka fala
// brzmiałaby czysto i nowocześnie, czyli nie tak, jak ma brzmieć.

const CYCLE = 64;

function cycleBuffer(ctx, shape) {
  const buffer = ctx.createBuffer(1, CYCLE, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < CYCLE; i++) data[i] = shape(i / CYCLE);
  return { buffer, loop: true, baseFrequency: ctx.sampleRate / CYCLE };
}

const pulse = (duty) => (t) => (t < duty ? 1 : -1);
const saw = (t) => 1 - 2 * t;
const triangle = (t) => (t < 0.5 ? 4 * t - 1 : 3 - 4 * t);

/** Fala piłokształtna zmiękczona o drugą harmoniczną — cieplejszy bas. */
const roundBass = (t) => 0.7 * (1 - 2 * t) + 0.3 * Math.sin(t * Math.PI * 2);

/**
 * Perkusja to próbki jednorazowe, nie zapętlone. Bęben to opadający ton,
 * werbel szum z krótkim ogonem, hi-hat sam trzask.
 */
function percussion(ctx, seconds, shape) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = shape(i / ctx.sampleRate, i / length);
  return { buffer, loop: false, baseFrequency: 440, fixedPitch: true };
}

/** Kilka sekund szumu do zapętlenia — podstawa ognia, wiatru i kroków. */
export function makeNoiseBuffer(ctx, seconds = 3) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function buildInstruments(ctx) {
  const noise = () => Math.random() * 2 - 1;

  return {
    lead: cycleBuffer(ctx, pulse(0.125)),   // cienki, przebijający się przez miks
    harmony: cycleBuffer(ctx, pulse(0.25)),
    bass: cycleBuffer(ctx, roundBass),
    pad: cycleBuffer(ctx, triangle),
    reed: cycleBuffer(ctx, saw),

    kick: percussion(ctx, 0.26, (t, p) => {
      const frequency = 48 + 110 * Math.exp(-t * 34);
      return Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 13) * (1 - p * 0.2);
    }),
    snare: percussion(ctx, 0.20, (t) => {
      const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 28) * 0.5;
      return (noise() * Math.exp(-t * 22) * 0.8 + body);
    }),
    hat: percussion(ctx, 0.06, (t) => noise() * Math.exp(-t * 90) * 0.55),
  };
}
