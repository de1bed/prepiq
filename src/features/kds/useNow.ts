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

/** Mantiene la pantalla encendida (KDS, pase, reloj) mientras la página está visible. */
export function useWakeLock() {
  useEffect(() => {
    type WakeLockSentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } };
    if (!nav.wakeLock) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
