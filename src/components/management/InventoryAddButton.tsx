import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRecipeIngredientNames } from "@/hooks/useRecipeIngredientNames";

interface Props {
  onAdded?: () => void;
  existingNames?: string[];
}

export function InventoryAddButton({ onAdded, existingNames = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string>("");
  const [unit, setUnit] = useState<string>("lb");
  const [qty, setQty] = useState<number>(0);
  const [min, setMin] = useState<number | null>(null);
  const [urgent, setUrgent] = useState<number | null>(null);
  const [excess, setExcess] = useState<number | null>(null);
  const { toast } = useToast();
  const { profile } = useAuth();

  const ingredientQuery = useRecipeIngredientNames();
  const allowedNames = useMemo(() => {
    const all = ingredientQuery.data ?? [];
    const existing = new Set(existingNames.map((n) => n.toLowerCase()));
    return all.filter((n) => !existing.has(n.toLowerCase()));
  }, [ingredientQuery.data, existingNames]);

  const save = async () => {
    if (!profile?.restaurant_id) return;
    if (!name) {
      toast({ title: "Nombre requerido", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("inventory")
      .insert({
        restaurant_id: profile.restaurant_id,
        ingredient_name: name,
        unit,
        current_quantity: isNaN(qty) ? 0 : qty,
        min_threshold: min,
        urgent_threshold: urgent,
        excess_threshold: excess,
        last_updated_at: new Date().toISOString(),
      } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ingrediente agregado", description: `${name}` });
    setOpen(false);
    setName("");
    onAdded?.();
    window.dispatchEvent(new CustomEvent("inventory_updated"));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Agregar ingrediente</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar a inventario</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Ingrediente</label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona ingrediente (de recetas)" />
              </SelectTrigger>
              <SelectContent>
                {(allowedNames ?? []).map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-sm text-muted-foreground">Cantidad</label>
              <Input type="number" step="0.1" value={qty} onChange={(e) => setQty(parseFloat(e.target.value))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Unidad</label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lb, kg, oz, unidad" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-sm text-muted-foreground">Mínimo (bajo)</label>
              <Input type="number" step="0.1" value={min ?? ''} onChange={(e) => setMin(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Urgente</label>
              <Input type="number" step="0.1" value={urgent ?? ''} onChange={(e) => setUrgent(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Exceso</label>
              <Input type="number" step="0.1" value={excess ?? ''} onChange={(e) => setExcess(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
