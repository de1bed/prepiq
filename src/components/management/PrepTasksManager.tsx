import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRecipesMap } from "@/hooks/useRecipesMap";
import { useEffect, useState } from "react";

interface PrepTaskRow {
  id: string;
  recipe_id: string;
  quantity_batches: number;
  notes: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function PrepTasksManager() {
  const { session } = useActiveSession();
  const { profile } = useAuth();
  const { recipesMap } = useRecipesMap();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<PrepTaskRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ recipeId: "", qty: 1, notes: "" });

  const load = async () => {
    if (!profile?.restaurant_id || !session?.id) { setTasks([]); return; }
    const { data, error } = await supabase
      .from("prep_tasks")
      .select("id, recipe_id, quantity_batches, notes, status, created_at, started_at, completed_at")
      .eq("restaurant_id", profile.restaurant_id)
      .eq("session_id", session.id)
      .order("created_at", { ascending: false });
    if (error) { console.error(error); return; }
    setTasks((data ?? []) as any);
  };

  useEffect(() => { load(); }, [profile?.restaurant_id, session?.id]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("prep_tasks_updated", h as EventListener);
    return () => window.removeEventListener("prep_tasks_updated", h as EventListener);
  }, []);

  const createTask = async () => {
    if (!profile?.restaurant_id || !session?.id || !form.recipeId) return;
    setLoading(true);
    const { error } = await supabase.from("prep_tasks").insert({
      restaurant_id: profile.restaurant_id,
      session_id: session.id,
      recipe_id: form.recipeId,
      quantity_batches: form.qty,
      notes: form.notes || null,
      status: 'pending',
      created_by: profile.id,
    } as any);
    setLoading(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setForm({ recipeId: "", qty: 1, notes: "" });
    toast({ title: "Tarea creada" });
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === 'in_progress') patch.started_at = new Date().toISOString();
    if (status === 'done') patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("prep_tasks").update(patch).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    // If done, also log into prep_logs for traceability
    if (status === 'done') {
      const t = tasks.find(t => t.id === id);
      if (t && profile?.restaurant_id && session?.id && profile?.id) {
        await supabase.from("prep_logs").insert({
          restaurant_id: profile.restaurant_id,
          session_id: session.id,
          recipe_id: t.recipe_id,
          employee_id: profile.id,
          batch_quantity: t.quantity_batches,
          container_info: t.notes ?? null,
        } as any);
      }
    }

    toast({ title: "Actualizado" });
    load();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("prep_tasks").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Eliminado" });
    load();
  };

  const recipeOptions = Array.from(recipesMap.values());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prep Lists - Sesión</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <Select value={form.recipeId} onValueChange={(v) => setForm({ ...form, recipeId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona receta" />
              </SelectTrigger>
              <SelectContent>
                {recipeOptions.map((r) => (
                  <SelectItem value={r.id} key={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input type="number" min={0.1} step={0.1} value={form.qty}
              onChange={(e) => setForm({ ...form, qty: parseFloat(e.target.value) || 1 })} placeholder="Batches" />
          </div>
          <div className="md:col-span-2">
            <Input placeholder="Notas/label info" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div>
          <Button onClick={createTask} disabled={loading || !form.recipeId}>Agregar a lista</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3">Receta</th>
                <th className="text-left p-3">Batches</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Creado</th>
                <th className="text-left p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/50">
                  <td className="p-3 font-medium">{recipesMap.get(t.recipe_id)?.name ?? t.recipe_id}</td>
                  <td className="p-3">{t.quantity_batches}×</td>
                  <td className="p-3">{t.status}</td>
                  <td className="p-3 text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="p-3 space-x-2">
                    {t.status === 'pending' && (
                      <Button size="sm" variant="secondary" onClick={() => updateStatus(t.id, 'in_progress')}>Iniciar</Button>
                    )}
                    {t.status !== 'done' && (
                      <Button size="sm" variant="default" onClick={() => updateStatus(t.id, 'done')}>Completar</Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => del(t.id)}>Eliminar</Button>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr><td className="p-3 text-muted-foreground" colSpan={5}>Sin tareas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
