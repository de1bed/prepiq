import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { useSessionMenu } from "@/hooks/useSessionMenu";
import { useActiveSession } from "@/hooks/useActiveSession";

export function SessionMenuManager() {
  const { session } = useActiveSession();
  const { data, isLoading, addToMenu, removeFromMenu, setAvailability, setPriceOverride } = useSessionMenu();
  const { toast } = useToast();

  const onToggle = async (recipeId: string, checked: boolean) => {
    try {
      if (checked) await addToMenu(recipeId);
      else await removeFromMenu(recipeId);
      toast({ title: "Menu actualizado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const onAvailability = async (recipeId: string, checked: boolean) => {
    try {
      await setAvailability(recipeId, checked);
      toast({ title: checked ? "Disponible" : "No disponible" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const onPrice = async (recipeId: string, value: string) => {
    const num = value.trim() === "" ? null : Number(value);
    try {
      await setPriceOverride(recipeId, num);
      toast({ title: "Precio actualizado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const entriesByRecipe = new Map<string, { price_override: number | null; is_available: boolean }>();
  const recipes = Array.from(data?.recipesById?.values() ?? []);
  for (const e of data?.entries ?? []) entriesByRecipe.set(e.recipe_id, { price_override: e.price_override, is_available: e.is_available });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session Menu {session ? `(${session.session_date})` : ""}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground">Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Incluir</th>
                  <th className="text-left p-3">Platillo</th>
                  <th className="text-left p-3">Categoría</th>
                  <th className="text-left p-3">Disponible</th>
                  <th className="text-left p-3">Precio</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((r: any) => {
                  const entry = entriesByRecipe.get(r.id);
                  const onMenu = !!entry;
                  const price = entry?.price_override ?? r.price ?? 0;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <Checkbox checked={onMenu} onCheckedChange={(c) => onToggle(r.id, !!c)} />
                      </td>
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3">{r.category}</td>
                      <td className="p-3">
                        <Checkbox
                          checked={entry?.is_available ?? false}
                          onCheckedChange={(c) => onAvailability(r.id, !!c)}
                          disabled={!onMenu}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="0.01"
                            defaultValue={price}
                            onBlur={(e) => onPrice(r.id, e.target.value)}
                            className="w-28"
                            disabled={!onMenu}
                          />
                          {!onMenu && (
                            <Button size="sm" onClick={() => onToggle(r.id, true)}>Agregar</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {recipes.length === 0 && (
                  <tr><td className="p-3 text-muted-foreground" colSpan={5}>No hay recetas activas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
