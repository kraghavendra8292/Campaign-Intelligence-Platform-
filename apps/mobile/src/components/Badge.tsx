import { StyleSheet, Text, View } from 'react-native';
import type { StatusTone } from '@rk/design-tokens';
import { theme } from '../theme/index';

export interface BadgeProps {
  label: string;
  tone?: StatusTone;
}

const TONE_STYLES: Record<StatusTone, { background: string; text: string }> = {
  neutral: { background: theme.color.surfaceSubtle, text: theme.color.textMuted },
  success: { background: theme.color.successSubtle, text: theme.color.success },
  warning: { background: theme.color.warningSubtle, text: theme.color.accentHover },
  error: { background: theme.color.errorSubtle, text: theme.color.error },
  info: { background: theme.color.infoSubtle, text: theme.color.info },
};

/** Compact status pill. The label always carries the meaning, not the colour. */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <View style={[styles.badge, { backgroundColor: toneStyle.background }]}>
      <Text style={[styles.label, { color: toneStyle.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
  },
  label: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
