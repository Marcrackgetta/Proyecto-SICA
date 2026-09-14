import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors } from '@/theme/colors';

type BadgeStatus = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  status?: BadgeStatus;
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({ label, status = 'neutral', style }) => {
  const getColors = () => {
    switch (status) {
      case 'success':
        return { bg: Colors.status.successBg, text: Colors.status.success };
      case 'danger':
        return { bg: Colors.status.dangerBg, text: Colors.status.danger };
      case 'warning':
        return { bg: Colors.status.warningBg, text: Colors.status.warning };
      case 'info':
        return { bg: Colors.status.infoBg, text: Colors.status.info };
      case 'neutral':
      default:
        return { bg: Colors.status.neutralBg, text: Colors.status.neutral };
    }
  };

  const { bg, text } = getColors();

  return (
    <View style={[styles.container, { backgroundColor: bg }, style]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
