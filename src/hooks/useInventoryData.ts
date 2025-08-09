
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

export interface InventoryRow {
  id: string;
  ingredient_name: string;
  current_quantity: number;
  unit: string;
  last_updated_at: string;
  min_threshold: number | null;
  urgent_threshold: number | null;
  excess_threshold: number | null;
}

export function useInventoryData() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurant_id;

  const query = useQuery({
    queryKey: ["inventory", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase
        .from("inventory")
        .select("id, ingredient_name, current_quantity, unit, last_updated_at, min_threshold, urgent_threshold, excess_threshold")
        .eq("restaurant_id", restaurantId)
        .order("ingredient_name");
      if (error) throw error;
      return (data || []).map((row) => ({
        ...row,
        current_quantity: Number(row.current_quantity ?? 0),
        min_threshold: row.min_threshold === null ? null : Number(row.min_threshold),
        urgent_threshold: (row as any).urgent_threshold === null ? null : Number((row as any).urgent_threshold),
        excess_threshold: (row as any).excess_threshold === null ? null : Number((row as any).excess_threshold),
      })) as InventoryRow[];
    },
    enabled: !!restaurantId,
  });

  useEffect(() => {
    const handler = () => query.refetch();
    window.addEventListener("inventory_updated", handler as EventListener);
    return () => window.removeEventListener("inventory_updated", handler as EventListener);
  }, [query]);

  return query;
}
