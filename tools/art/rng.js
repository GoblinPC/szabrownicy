// Deterministyczny generator losowy (mulberry32).
// Dzięki niemu "losowe" plamy sadzy czy układ kamieni wypadają zawsze tak samo,
// więc regeneracja grafiki nie zmienia świata bez powodu.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** liczba całkowita z przedziału [0, n) */
    int: (n) => Math.floor(next() * n),
    /** liczba zmiennoprzecinkowa z przedziału [min, max) */
    range: (min, max) => min + next() * (max - min),
    /** liczba całkowita z przedziału [min, max] */
    between: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** true z prawdopodobieństwem p */
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** trwałe przetasowanie kopii tablicy */
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** Stabilny hash tekstu na ziarno — pozwala seedować z nazwy ("palenisko"). */
export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
