import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useStudentStore } from '@/store/studentStore';
import { LogOut, UserPlus, ShieldAlert, CheckCircle, Clock, Search, MapPin } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';

// Nuevos componentes UI
import { Colors } from '@/theme/colors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function DashboardScreen() {
  const { user, signOut } = useAuthStore();
  const { vinculacionStatus, estudiante, fetchVinculacion, solicitarVinculacion, suscribirseAvinculacion, desuscribirseAvinculacion } = useStudentStore();
  const router = useRouter();

  const [cedula, setCedula] = useState('');
  const [nombreEst, setNombreEst] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [paso, setPaso] = useState(1);
  const [amieCode, setAmieCode] = useState('');
  const [institucionInfo, setInstitucionInfo] = useState<any>(null);
  const [verificandoAmie, setVerificandoAmie] = useState(false);
  
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
      fetchUltimaAsistencia(estudiante.cedula);

      channel = supabase
        .channel('public:asistencia_diaria')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'asistencia_diaria', filter: `estudiante_cedula=eq.${estudiante.cedula}` },
          (payload) => {
            const row = payload.new as any;
            if (row && (row.estado_ubicacion || row.estado_llegada)) {
              setUltimoEstado(row.estado_ubicacion || row.estado_llegada || 'Desconocido');
              const date = new Date(row.ultima_actualizacion);
              setUltimaHora(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
            }
          }
        )
        .subscribe();
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [vinculacionStatus, estudiante?.cedula]);

  async function fetchUltimaAsistencia(cedula: string) {
    const d = new Date();
    const today = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const { data } = await supabase
      .from('asistencia_diaria')
      .select('*')
      .eq('estudiante_cedula', cedula)
      .eq('fecha', today)
      .limit(1)
      .single();

    if (data) {
      setUltimoEstado(data.estado_ubicacion || data.estado_llegada || 'Desconocido');
      const date = new Date(data.ultima_actualizacion);
      setUltimaHora(`${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`);
    } else {
      setUltimoEstado('Ausente');
      setUltimaHora('--:--');
    }
  }

  const handleVerificarAmie = async () => {
    if (!amieCode.trim()) return Alert.alert('Error', 'Ingrese un código AMIE');
    
    setVerificandoAmie(true);
    const { data, error } = await supabase
      .from('instituciones')
      .select('id, nombre')
      .eq('codigo_amie', amieCode.trim())
      .single();
      
    setVerificandoAmie(false);
    
    if (data) {
      setInstitucionInfo(data);
      setPaso(2);
    } else {
      Alert.alert('No encontrada', 'El código AMIE ingresado no corresponde a una institución registrada.');
    }
  };

  const handleSolicitar = async () => {
    if (!cedula || !nombreEst) return Alert.alert('Error', 'Ingrese cédula y nombre');
    setIsSubmitting(true);
    await solicitarVinculacion(
      user!.id, 
      user!.email || '', 
      user!.user_metadata?.nombre_completo || 'Representante', 
      cedula, 
      nombreEst,
      institucionInfo?.id
    );
    setIsSubmitting(false);
  };

  const nombreUsuario = user?.user_metadata?.nombre_completo || 'Representante';

  // Helper para Badge
  const getStatusType = (estado: string) => {
    const e = estado.toLowerCase();
    if (e.includes('presente') || e.includes('atrasado')) return 'success';
    if (e.includes('fugado')) return 'warning';
    if (e.includes('intruso') || e.includes('falta') || e.includes('ausente') || e.includes('falto')) return 'danger';
    return 'neutral';
  };

  return (
    <ScrollView 
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={false}
      keyboardDismissMode="none"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bienvenido/a,</Text>
          <Text style={styles.name}>{nombreUsuario}</Text>
        </View>
        <TouchableOpacity onPress={() => signOut()} style={styles.logoutBtn}>
          <LogOut color={Colors.text.muted} size={22} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {vinculacionStatus === 'CARGANDO' && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}

        {vinculacionStatus === 'SIN_VINCULAR' && (
          <Card style={styles.cardCenter}>
            <View style={styles.iconCirclePrimary}>
              <UserPlus color={Colors.primary} size={36} />
            </View>
            <Text style={styles.cardTitle}>Vincular Estudiante</Text>
            <Text style={styles.cardSub}>
              Para recibir notificaciones en tiempo real, conecte su cuenta con el perfil de su representado.
            </Text>
            
            <View style={{ width: '100%', marginTop: 8 }}>
              {paso === 1 ? (
                <>
                  <Input 
                    placeholder="Código AMIE de la institución" 
                    value={amieCode} 
                    onChangeText={setAmieCode} 
                    autoCapitalize="characters"
                    leftIcon={<Search color={Colors.text.muted} size={20} />}
                  />
                  <Button 
                    title="Verificar Institución" 
                    onPress={handleVerificarAmie} 
                    isLoading={verificandoAmie} 
                    style={{ marginTop: 12 }}
                  />
                </>
              ) : (
                <>
                  <View style={{backgroundColor: Colors.status.successBg, padding: 12, borderRadius: 8, marginBottom: 16}}>
                    <Text style={{color: Colors.status.success, fontWeight: 'bold', textAlign: 'center'}}>
                      Institución: {institucionInfo?.nombre}
                    </Text>
                  </View>
                  
                  <Input 
                    placeholder="Cédula del estudiante" 
                    value={cedula} 
                    onChangeText={setCedula} 
                    keyboardType="numeric" 
                  />
                  <Input 
                    placeholder="Nombre completo" 
                    value={nombreEst} 
                    onChangeText={setNombreEst} 
                    autoCapitalize="words" 
                  />
                  
                  <Button 
                    title="Enviar Solicitud" 
                    onPress={handleSolicitar} 
                    isLoading={isSubmitting} 
                    style={{ marginTop: 12 }}
                  />
                  
                  <TouchableOpacity onPress={() => setPaso(1)} style={{marginTop: 16, padding: 12}}>
                    <Text style={{color: Colors.text.secondary, textAlign: 'center', fontWeight: 'bold'}}>
                      Cambiar institución
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Card>
        )}

        {vinculacionStatus === 'PENDIENTE' && (
          <Card style={styles.cardCenter}>
            <View style={styles.iconCircleWarning}>
              <ShieldAlert color={Colors.status.warning} size={36} />
            </View>
            <Text style={styles.cardTitle}>Solicitud en Proceso</Text>
            <Text style={styles.cardSub}>
              La administración está verificando su solicitud para vincular al estudiante <Text style={{fontWeight: 'bold', color: Colors.text.primary}}>{estudiante?.nombre_estudiante}</Text>. 
            </Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>Esta pantalla se actualizará automáticamente cuando sea aprobada.</Text>
            </View>
          </Card>
        )}

        {vinculacionStatus === 'VINCULADO' && (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/(dashboard)/student/${estudiante.cedula}`)}>
            <Card style={styles.studentCard}>
              <View style={styles.studentHeader}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{estudiante.nombre?.charAt(0).toUpperCase() || 'E'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>{estudiante.nombre}</Text>
                  <Text style={styles.studentCedula}>C.I: {estudiante.cedula}</Text>
                </View>
                <Badge label={ultimoEstado} status={getStatusType(ultimoEstado)} />
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.statusRow}>
                <View style={styles.timeBadge}>
                  <Clock color={Colors.text.secondary} size={16} style={{ marginRight: 6 }} />
                  <Text style={styles.timeText}>Última actividad: {ultimaHora}</Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.surface,
    padding: 24,
    paddingTop: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  logoutBtn: {
    padding: 10,
    backgroundColor: Colors.background,
    borderRadius: 12,
  },
  content: {
    padding: 24,
  },
  centerBox: {
    marginTop: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCenter: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  iconCirclePrimary: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircleWarning: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.status.warningBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 12,
  },
  cardSub: {
    fontSize: 15,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  infoBox: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  studentCard: {
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: Colors.text.inverse,
    fontSize: 20,
    fontWeight: 'bold',
  },
  studentName: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  studentCedula: {
    fontSize: 14,
    color: Colors.text.muted,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  }
});
