import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/services/supabase';
import { Clock, CheckCircle, XCircle, AlertTriangle, LogIn, LogOut } from 'lucide-react-native';
import { useStudentStore } from '@/store/studentStore';

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams();
  const { estudiante } = useStudentStore();
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistorial();
  }, [id]);

  const fetchHistorial = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('asistencia')
      .select('*')
      .eq('estudiante_cedula', id)
      .eq('fecha', today)
      .order('timestamp_deteccion', { ascending: false });

    if (data) setHistorial(data);
    setLoading(false);
  };

  const getStatusColor = (estado: string) => {
    switch(estado) {
      case 'Presente': return '#10B981'; // Green
      case 'Falta': return '#EF4444'; // Red
      case 'Fugado': return '#F59E0B'; // Amber
      default: return '#6B7280'; // Gray
    }
  };

  const getStatusIcon = (estado: string) => {
    switch(estado) {
      case 'Presente': return <CheckCircle color="#10B981" size={20} />;
      case 'Falta': return <XCircle color="#EF4444" size={20} />;
      case 'Fugado': return <AlertTriangle color="#F59E0B" size={20} />;
      default: return <Clock color="#6B7280" size={20} />;
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const time = new Date(item.timestamp_deteccion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Suponemos que Hora_1, Hora_2, etc son entradas/salidas dependiendo del contexto
    // pero para SICA, cada registro es un "evento" en una hora de clase
    return (
      <View style={styles.historyCard}>
        <View style={[styles.iconContainer, { backgroundColor: getStatusColor(item.estado) + '20' }]}>
          {getStatusIcon(item.estado)}
        </View>
        <View style={styles.historyContent}>
          <Text style={styles.historyTitle}>Registro: {item.hora_clase.replace('_', ' ')}</Text>
          <Text style={styles.historySubtitle}>Estado: {item.estado}</Text>
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{time}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>Historial de hoy para</Text>
        <Text style={styles.headerTitle}>{estudiante?.nombre?.toUpperCase() || 'Estudiante'}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1E293B" style={{ marginTop: 40 }} />
      ) : historial.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Clock color="#9CA3AF" size={48} />
          <Text style={styles.emptyText}>No hay registros para el día de hoy.</Text>
        </View>
      ) : (
        <FlatList
          data={historial}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    backgroundColor: '#FFF',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerSub: {
    fontSize: 14,
    color: '#6B7280',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 4,
  },
  listContent: {
    padding: 20,
  },
  historyCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    padding: 12,
    borderRadius: 12,
    marginRight: 16,
  },
  historyContent: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  historySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4B5563',
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
    color: '#6B7280',
    textAlign: 'center',
  }
});
