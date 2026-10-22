export function SetupMissing() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="max-w-xl rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-2 text-xl font-bold">Falta conectar Supabase</h1>
        <p className="mb-4 text-sm text-slate-600">
          Crea un archivo <code className="rounded bg-slate-100 px-1">.env.local</code> en la raíz del proyecto con la URL y la
          clave pública (anon) de tu proyecto de Supabase, y vuelve a iniciar <code>npm run dev</code>.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100">{`VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key`}</pre>
        <p className="mt-4 text-sm text-slate-600">Guía completa: <code>docs/04-arquitectura-y-despliegue.md</code>.</p>
      </div>
    </div>
  );
}
