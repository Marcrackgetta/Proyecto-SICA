import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { registerForPushNotificationsAsync } from '@/services/notifications';
import { Colors } from '@/theme/colors';

export default function DashboardLayout() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (user?.id) {
      registerForPushNotificationsAsync(user.id);
    }
  }, [user?.id]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.text.inverse,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'SICA Familias',
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="student/[id]" 
        options={{ 
          title: 'Monitoreo Escolar',
          headerBackTitle: 'Atrás'
        }} 
      />
    </Stack>
  );
}
