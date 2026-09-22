import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Credential storage for the mobile app.
 *
 * A native client has no cookie jar, so - unlike the web app - it must hold the
 * refresh token itself. AsyncStorage is unacceptable for that: it is plain,
 * unencrypted JSON on disk, readable by anyone with filesystem access to a
 * rooted or jailbroken device or an unencrypted backup.
 *
 * `expo-secure-store` wraps the iOS Keychain and Android EncryptedSharedPreferences
 * (hardware-backed where available), which is the right home for a long-lived
 * bearer credential.
 *
 * The interface exists so the backing store can change - to a different keystore,
 * or to biometric-gated storage - without touching the auth service.
 */
export interface CredentialStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const STORAGE_KEYS = {
  refreshToken: 'rk.auth.refreshToken',
} as const;

/**
 * In-memory fallback for web preview builds.
 *
 * SecureStore has no web implementation. Falling back to memory means a web
 * preview simply does not persist a session across reloads, which is strictly
 * better than silently writing a refresh token into localStorage.
 */
class MemoryStorage implements CredentialStorage {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class SecureStoreStorage implements CredentialStorage {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // A corrupted or inaccessible keychain entry must read as "signed out",
      // not crash the app on launch.
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, {
      // Readable only while the device is unlocked, and never restored onto a
      // different device from a backup.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Already gone is the desired end state.
    }
  }
}

export const credentialStorage: CredentialStorage =
  Platform.OS === 'web' ? new MemoryStorage() : new SecureStoreStorage();
