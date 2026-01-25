import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveSession } from "@/hooks/useActiveSession";
import { mockSupabase, initializeMockData } from "@/utils/supabaseWrapper";

export interface SessionMenuEntry {
  id: string;
  recipe_id: string;
  price_override: number | null;
  is_available: boolean;
}

export function useSessionMenu() {
  const { profile } = useAuth();
  const { session } = useActiveSession();
  const qc = useQueryClient();
  const restaurantId = profile?.restaurant_id;
  const sessionId = session?.id;

  const query = useQuery({
    queryKey: ["session_menu", restaurantId, sessionId],
    queryFn: async () => {
      if (!restaurantId || !sessionId) return { entries: [] as SessionMenuEntry[], recipesById: new Map<string, any>() };

      initializeMockData(restaurantId);

      try {
        const [{ data: entries, error: e1 }, { data: recipes, error: e2 }] = await Promise.all([
          supabase
            .from("session_menu")
            .select("id, recipe_id, price_override, is_available")
            .eq("restaurant_id", restaurantId)
            .eq("session_id", sessionId),
          supabase
            .from("recipes")
            .select("id, name, category, stations, price, is_active")
            .eq("restaurant_id", restaurantId)
            .eq("is_active", true)
            .order("name"),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;

        const recipesById = new Map<string, any>();
        for (const r of recipes ?? []) recipesById.set(r.id, r);

        return {
          entries: (entries ?? []) as SessionMenuEntry[],
          recipesById,
        };
      } catch (e) {
        // Use mock data when Supabase fails
        const mockEntries = mockSupabase.from("session_menu")
          .select("id, recipe_id, price_override, is_available")
          .eq("restaurant_id", restaurantId)
          .eq("session_id", sessionId)
          .data() as SessionMenuEntry[];
        
        const mockRecipes = mockSupabase.from("recipes")
          .select("id, name, category, stations, price, is_active")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .data() as any[];

        const recipesById = new Map<string, any>();
        for (const r of mockRecipes ?? []) recipesById.set(r.id, r);

        return {
          entries: mockEntries ?? [],
          recipesById,
        };
      }
    },
    enabled: !!restaurantId && !!sessionId,
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["session_menu", restaurantId, sessionId] });
  };

  const addToMenu = async (recipeId: string, priceOverride?: number | null) => {
    if (!restaurantId || !sessionId) return;
    try {
      const { error } = await supabase.from("session_menu").insert({
        restaurant_id: restaurantId,
        session_id: sessionId,
        recipe_id: recipeId,
        price_override: priceOverride ?? null,
        is_available: true,
      } as any);
      if (error) throw error;
    } catch (e) {
      // Use mock when Supabase fails
      mockSupabase.from("session_menu").insert({
        restaurant_id: restaurantId,
        session_id: sessionId,
        recipe_id: recipeId,
        price_override: priceOverride ?? null,
        is_available: true,
      });
    }
    await invalidate();
    window.dispatchEvent(new CustomEvent("menu_updated"));
  };

  const removeFromMenu = async (recipeId: string) => {
    if (!restaurantId || !sessionId) return;
    const { error } = await supabase
      .from("session_menu")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("session_id", sessionId)
      .eq("recipe_id", recipeId);
    if (error) throw error;
    await invalidate();
    window.dispatchEvent(new CustomEvent("menu_updated"));
  };

  const setAvailability = async (recipeId: string, isAvailable: boolean) => {
    if (!restaurantId || !sessionId) return;
    const { error } = await supabase
      .from("session_menu")
      .update({ is_available: isAvailable } as any)
      .eq("restaurant_id", restaurantId)
      .eq("session_id", sessionId)
      .eq("recipe_id", recipeId);
    if (error) throw error;
    await invalidate();
    window.dispatchEvent(new CustomEvent("menu_updated"));
  };

  const setPriceOverride = async (recipeId: string, price: number | null) => {
    if (!restaurantId || !sessionId) return;
    const { error } = await supabase
      .from("session_menu")
      .update({ price_override: price } as any)
      .eq("restaurant_id", restaurantId)
      .eq("session_id", sessionId)
      .eq("recipe_id", recipeId);
    if (error) throw error;
    await invalidate();
    window.dispatchEvent(new CustomEvent("menu_updated"));
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    addToMenu,
    removeFromMenu,
    setAvailability,
    setPriceOverride,
  };
}
