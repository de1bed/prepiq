import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface DailySession {
  id: string;
  restaurant_id: string;
  session_date: string;
  is_active: boolean;
  started_at: string;
  ended_at?: string;
}

export function useSession() {
  const { profile } = useAuth();
  const [currentSession, setCurrentSession] = useState<DailySession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.restaurant_id) {
      setLoading(false);
      return;
    }
    
    initializeSession();
  }, [profile?.restaurant_id]);

  const initializeSession = async () => {
    if (!profile?.restaurant_id) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Check if there's an active session for today
      const { data: existingSession, error: fetchError } = await supabase
        .from('daily_sessions')
        .select('*')
        .eq('restaurant_id', profile.restaurant_id)
        .eq('session_date', today)
        .eq('is_active', true)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching session:', fetchError);
        setLoading(false);
        return;
      }

      if (existingSession) {
        setCurrentSession(existingSession);
      } else {
        // Create new session for today
        const { data: newSession, error: createError } = await supabase
          .from('daily_sessions')
          .insert({
            restaurant_id: profile.restaurant_id,
            session_date: today,
            is_active: true
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating session:', createError);
        } else {
          setCurrentSession(newSession);
        }
      }
    } catch (error) {
      console.error('Error initializing session:', error);
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    if (!currentSession) return;

    try {
      const { error } = await supabase
        .from('daily_sessions')
        .update({
          is_active: false,
          ended_at: new Date().toISOString()
        })
        .eq('id', currentSession.id);

      if (error) {
        console.error('Error ending session:', error);
      } else {
        setCurrentSession(prev => prev ? { ...prev, is_active: false, ended_at: new Date().toISOString() } : null);
      }
    } catch (error) {
      console.error('Error ending session:', error);
    }
  };

  return {
    currentSession,
    loading,
    initializeSession,
    endSession
  };
}