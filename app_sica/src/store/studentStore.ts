import { create } from 'zustand';
import { supabase } from '@/services/supabase';

interface StudentState {
  estudiante: any | null;
  vinculacionStatus: 'CARGANDO' | 'SIN_VINCULAR' | 'PENDIENTE' | 'VINCULADO';
  channelSubscription: any | null;
  fetchVinculacion: (repUid: string) => Promise<void>;
  solicitarVinculacion: (repUid: string, correo: string, nombreRep: string, cedula: string, nombreEst: string, institucionId?: string) => Promise<boolean>;
  suscribirseAvinculacion: (repUid: string) => void;
  desuscribirseAvinculacion: () => void;
}

export const useStudentStore = create<StudentState>((set, get) => ({
  estudiante: null,
  vinculacionStatus: 'CARGANDO',
  channelSubscription: null,
  
  fetchVinculacion: async (repUid: string) => {
    set({ vinculacionStatus: 'CARGANDO' });
    
    // 1. Check if already linked
    const { data: estData, error: estError } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('representante_uid', repUid)
      .single();

    if (estData) {
      set({ estudiante: estData, vinculacionStatus: 'VINCULADO' });
      return;
    }

    // 2. If not linked, check if pending
    const { data: solData } = await supabase
      .from('solicitudes_vinculacion')
      .select('*')
      .eq('rep_uid', repUid)
      .eq('estado', 'pendiente')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    if (solData) {
      set({ estudiante: solData, vinculacionStatus: 'PENDIENTE' });
    } else {
      set({ estudiante: null, vinculacionStatus: 'SIN_VINCULAR' });
    }
  },

  solicitarVinculacion: async (repUid, correo, nombreRep, cedula, nombreEst, institucionId) => {
    try {
      const { error } = await supabase
        .from('solicitudes_vinculacion')
        .insert({
          rep_uid: repUid,
          correo_rep: correo,
          nombre_rep: nombreRep,
          cedula_estudiante: cedula,
          nombre_estudiante: nombreEst,
          estado: 'pendiente',
          institucion_id: institucionId
        });
      
      if (error) throw error;
      
      set({ vinculacionStatus: 'PENDIENTE', estudiante: { cedula_estudiante: cedula, nombre_estudiante: nombreEst } });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  suscribirseAvinculacion: (repUid) => {
    const { channelSubscription } = get();
    if (channelSubscription) {
      supabase.removeChannel(channelSubscription);
    }

    const newChannel = supabase
      .channel('public:solicitudes_vinculacion')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitudes_vinculacion', filter: `rep_uid=eq.${repUid}` },
        (payload) => {
          if (payload.new.estado === 'aprobada') {
            get().fetchVinculacion(repUid);
          }
        }
      )
      .subscribe();
      
    set({ channelSubscription: newChannel });
  },

  desuscribirseAvinculacion: () => {
    const { channelSubscription } = get();
    if (channelSubscription) {
      supabase.removeChannel(channelSubscription);
      set({ channelSubscription: null });
    }
  }
}));
