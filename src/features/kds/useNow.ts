import { useEffect, useState } from 'react';

/** Reloj compartido para cronómetros (re-render cada `ms`). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

let ctx: AudioContext | null = null;
/** Aviso sonoro corto para tickets nuevos (requiere interacción previa del usuario). */
export function beep(freq = 880, durationMs = 180) {
  try {
    ctx = ctx ?? new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + durationMs / 1000);
  } catch { /* sin audio */ }
}
