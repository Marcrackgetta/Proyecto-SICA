import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { registerForPushNotificationsAsync } from '@/services/notifications';

export default function DashboardLayout() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (user?.id) {
      registerForPushNotificationsAsync(user.id);
    }
  }, [user?.id]);

  return (
    <Stack>
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Portal del Representante',
          headerStyle: { backgroundColor: '#1E293B' },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 18 }
        }} 
      />
      <Stack.Screen 
        name="student/[id]" 
        options={{ 
          title: 'Detalle del Estudiante',
          headerStyle: { backgroundColor: '#1E293B' },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: '600', fontSize: 18 },
          headerBackTitle: 'Volver'
        }} 
      />
    </Stack>
  );
}
