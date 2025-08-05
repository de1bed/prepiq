import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useRealtime() {
  const { profile } = useAuth();
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!profile?.restaurant_id) return;

    // Create realtime channel for restaurant
    channelRef.current = supabase
      .channel(`restaurant_${profile.restaurant_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('Order change:', payload);
          // Trigger refresh for orders
          window.dispatchEvent(new CustomEvent('orders_updated', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prep_availability'
        },
        (payload) => {
          console.log('Prep availability change:', payload);
          window.dispatchEvent(new CustomEvent('prep_updated', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory'
        },
        (payload) => {
          console.log('Inventory change:', payload);
          window.dispatchEvent(new CustomEvent('inventory_updated', { detail: payload }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clock_logs'
        },
        (payload) => {
          console.log('Clock log change:', payload);
          window.dispatchEvent(new CustomEvent('clock_updated', { detail: payload }));
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [profile?.restaurant_id]);

  return channelRef.current;
}