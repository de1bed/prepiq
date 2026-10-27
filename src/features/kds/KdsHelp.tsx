import { useState } from 'react';
import { cx } from '@/components/ui';

// Capturas de la pantalla real con recuadros rojos (se regeneran con
// dev/ayuda-kds.mjs cuando cambia el diseño).
const STEPS: { img: string; title: string; text: string[] }[] = [
  {
    img: '/ayuda/kds-1-lista.png',
    title: '1. Los tickets llegan en lista',
    text: [
      'Cada renglón es UN platillo. Los azules están cerrados: todavía no se ve qué es.',
      'Los nuevos se agregan hasta abajo. Si la mesa pide 3 arracheras, llegan 3 renglones.',
    ],
  },
  {
    img: '/ayuda/kds-2-abrir.png',
    title: '2. Selecciona y toca "Abrir"',
    text: [
      'Toca un renglón azul para seleccionarlo (queda con borde blanco) y luego "Abrir".',
      'Abrir = empezar a prepararlo. Ahí ya ves la mesa, el platillo, sus modificadores (MAÍZ, SIN CEBOLLA…) y notas.',
      '"Orden 675 · platillo 2 de 3" quiere decir: la orden 675 trae 3 platillos para esta estación y este es el segundo.',
      'El reloj corre desde que llegó a la cocina: verde = a tiempo, amarillo = atención, rojo = tarde.',
    ],
  },
  {
    img: '/ayuda/kds-3-listo.png',
    title: '3. Receta, "…" y Listo',
    text: [
      'Receta: abre la receta de ese platillo.',
      '"…": reportar que falta algo o pedir prioridad (la prioridad la autoriza un gerente).',
      'Listo: el platillo salió. Desaparece de la lista y queda en el Historial.',
    ],
  },
  {
    img: '/ayuda/kds-4-resumen.png',
    title: '4. Resumen',
    text: ['Junta los platillos iguales de todos los tickets: "3 Arrachera MAÍZ, 2 Hamburguesa término medio". Sirve para adelantar.'],
  },
  {
    img: '/ayuda/kds-5-flechas.png',
    title: '5. Flechas para moverte',
    text: ['Con ▲ y ▼ subes y bajas por la lista (también puedes deslizar con el dedo). Lo de arriba y los botones no se mueven.'],
  },
  {
    img: '/ayuda/kds-6-historial.png',
    title: '6. Historial y Reabrir',
    text: [
      'Historial muestra todo lo que se marcó Listo en las últimas horas.',
      'Si marcaste Listo por error: Historial → Reabrir → botón amarillo "Reabrir". Regresa a la lista y el reloj sigue donde se quedó.',
    ],
  },
  {
    img: '/ayuda/kds-7-arriba.png',
    title: '7. Las otras estaciones y tu equipo',
    text: [
      'Arriba ves cada estación con dos números: tickets en cola (izquierda) y urgentes (derecha, en rojo).',
      'El botón con personas muestra quién está en tu estación según el horario. Si alguien no llegó, el responsable de turno lo corrige ahí.',
      'Nadie pone PIN en la cocina.',
    ],
  },
];

/** Pestaña "Ayuda": mini tutorial con capturas y recuadros rojos. */
export function KdsHelp() {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <div className="flex min-h-0 flex-1" data-testid="kds-help">
      <nav className="w-72 shrink-0 overflow-y-auto border-r border-kds-line p-2">
        {STEPS.map((x, k) => (
          <button key={x.img} onClick={() => setI(k)}
            className={cx('mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold', k === i ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-white/5')}>
            {x.title}
          </button>
        ))}
      </nav>
      <section className="min-h-0 flex-1 overflow-y-auto p-5">
        <h2 className="mb-2 text-2xl font-black">{s.title}</h2>
        <ul className="mb-4 space-y-1 text-lg text-slate-200">
          {s.text.map((t, k) => <li key={k}>{t}</li>)}
        </ul>
        <img src={s.img} alt={s.title} className="w-full max-w-5xl rounded-xl border border-kds-line" loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <div className="mt-4 flex gap-2">
          <button disabled={i === 0} onClick={() => setI(i - 1)} className="h-12 rounded-lg bg-slate-800 px-5 font-bold disabled:opacity-40">Anterior</button>
          <button disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)} className="h-12 rounded-lg bg-brand-600 px-5 font-bold disabled:opacity-40">Siguiente</button>
        </div>
      </section>
    </div>
  );
}
