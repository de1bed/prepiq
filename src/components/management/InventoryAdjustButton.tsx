
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  id: string;
  name: string;
  unit: string;
  current: number;
  min_threshold?: number | null;
  urgent_threshold?: number | null;
  excess_threshold?: number | null;
  onUpdated?: () => void;
}

export function InventoryAdjustButton({ id, name, unit, current, min_threshold, urgent_threshold, excess_threshold, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number>(current);
  const [unitState, setUnitState] = useState<string>(unit);
  const [min, setMin] = useState<number | null>(min_threshold ?? null);
  const [urgent, setUrgent] = useState<number | null>(urgent_threshold ?? null);
  const [excess, setExcess] = useState<number | null>(excess_threshold ?? null);
  const { toast } = useToast();
  const { profile } = useAuth();

  const status = (() => {
    if (excess !== null && value >= excess) return "excess";
    if (value <= 0) return "critical";
    if (urgent !== null && value <= urgent) return "urgent";
    if (min !== null && value <= min) return "low";
    return "normal";
  })();

  const save = async () => {
    const qty = isNaN(value) ? 0 : value;
    const { error } = await supabase
      .from("inventory")
      .update({
        current_quantity: qty,
        unit: unitState,
        min_threshold: min,
        urgent_threshold: urgent,
        excess_threshold: excess,
        last_updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo actualizar el inventario", variant: "destructive" });
      return;
    }
    toast({ title: "Inventario actualizado", description: `${name}: ${qty} ${unitState}` });
    setOpen(false);
    onUpdated?.();
    window.dispatchEvent(new CustomEvent("inventory_updated", { detail: { id } }));
  };

  const del = async () => {
    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
      return;
    }
    toast({ title: "Eliminado", description: name });
    setOpen(false);
    onUpdated?.();
    window.dispatchEvent(new CustomEvent("inventory_updated", { detail: { id } }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Adjust</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Inventory</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">{name}</div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              value={value}
              onChange={(e) => setValue(parseFloat(e.target.value))}
            />
            <Input
              className="w-32"
              value={unitState}
              onChange={(e) => setUnitState(e.target.value)}
              placeholder="Unidad (lb, kg, oz)"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Mínimo (Bajo)</div>
              <Input type="number" step="0.1" value={min ?? ''} onChange={(e) => setMin(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Urgente</div>
              <Input type="number" step="0.1" value={urgent ?? ''} onChange={(e) => setUrgent(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Exceso</div>
              <Input type="number" step="0.1" value={excess ?? ''} onChange={(e) => setExcess(e.target.value === '' ? null : parseFloat(e.target.value))} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Estado estimado: <span className="font-medium">{status}</span></div>
          <div className="flex justify-between gap-2">
            <Button variant="destructive" onClick={del}>Eliminar</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
