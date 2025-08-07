
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RecipeLite {
  id: string;
  name: string;
  batch_size: number;
}

export function useRecipesMap() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurant_id;

  const { data, isLoading } = useQuery({
    queryKey: ["recipes_map", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return new Map<string, RecipeLite>();
      const { data, error } = await supabase
        .from("recipes")
        .select("id, name, batch_size")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true);
      if (error) throw error;
      const map = new Map<string, RecipeLite>();
      for (const r of data ?? []) {
        map.set(r.id, { id: r.id, name: r.name, batch_size: Number(r.batch_size ?? 1) });
      }
      return map;
    },
    enabled: !!restaurantId,
  });

  return { recipesMap: data ?? new Map<string, RecipeLite>(), isLoading };
}
