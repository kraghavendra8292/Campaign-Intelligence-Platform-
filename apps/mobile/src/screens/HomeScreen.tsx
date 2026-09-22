import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { env } from '../config/env';
import { useAuth } from '../features/auth/AuthContext';
import { theme } from '../theme/index';

/**
 * Authenticated placeholder screen.
 *
 * Proves the app boots, the session restores from the keystore, and the shared
 * design tokens render natively. No campaign functionality: issue management
 * and field tools arrive in Phase 9.
 */
export function HomeScreen() {
  const { viewer, signOut } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>RK</Text>
        </View>
        <Text style={styles.title}>RK Campaign</Text>
        <Text style={styles.subtitle}>Mobile application foundation ready.</Text>
        <Badge label="Phase 2" tone="success" />
      </View>

      <Card title="Signed in">
        <Text style={styles.mono}>{viewer?.user.email}</Text>
        <Text style={styles.note}>
          {viewer?.organization ? viewer.organization.name : 'No active organisation'}
          {viewer?.roles.length ? ` — ${viewer.roles.join(', ')}` : ''}
        </Text>
      </Card>

      <Card
        title="What is wired up"
        description="Authentication against the API, session restore from the device keystore, navigation, theming and configuration."
      />

      <Card
        title="Not implemented yet"
        description="Issue management, field capture and every campaign workflow are delivered in Phase 9."
      />

      <Card title="API endpoint">
        <Text style={styles.mono}>{env.apiUrl}</Text>
        <Text style={styles.note}>Configured through EXPO_PUBLIC_API_URL.</Text>
      </Card>

      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.color.background,
    flexGrow: 1,
  },
  header: {
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: theme.color.onPrimary,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.sm,
  },
  title: {
    fontSize: theme.fontSize.xxxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.color.text,
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.color.textMuted,
  },
  mono: {
    fontSize: theme.fontSize.sm,
    color: theme.color.text,
  },
  note: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textMuted,
  },
});
