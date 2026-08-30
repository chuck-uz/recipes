import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Settings {
  repo: string
  branch: string
  /** сокращения вместо полных слов; по умолчанию полные слова */
  abbreviated: boolean
  theme: ThemeChoice
}

const extra = Constants.expoConfig?.extra as { defaultRepo?: string; defaultBranch?: string } | undefined

export const DEFAULT_SETTINGS: Settings = {
  repo: extra?.defaultRepo ?? 'chuck-uz/recipes',
  branch: extra?.defaultBranch ?? 'main',
  abbreviated: false,
  theme: 'system',
}

const KEY = 'settings'
const TOKEN_KEY = 'github-token'

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings))
}

/** Токен нужен только приватному репозиторию; хранится в защищённом хранилище устройства. */
export async function loadToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function saveToken(token: string): Promise<void> {
  if (token.trim() === '') {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined)
    return
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token.trim())
}

export const appVersion = Constants.expoConfig?.version ?? '0.0.0'
