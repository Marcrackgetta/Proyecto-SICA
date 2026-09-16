import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { useStudentStore } from '@/store/studentStore';
import { LogOut, UserPlus, ShieldAlert, CheckCircle, Clock, Search, MapPin, AlertTriangle, LogOut as LogOutIcon, ChevronRight } from 'lucide-react-native';
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
  
  const [resumenHoy, setResumenHoy] = useState<any>({ llegada: null, anomalia: null, salida: null });

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
      fetchEventosResumen(estudiante.cedula);

      channel = supabase
        .channel('public:historial_eventos')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'historial_eventos', filter: `estudiante_cedula=eq.${estudiante.cedula}` },
          (payload) => {
             fetchEventosResumen(estudiante.cedula);
          }
        )
        .subscribe();
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [vinculacionStatus, estudiante?.cedula]);

  async function fetchEventosResumen(cedula: string) {
    const d = new Date();
    const today = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('historial_eventos')
      .select('id, estado_consolidado, timestamp_evento')
      .eq('estudiante_cedula', cedula)
      .eq('fecha', today)
      .order('timestamp_evento', { ascending: true });

    if (error) {
      console.error('Error fetching resumen:', error);
      return;
    }

    if (data && data.length > 0) {
      let evLlegada = data.find((e: any) => e.estado_consolidado?.toLowerCase().includes('presente') || e.estado_consolidado?.toLowerCase().includes('atrasado'));
      let evAnomalia = [...data].reverse().find((e: any) => e.estado_consolidado?.toLowerCase().includes('fugado') || e.estado_consolidado?.toLowerCase().includes('intruso'));
      let evSalida = [...data].reverse().find((e: any) => e.estado_consolidado?.toLowerCase().includes('salida') || e.estado_consolidado?.toLowerCase().includes('despues'));
      
      // Fallback por si la logica falla
      if (!evLlegada && data.length > 0) {
         evLlegada = data[0];
      }

      setResumenHoy({
         llegada: evLlegada || null,
         anomalia: evAnomalia || null,
         salida: evSalida || null
      });
    } else {
      setResumenHoy({ llegada: null, anomalia: null, salida: null });
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

  const formatTime = (ts: string) => {
    if (!ts) return '--:--';
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
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
          <View>
            <View style={styles.studentHeader}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{estudiante.nombre?.charAt(0).toUpperCase() || 'E'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentName}>{estudiante.nombre}</Text>
                <Text style={styles.studentCedula}>C.I: {estudiante.cedula}</Text>
              </View>
            </View>
            
            <View style={{ marginTop: 16, marginBottom: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text.primary, marginLeft: 4 }}>
                Resumen del día
              </Text>
            </View>

            <View style={{ gap: 12 }}>
              {/* 1. LLEGADA */}
              <Card style={[styles.eventCard, resumenHoy.llegada ? { borderLeftColor: Colors.status.success } : {}]}>
                <View style={styles.eventIcon}>
                  <CheckCircle color={resumenHoy.llegada ? Colors.status.success : Colors.text.muted} size={24} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>Llegada a la Institución</Text>
                  {resumenHoy.llegada ? (
                    <Text style={[styles.eventSubtitle, { color: Colors.text.primary, fontWeight: '600' }]}>
                      Presente / En clase {resumenHoy.llegada.estado_consolidado === 'Atrasado' ? '— Atrasado' : ''}
                    </Text>
                  ) : (
                    <Text style={styles.eventSubtitle}>Aún no registrado</Text>
                  )}
                </View>
                <View style={styles.eventTime}>
                  <Text style={styles.eventTimeText}>{formatTime(resumenHoy.llegada?.timestamp_evento)}</Text>
                </View>
              </Card>

              {/* 2. FUERA DEL CURSO */}
              <Card style={[styles.eventCard, resumenHoy.anomalia ? { borderLeftColor: Colors.status.warning } : {}]}>
                <View style={styles.eventIcon}>
                  <AlertTriangle color={resumenHoy.anomalia ? Colors.status.warning : Colors.text.muted} size={24} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>Fuera del Curso</Text>
                  {resumenHoy.anomalia ? (
                    <Text style={[styles.eventSubtitle, { color: Colors.status.warning, fontWeight: '600' }]}>
                      Detección: {resumenHoy.anomalia.estado_consolidado}
                    </Text>
                  ) : (
                    <Text style={styles.eventSubtitle}>Sin anomalías</Text>
                  )}
                </View>
                <View style={styles.eventTime}>
                  <Text style={styles.eventTimeText}>{formatTime(resumenHoy.anomalia?.timestamp_evento)}</Text>
                </View>
              </Card>

              {/* 3. SALIDA */}
              <Card style={[styles.eventCard, resumenHoy.salida ? { borderLeftColor: Colors.status.neutral } : {}]}>
                <View style={styles.eventIcon}>
                  <LogOutIcon color={resumenHoy.salida ? Colors.status.neutral : Colors.text.muted} size={24} />
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>Salida / Última vez visto</Text>
                  {resumenHoy.salida ? (
                    <Text style={[styles.eventSubtitle, { color: Colors.text.primary, fontWeight: '600' }]}>
                      Salida Registrada
                    </Text>
                  ) : (
                    <Text style={styles.eventSubtitle}>Aún en la institución</Text>
                  )}
                </View>
                <View style={styles.eventTime}>
                  <Text style={styles.eventTimeText}>{formatTime(resumenHoy.salida?.timestamp_evento)}</Text>
                </View>
              </Card>
            </View>

            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => router.push(`/(dashboard)/student/${estudiante.cedula}`)}
              style={styles.detailButton}
            >
              <Text style={styles.detailButtonText}>Ver Actividad de hoy (Detalle)</Text>
              <ChevronRight color={Colors.primary} size={20} />
            </TouchableOpacity>

          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, padding: 24, paddingTop: 48, paddingBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  greeting: { fontSize: 14, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 4 },
  name: { fontSize: 20, fontWeight: '800', color: Colors.text.inverse },
  logoutBtn: { padding: 10, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 12 },
  content: { padding: 24 },
  centerBox: { marginTop: 60, alignItems: 'center', justifyContent: 'center' },
  cardCenter: { alignItems: 'center', paddingVertical: 32 },
  iconCirclePrimary: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  iconCircleWarning: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.status.warningBg, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: Colors.text.primary, textAlign: 'center', marginBottom: 12 },
  cardSub: { fontSize: 15, color: Colors.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  infoBox: { backgroundColor: Colors.background, padding: 16, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: Colors.border },
  infoText: { fontSize: 14, color: Colors.text.secondary, textAlign: 'center', lineHeight: 20 },
  
  studentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatarCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { color: Colors.text.inverse, fontSize: 22, fontWeight: 'bold' },
  studentName: { fontSize: 18, fontWeight: 'bold', color: Colors.text.primary },
  studentCedula: { fontSize: 14, color: Colors.text.secondary, marginTop: 2 },
  
  eventCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.border, borderRadius: 12 },
  eventIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', marginRight: 14, borderWidth: 1, borderColor: Colors.border },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 13, color: Colors.text.secondary, fontWeight: '600', marginBottom: 4 },
  eventSubtitle: { fontSize: 15, color: Colors.text.muted },
  eventTime: { marginLeft: 12 },
  eventTimeText: { fontSize: 15, fontWeight: 'bold', color: Colors.text.primary },
  
  detailButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight, paddingVertical: 14, borderRadius: 12, marginTop: 24 },
  detailButtonText: { color: Colors.primary, fontWeight: '700', fontSize: 15, marginRight: 6 }
});
