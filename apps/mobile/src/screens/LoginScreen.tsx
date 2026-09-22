import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAuth } from '../features/auth/AuthContext';
import { MobileApiError } from '../features/auth/authService';
import { theme } from '../theme/index';

/** Sign-in screen for campaign staff. */
export function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(
        caught instanceof MobileApiError
          ? caught.message
          : 'Sign-in failed. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>RK</Text>
          </View>
          <Text style={styles.title}>RK Campaign</Text>
          <Text style={styles.subtitle}>Sign in to continue.</Text>
        </View>

        <Card>
          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            editable={!submitting}
            accessibilityLabel="Email address"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            editable={!submitting}
            accessibilityLabel="Password"
          />

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Button
            label={submitting ? 'Signing in…' : 'Sign in'}
            onPress={() => void handleSubmit()}
            disabled={submitting}
            style={styles.submit}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.color.background },
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: theme.color.onPrimary,
    fontWeight: theme.fontWeight.bold,
    fontSize: theme.fontSize.md,
  },
  title: {
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    color: theme.color.text,
  },
  subtitle: { fontSize: theme.fontSize.sm, color: theme.color.textMuted },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.color.text,
    marginTop: theme.spacing.sm,
  },
  input: {
    minHeight: theme.touchTarget,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    color: theme.color.text,
    backgroundColor: theme.color.surface,
  },
  error: {
    marginTop: theme.spacing.sm,
    color: theme.color.error,
    fontSize: theme.fontSize.sm,
  },
  submit: { marginTop: theme.spacing.lg },
});
