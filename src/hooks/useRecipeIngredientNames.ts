import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useRecipeIngredientNames() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurant_id;

  const query = useQuery({
    queryKey: ["recipe_ingredient_names", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [] as string[];

      // Fetch active recipe IDs for this restaurant
      const { data: recipes, error: e1 } = await supabase
        .from("recipes")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);
      if (e1) throw e1;
      const ids = (recipes ?? []).map((r) => r.id);
      if (ids.length === 0) return [] as string[];

      // Fetch ingredients referencing those recipes
      const { data: ingredients, error: e2 } = await supabase
        .from("recipe_ingredients")
        .select("ingredient_name, recipe_id")
        .in("recipe_id", ids);
      if (e2) throw e2;

      const names = new Set<string>();
      for (const row of ingredients ?? []) {
        if (row.ingredient_name) names.add(row.ingredient_name);
      }
      return Array.from(names).sort((a, b) => a.localeCompare(b));
    },
    enabled: !!restaurantId,
  });

  return query;
}
