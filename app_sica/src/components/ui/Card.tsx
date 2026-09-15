import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle, StyleProp } from 'react-native';
import { Colors } from '@/theme/colors';

interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, style, ...props }) => {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24, // Slightly rounder for modern feel
    padding: 24,
    // Modern soft shadow
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    // Subtle border defines the card against the background
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
});
