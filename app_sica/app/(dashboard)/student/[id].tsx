import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/services/supabase';
import { Clock, CheckCircle, XCircle, AlertTriangle, Video } from 'lucide-react-native';
import { useStudentStore } from '@/store/studentStore';
import { Colors } from '@/theme/colors';
import { Card } from '@/components/ui/Card';

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams();
  const { estudiante } = useStudentStore();
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistorial = async () => {
    const d = new Date();
    const today = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const { data } = await supabase
      .from('asistencia_diaria')
      .select('*')
      .eq('estudiante_cedula', id)
      .eq('fecha', today)
      .single();

    if (data) {
      const events = [];
      
      if (data.hora_salida) {
        events.push({
          id: 'salida',
          timestamp_deteccion: data.hora_salida,
          estado: 'Salida',
          hora_clase: 'Fin de jornada'
        });
      }
      
      if (data.estado_ubicacion && data.ultima_actualizacion) {
        events.push({
          id: 'actual',
          timestamp_deteccion: data.ultima_actualizacion,
          estado: data.estado_ubicacion,
          hora_clase: 'Última detección'
        });
      }
      
      if (data.hora_llegada) {
        events.push({
          id: 'llegada',
          timestamp_deteccion: data.hora_llegada,
          estado: data.estado_llegada || 'Llegada',
          hora_clase: 'Ingreso a institución'
        });
      }
      
      setHistorial(events);
    } else {
      setHistorial([]);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    await fetchHistorial();
    setLoading(false);
  }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistorial();
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getStatusType = (estado: string) => {
    const e = estado.toLowerCase();
    if (e.includes('presente') || e.includes('atrasado') || e.includes('llegada')) return 'success';
    if (e.includes('salida') || e.includes('clase')) return 'neutral';
    if (e.includes('fugado')) return 'warning';
    if (e.includes('intruso') || e.includes('falta') || e.includes('ausente') || e.includes('falto')) return 'danger';
    return 'neutral';
  };

  const getStatusIcon = (estado: string) => {
    const type = getStatusType(estado);
    switch(type) {
      case 'success': return <CheckCircle color={Colors.status.success} size={20} />;
      case 'danger': return <XCircle color={Colors.status.danger} size={20} />;
      case 'warning': return <AlertTriangle color={Colors.status.warning} size={20} />;
      default: return <Clock color={Colors.text.muted} size={20} />;
    }
  };

  const renderSkeleton = () => (
    <View style={styles.listContent}>
      {[1, 2, 3].map((key) => (
        <View key={key} style={styles.timelineItem}>
          <View style={styles.timelineLine} />
          <View style={[styles.timelineDot, { backgroundColor: Colors.border }]} />
          <View style={styles.timelineContent}>
            <Card style={styles.skeletonCard}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonSub} />
            </Card>
          </View>
        </View>
      ))}
    </View>
  );

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const time = new Date(item.timestamp_deteccion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isLast = index === historial.length - 1;
    const type = getStatusType(item.estado);

    let bgColor = Colors.status.neutralBg;
    if (type === 'success') bgColor = Colors.status.successBg;
    if (type === 'danger') bgColor = Colors.status.dangerBg;
    if (type === 'warning') bgColor = Colors.status.warningBg;

    return (
      <View style={styles.timelineItem}>
        {!isLast && <View style={styles.timelineLine} />}
        
        <View style={[styles.timelineDot, { backgroundColor: bgColor }]}>
          {getStatusIcon(item.estado)}
        </View>
        
        <View style={styles.timelineContent}>
          <Card style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.timeText}>{time}</Text>
              <Text style={[styles.estadoText, { color: getStatusType(item.estado) === 'success' ? Colors.status.success : getStatusType(item.estado) === 'danger' ? Colors.status.danger : Colors.status.warning }]}>
                {item.estado}
              </Text>
            </View>
            <View style={styles.historyBody}>
              <Video color={Colors.text.muted} size={16} style={{ marginRight: 6 }} />
              <Text style={styles.historyTitle}>Registro: {item.hora_clase.replace('_', ' ')}</Text>
            </View>
          </Card>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>Actividad de hoy</Text>
        <Text style={styles.headerTitle}>{estudiante?.nombre || 'Estudiante'}</Text>
      </View>

      {loading ? (
        renderSkeleton()
      ) : historial.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Clock color={Colors.text.muted} size={48} />
          <Text style={styles.emptyText}>No hay registros para el día de hoy.</Text>
        </View>
      ) : (
        <FlatList
          data={historial}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={Colors.primary}
              colors={[Colors.primary]} 
            />
          }
        />
      )}
    </View>
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerSub: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
    marginTop: 4,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 20,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 20,
    top: 40,
    bottom: -30,
    width: 2,
    backgroundColor: Colors.border,
  },
  timelineDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 16,
  },
  historyCard: {
    padding: 16,
    borderRadius: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  estadoText: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  skeletonCard: {
    padding: 16,
    borderRadius: 16,
    height: 80,
    justifyContent: 'center',
  },
  skeletonTitle: {
    height: 16,
    backgroundColor: Colors.border,
    borderRadius: 8,
    width: '40%',
    marginBottom: 12,
  },
  skeletonSub: {
    height: 14,
    backgroundColor: Colors.border,
    borderRadius: 7,
    width: '70%',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: 'center',
  }
});
