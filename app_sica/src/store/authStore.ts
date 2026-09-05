import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: string | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  role: null,
  isLoading: true,
  setSession: (session) => {
    set({ session, user: session?.user || null, isLoading: false });
  },
  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      let role = null;
      if (session?.user) {
        // Fetch role from user metadata or a profile table if needed
        // Assuming metadata for now, or we can fetch from a `usuarios` table
        // For SICA, roles might be stored in a 'usuarios' table or 'representantes' table
        const { data: profile } = await supabase
          .from('usuarios')
          .select('rol')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          role = profile.rol;
        }
      }

      set({ session, user: session?.user || null, role, isLoading: false });

      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        let newRole = null;
        if (newSession?.user) {
          const { data: profile } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('id', newSession.user.id)
            .single();
          if (profile) newRole = profile.rol;
        }
        set({ session: newSession, user: newSession?.user || null, role: newRole, isLoading: false });
      });
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({ isLoading: false });
    }
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, role: null });
  },
}));
