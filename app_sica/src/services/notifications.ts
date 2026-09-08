// Notificaciones deshabilitadas temporalmente para compatibilidad con Expo Go >= SDK 53
export async function registerForPushNotificationsAsync(userId: string) {
  console.log('Notificaciones Push desactivadas en entorno de desarrollo/Expo Go.');
  return null;
}
