import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme/index';

export interface CardProps {
  title?: string;
  description?: string;
  children?: ReactNode;
}

/** Rounded surface container, matching the web `Card`. */
export function Card({ title, description, children }: CardProps) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    width: '100%',
  },
  title: {
    color: theme.color.text,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  description: {
    color: theme.color.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.55,
  },
});
