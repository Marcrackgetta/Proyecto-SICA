import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, StyleProp, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  isLoading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}) => {
  // ... container styles unchanged

  const getContainerStyles = () => {
    switch (variant) {
      case 'secondary':
        return [styles.container, styles.secondaryContainer];
      case 'outline':
        return [styles.container, styles.outlineContainer];
      case 'ghost':
        return [styles.container, styles.ghostContainer];
      case 'primary':
      default:
        return [styles.container, styles.primaryContainer];
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'secondary':
        return [styles.text, styles.secondaryText];
      case 'outline':
        return [styles.text, styles.outlineText];
      case 'ghost':
        return [styles.text, styles.ghostText];
      case 'primary':
      default:
        return [styles.text, styles.primaryText];
    }
  };

  const isDisabled = disabled || isLoading;

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <TouchableOpacity
      style={[
        getContainerStyles(),
        isDisabled && styles.disabledContainer,
        style,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? Colors.primary : Colors.text.inverse} />
      ) : (
        <>
          {icon && <React.Fragment>{icon}</React.Fragment>}
          <Text style={[getTextStyles(), isDisabled && styles.disabledText, icon ? { marginLeft: 8 } : null, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  primaryContainer: {
    backgroundColor: Colors.primary,
  },
  secondaryContainer: {
    backgroundColor: Colors.secondary,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ghostContainer: {
    backgroundColor: 'transparent',
  },
  disabledContainer: {
    backgroundColor: Colors.text.muted,
    borderColor: 'transparent',
    opacity: 0.7,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: Colors.text.inverse,
  },
  secondaryText: {
    color: Colors.text.inverse,
  },
  outlineText: {
    color: Colors.primary,
  },
  ghostText: {
    color: Colors.text.secondary,
  },
  disabledText: {
    color: Colors.surface,
  },
});
