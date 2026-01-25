import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface RestaurantProfile {
  id: string;
  restaurant_id: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: RestaurantProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Ensure the current user has a profile row so RLS helpers work
  const ensureProfile = async (userId: string) => {
    try {
      const { data: rows } = await supabase
        .from('profiles')
        .select('id, user_id')
        .eq('user_id', userId)
        .limit(1);
      if (!rows || rows.length === 0) {
        await supabase.from('profiles').insert({
          user_id: userId,
          employee_number: userId.substring(0, 8),
          first_name: 'Admin',
          last_name: 'User',
          role: 'admin',
          restaurant_id: '24802dac-d026-4ac8-87bd-b3f22d8bd97e',
          is_active: true,
        } as any);
      }
    } catch (e) {
      console.warn('ensureProfile failed', e);
    }
  };

  useEffect(() => {
    // Bypass auth for testing - set mock user immediately
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User;

    setUser(mockUser);
    setProfile({ id: mockUser.id, restaurant_id: '24802dac-d026-4ac8-87bd-b3f22d8bd97e' });
    setLoading(false);

    // Commented out real auth for testing
    // supabase.auth.getSession().then(({ data: { session } }) => {
    //   setSession(session);
    //   setUser(session?.user ?? null);

    //   if (session?.user) {
    //     // Bootstrap profile in DB (deferred) and set client profile
    //     setTimeout(() => ensureProfile(session.user!.id), 0);
    //     setProfile({ id: session.user.id, restaurant_id: '24802dac-d026-4ac8-87bd-b3f22d8bd97e' });
    //   }

    //   setLoading(false);
    // });

    // // Listen for auth changes
    // const { data: { subscription } } = supabase.auth.onAuthStateChange(
    //   (_event, session) => {
    //     setSession(session);
    //     setUser(session?.user ?? null);

    //     if (session?.user) {
    //       // Defer supabase calls inside auth callback to avoid deadlocks
    //       setTimeout(() => ensureProfile(session.user!.id), 0);
    //       setProfile({ id: session.user.id, restaurant_id: '24802dac-d026-4ac8-87bd-b3f22d8bd97e' });
    //     } else {
    //       setProfile(null);
    //     }

    //     setLoading(false);
    //   }
    // );

    // return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // Bypass auth for testing - just clear mock user
    setUser(null);
    setProfile(null);
    // await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};