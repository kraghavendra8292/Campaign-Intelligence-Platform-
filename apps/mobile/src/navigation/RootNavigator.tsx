import { NavigationContainer, type Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { useAuth } from '../features/auth/AuthContext';
import { theme } from '../theme/index';

/**
 * Route map for the application.
 *
 * Declared as a type so `navigation.navigate()` is checked at compile time.
 * Phase 9 adds the authenticated campaign-staff screens here; Phase 2
 * authentication decides which stack is mounted.
 */
export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Maps the shared design tokens onto React Navigation's theme contract. */
const navigationTheme: NavigationTheme = {
  dark: false,
  colors: {
    primary: theme.color.primary,
    background: theme.color.background,
    card: theme.color.brand,
    text: theme.color.onBrand,
    border: theme.color.border,
    notification: theme.color.accent,
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
};

/**
 * Mounts one of two stacks based on authentication state.
 *
 * Swapping the whole stack, rather than guarding individual screens, means an
 * authenticated screen is never mounted for a signed-out user - there is no
 * momentary render of protected UI, and no navigation path back into it.
 */
export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'initialising') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.color.background,
        }}
      >
        <ActivityIndicator color={theme.color.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.brand },
          headerTintColor: theme.color.onBrand,
          headerTitleStyle: { fontWeight: theme.fontWeight.semibold },
        }}
      >
        {status === 'authenticated' ? (
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'RK Campaign' }} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
