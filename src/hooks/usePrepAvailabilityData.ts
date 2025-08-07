
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PrepAvailabilityRow {
  id: string;
  recipe_id: string;
  available_batches: number;
  last_updated_at: string;
}

export function usePrepAvailabilityData(sessionId?: string | null) {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurant_id;

  const query = useQuery({
    queryKey: ["prep_availability", restaurantId, sessionId],
    queryFn: async () => {
      if (!restaurantId || !sessionId) return [];
      const { data, error } = await supabase
        .from("prep_availability")
        .select("id, recipe_id, available_batches, last_updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("session_id", sessionId)
        .order("last_updated_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        available_batches: Number(row.available_batches ?? 0),
      })) as PrepAvailabilityRow[];
    },
    enabled: !!restaurantId && !!sessionId,
  });

  useEffect(() => {
    const handler = () => query.refetch();
    window.addEventListener("prep_updated", handler as EventListener);
    return () => window.removeEventListener("prep_updated", handler as EventListener);
  }, [query]);

  return query;
}
