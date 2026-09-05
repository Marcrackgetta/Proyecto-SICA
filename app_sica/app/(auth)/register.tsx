import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';
import { Mail, Lock, Eye, EyeOff, UserPlus, User } from 'lucide-react-native';

export default function RegisterScreen() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!nombre || !email || !password) {
      Alert.alert('Error', 'Por favor, complete todos los campos.');
      return;
    }

    setIsLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          nombre_completo: nombre.trim(),
          rol: 'REPRESENTANTE',
        }
      }
    });

    if (error) {
      setIsLoading(false);
      Alert.alert('Error al registrar', error.message);
      return;
    }

    // Si autoConfirm está activado en Supabase, el usuario inicia sesión.
    // Si no, necesitamos mostrar un mensaje para que revise su correo.
    if (data.session) {
      // Inició sesión automáticamente (el AuthStore se actualizará solo)
    } else {
      setIsLoading(false);
      Alert.alert('Registro exitoso', 'Por favor revise su correo para confirmar su cuenta.');
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <UserPlus color="#64748B" size={48} />
        </View>
        <Text style={styles.title}>Crear Cuenta</Text>
        <Text style={styles.subtitle}>Registro de nuevo representante</Text>

        <View style={styles.inputContainer}>
          <User color="#64748B" size={20} style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Nombre Completo"
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputContainer}>
          <Mail color="#64748B" size={20} style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Correo Electrónico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Lock color="#64748B" size={20} style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Contraseña (mín. 6 caracteres)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
            {showPassword ? <EyeOff color="#64748B" size={20} /> : <Eye color="#64748B" size={20} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.button, isLoading && styles.buttonDisabled]} 
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Registrarse</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.linkContainer}>
          <Text style={styles.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFF',
    padding: 32,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    width: '100%',
    height: 50,
  },
  icon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#334155',
  },
  eyeIcon: {
    padding: 8,
  },
  button: {
    backgroundColor: '#F59E0B', // Amber 500
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: '#FCD34D',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkContainer: {
    marginTop: 16,
    padding: 8,
  },
  linkText: {
    color: '#3B82F6',
    fontSize: 14,
  },
});
