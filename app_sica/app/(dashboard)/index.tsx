import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Alert, ScrollView } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useStudentStore } from '@/store/studentStore';
import { LogOut, UserPlus, ShieldAlert, CheckCircle, MapPin, Clock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';

export default function DashboardScreen() {
  const { user, signOut } = useAuthStore();
  const { vinculacionStatus, estudiante, fetchVinculacion, solicitarVinculacion, suscribirseAvinculacion, desuscribirseAvinculacion } = useStudentStore();
  const router = useRouter();

  const [cedula, setCedula] = useState('');
  const [nombreEst, setNombreEst] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [ultimoEstado, setUltimoEstado] = useState('Desconocido');
  const [ultimaHora, setUltimaHora] = useState('--:--');

  useEffect(() => {
    if (user?.id) {
      fetchVinculacion(user.id);
      suscribirseAvinculacion(user.id);
    }
    return () => {
      desuscribirseAvinculacion();
    };
  }, [user?.id]);

  useEffect(() => {
    let channel: any;
    if (vinculacionStatus === 'VINCULADO' && estudiante?.cedula) {
      // Fetch initial presence
      fetchUltimaAsistencia(estudiante.cedula);

      // Subscribe to real-time presence
      channel = supabase
        .channel('public:asistencia')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'asistencia', filter: `estudiante_cedula=eq.${estudiante.cedula}` },
          (payload) => {
            const row = payload.new;
            setUltimoEstado(row.estado);
            const date = new Date(row.timestamp_deteccion);
            setUltimaHora(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
          }
        )
        .subscribe();
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [vinculacionStatus, estudiante?.cedula]);

  async function fetchUltimaAsistencia(cedula: string) {
    // Buscar la última asistencia del día
    const d = new Date();
    const today = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const { data } = await supabase
      .from('asistencia')
      .select('*')
      .eq('estudiante_cedula', cedula)
      .eq('fecha', today)
      .order('timestamp_deteccion', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setUltimoEstado(data.estado);
      const date = new Date(data.timestamp_deteccion);
      setUltimaHora(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
    } else {
      setUltimoEstado('AUSENTE');
      setUltimaHora('--:--');
    }
  }

  const handleSolicitar = async () => {
    if (!cedula || !nombreEst) return Alert.alert('Error', 'Ingrese cédula y nombre');
    setIsSubmitting(true);
    await solicitarVinculacion(
      user!.id, 
      user!.email || '', 
      user!.user_metadata?.nombre_completo || 'Representante', 
      cedula, 
      nombreEst
    );
    setIsSubmitting(false);
  };

  const nombreUsuario = user?.user_metadata?.nombre_completo || 'Representante';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bienvenido/a,</Text>
          <Text style={styles.name}>{nombreUsuario.toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={() => signOut()} style={styles.logoutBtn}>
          <LogOut color="#6B7280" size={20} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {vinculacionStatus === 'CARGANDO' && (
          <ActivityIndicator size="large" color="#1E293B" style={{ marginTop: 40 }} />
        )}

        {vinculacionStatus === 'SIN_VINCULAR' && (
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <UserPlus color="#3B82F6" size={32} />
            </View>
            <Text style={styles.cardTitle}>Vincular Estudiante</Text>
            <Text style={styles.cardSub}>Aún no tiene un estudiante asignado. Ingrese los datos de su representado.</Text>
            
            <TextInput style={styles.input} placeholder="Cédula del estudiante" value={cedula} onChangeText={setCedula} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Nombre completo" value={nombreEst} onChangeText={setNombreEst} autoCapitalize="words" />
            
            <TouchableOpacity style={styles.button} onPress={handleSolicitar} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar Solicitud</Text>}
            </TouchableOpacity>
          </View>
        )}

        {vinculacionStatus === 'PENDIENTE' && (
          <View style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <ShieldAlert color="#D97706" size={32} />
            </View>
            <Text style={styles.cardTitle}>Solicitud en Proceso</Text>
            <Text style={styles.cardSub}>La administración está revisando su solicitud para vincular al estudiante <Text style={{fontWeight: 'bold'}}>{estudiante?.nombre_estudiante}</Text>. Esta pantalla se actualizará automáticamente.</Text>
          </View>
        )}

        {vinculacionStatus === 'VINCULADO' && (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/(dashboard)/student/${estudiante.cedula}`)}>
            <View style={styles.studentHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6', marginBottom: 0, marginRight: 16 }]}>
                <UserPlus color="#4B5563" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{estudiante.nombre}</Text>
                <Text style={styles.studentCedula}>Cédula: {estudiante.cedula}</Text>
              </View>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.statusRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CheckCircle color={ultimoEstado === 'Presente' ? '#10B981' : '#9CA3AF'} size={20} />
                <Text style={[styles.statusText, { color: ultimoEstado === 'Presente' ? '#10B981' : '#6B7280' }]}>
                  {ultimoEstado}
                </Text>
              </View>
              <View style={styles.timeBadge}>
                <Clock color="#4B5563" size={14} style={{ marginRight: 4 }} />
                <Text style={styles.timeText}>Hora: {ultimaHora}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // grey-100
  },
  header: {
    backgroundColor: '#FFF',
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB', // grey-200
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280', // grey-500
    marginBottom: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937', // grey-800
  },
  logoutBtn: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  content: {
    padding: 24,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  button: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  studentCedula: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4B5563',
  }
});
