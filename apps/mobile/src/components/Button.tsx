import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../theme/index';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mobile counterpart of the web `Button`.
 *
 * Web and native genuinely cannot share a component here - one renders a DOM
 * `<button>`, the other a native `Pressable` - so the implementations stay
 * separate while the *tokens* they consume are shared. That is the boundary
 * this project draws around cross-platform reuse.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.label, variant === 'secondary' ? styles.labelSecondary : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.touchTarget,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: theme.color.primary,
  },
  secondary: {
    backgroundColor: theme.color.surface,
    borderColor: theme.color.borderStrong,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    backgroundColor: theme.color.disabledSurface,
    borderColor: theme.color.disabledSurface,
  },
  label: {
    color: theme.color.onPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  labelSecondary: {
    color: theme.color.text,
  },
});
