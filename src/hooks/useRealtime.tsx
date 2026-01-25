import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// Disable realtime for now to avoid WebSocket errors
const ENABLE_REALTIME = false;

export function useRealtime() {
  const { profile } = useAuth();
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Skip realtime if disabled
    if (!ENABLE_REALTIME || !profile?.restaurant_id) return;

    try {
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
            table: 'order_items'
          },
          (payload) => {
            console.log('Order item change:', payload);
            window.dispatchEvent(new CustomEvent('orders_updated', { detail: payload }));
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'session_menu'
          },
          (payload) => {
            console.log('Session menu change:', payload);
            window.dispatchEvent(new CustomEvent('menu_updated', { detail: payload }));
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Realtime connected');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('Realtime channel error - continuing without realtime updates');
          }
        });
    } catch (error) {
      // Silently handle realtime errors
      console.warn('Realtime subscription failed - continuing without realtime updates:', error);
    }

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch (error) {
          // Silently handle cleanup errors
        }
      }
    };
  }, [profile?.restaurant_id]);

  return channelRef.current;
}