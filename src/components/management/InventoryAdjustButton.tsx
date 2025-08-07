
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
  onUpdated?: () => void;
}

export function InventoryAdjustButton({ id, name, unit, current, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<number>(current);
  const { toast } = useToast();
  const { profile } = useAuth();

  const save = async () => {
    const qty = isNaN(value) ? 0 : value;
    const { error } = await supabase
      .from("inventory")
      .update({
        current_quantity: qty,
        last_updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: "No se pudo actualizar el inventario", variant: "destructive" });
      return;
    }
    toast({ title: "Inventario actualizado", description: `${name}: ${qty} ${unit}` });
    setOpen(false);
    onUpdated?.();
    // Emit manual event for immediate refresh; realtime will also arrive for other clients
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
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
