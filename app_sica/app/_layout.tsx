import { useEffect } from 'react';
import { Stack, useRouter, Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/store/authStore';
import { View, ActivityIndicator } from 'react-native';

export default function RootLayout() {
  const { initialize, isLoading, session } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    // Wait a tick to ensure navigation is ready
    setTimeout(() => {
      if (session) {
        // En Fase 3 cambiaremos esto a (tabs) u otra ruta principal
        router.replace('/(dashboard)');
      } else {
        router.replace('/(auth)/login');
      }
    }, 0);
  }, [session, isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4B5563" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
