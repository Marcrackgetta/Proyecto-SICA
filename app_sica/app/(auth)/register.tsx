import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';
import { Mail, Lock, UserPlus, User } from 'lucide-react-native';
import { Colors } from '@/theme/colors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function RegisterScreen() {

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const router = useRouter();

  const handleRegister = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!nombre || !email || !password) {
      setErrorMsg('Por favor, complete todos los campos.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('La contrasea debe tener al menos 6 caracteres.');
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

    setIsLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data.session) {
      // Auto-login
    } else {
      setSuccessMsg('Registro exitoso! Por favor revise su correo para confirmar su cuenta.');
      setTimeout(() => {
        router.back();
      }, 3000);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent} 
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <UserPlus color={Colors.primary} size={40} />
          </View>
          <Text style={styles.title}>Crear Cuenta</Text>
          <Text style={styles.subtitle}>Registro para representantes</Text>
        </View>

        <Card style={styles.card}>
          <Input
            placeholder="Nombre Completo"
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
            leftIcon={<User color={Colors.text.muted} size={20} />}
          />

          <Input
            placeholder="Correo Electrnico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            leftIcon={<Mail color={Colors.text.muted} size={20} />}
          />

          <Input
            placeholder="Contrasea (mn. 6 caracteres)"
            value={password}
            onChangeText={setPassword}
            isPassword
            leftIcon={<Lock color={Colors.text.muted} size={20} />}
          />

          {errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : null}

          {successMsg ? (
            <Text style={styles.successText}>{successMsg}</Text>
          ) : null}

          <Button 
            title="Registrarse" 
            onPress={handleRegister} 
            isLoading={isLoading} 
            style={styles.button}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.linkText}>Inicia sesin</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    backgroundColor: Colors.primaryLight,
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.text.secondary,
  },
  card: {
    padding: 24,
  },
  errorText: {
    color: Colors.status.danger,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  successText: {
    color: Colors.status.success,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: Colors.text.secondary,
    fontSize: 15,
  },
  linkText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
