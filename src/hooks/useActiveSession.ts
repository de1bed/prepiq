
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DailySession {
  id: string;
  restaurant_id: string;
  session_date: string;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  created_at: string;
}

export function useActiveSession() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const restaurantId = profile?.restaurant_id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["daily_session", restaurantId],
    queryFn: async () => {
      if (!restaurantId) return null;
      const { data, error } = await supabase
        .from("daily_sessions")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!restaurantId,
  });

  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener("orders_updated", handler as EventListener);
    window.addEventListener("prep_updated", handler as EventListener);
    window.addEventListener("clock_updated", handler as EventListener);
    return () => {
      window.removeEventListener("orders_updated", handler as EventListener);
      window.removeEventListener("prep_updated", handler as EventListener);
      window.removeEventListener("clock_updated", handler as EventListener);
    };
  }, [refetch]);

  const startSession = async () => {
    if (!restaurantId) return;
    const today = new Date();
    const sessionDate = today.toISOString().slice(0, 10);
    const { error } = await supabase.from("daily_sessions").insert({
      restaurant_id: restaurantId,
      session_date: sessionDate,
      is_active: true,
      started_at: new Date().toISOString(),
    } as any);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["daily_session", restaurantId] });
  };

  const endSession = async () => {
    if (!data?.id) return;
    const { error } = await supabase
      .from("daily_sessions")
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
      } as any)
      .eq("id", data.id);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["daily_session", restaurantId] });
  };

  return {
    session: data,
    isLoading,
    startSession,
    endSession,
    refetch,
  };
}
