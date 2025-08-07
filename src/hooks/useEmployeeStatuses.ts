
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface EmployeeStatus {
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_number: string;
  status: "clocked_in" | "on_break" | "clocked_out";
  last_action: string | null;
  hours_today: number;
}

export function useEmployeeStatuses(sessionId?: string | null) {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurant_id;

  const query = useQuery({
    queryKey: ["employee_statuses", restaurantId, sessionId],
    queryFn: async () => {
      if (!restaurantId || !sessionId) return [] as EmployeeStatus[];

      const [{ data: employees, error: empError }, { data: logs, error: logsError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, employee_number")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true),
        supabase
          .from("clock_logs")
          .select("employee_id, status, timestamp")
          .eq("session_id", sessionId)
          .order("timestamp", { ascending: true }),
      ]);

      if (empError) throw empError;
      if (logsError) throw logsError;

      const byEmployee = new Map<string, { status: EmployeeStatus["status"]; last: string | null; hours: number; clockInAt: Date | null }>();

      for (const emp of employees || []) {
        byEmployee.set(emp.id, { status: "clocked_out", last: null, hours: 0, clockInAt: null });
      }

      for (const log of logs || []) {
        const entry = byEmployee.get(log.employee_id);
        const ts = new Date(log.timestamp);
        if (!entry) continue;

        if (log.status === "clocked_in") {
          entry.clockInAt = ts;
          entry.status = "clocked_in";
          entry.last = log.timestamp as any;
        } else if (log.status === "on_break") {
          // count time until break start
          if (entry.clockInAt) {
            entry.hours += (ts.getTime() - entry.clockInAt.getTime()) / (1000 * 60 * 60);
            entry.clockInAt = null;
          }
          entry.status = "on_break";
          entry.last = log.timestamp as any;
        } else if (log.status === "clocked_out") {
          if (entry.clockInAt) {
            entry.hours += (ts.getTime() - entry.clockInAt.getTime()) / (1000 * 60 * 60);
            entry.clockInAt = null;
          }
          entry.status = "clocked_out";
          entry.last = log.timestamp as any;
        }
      }

      const now = new Date();
      const result: EmployeeStatus[] = [];

      for (const emp of employees || []) {
        const entry = byEmployee.get(emp.id)!;
        let hours = entry.hours;
        if (entry.clockInAt && entry.status === "clocked_in") {
          hours += (now.getTime() - entry.clockInAt.getTime()) / (1000 * 60 * 60);
        }
        result.push({
          employee_id: emp.id,
          first_name: emp.first_name,
          last_name: emp.last_name,
          employee_number: emp.employee_number,
          status: entry.status,
          last_action: entry.last,
          hours_today: Math.round(hours * 100) / 100,
        });
      }

      return result;
    },
    enabled: !!restaurantId && !!sessionId,
  });

  useEffect(() => {
    const handler = () => query.refetch();
    window.addEventListener("clock_updated", handler as EventListener);
    return () => window.removeEventListener("clock_updated", handler as EventListener);
  }, [query]);

  return query;
}
