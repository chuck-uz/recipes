import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Recipe, RecipeIndex } from './core'

const INDEX = 'index'
const ARCHIVED = 'archived'
const FRESH = 'fresh'
const LAST_SYNC = 'lastSync'
const recipeKey = (id: string) => `recipe:${id}`
const sessionKey = (id: string) => `session:${id}`

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const getIndex = () => readJson<RecipeIndex | null>(INDEX, null)
export const setIndex = (index: RecipeIndex) => AsyncStorage.setItem(INDEX, JSON.stringify(index))

export const getRecipe = (id: string) => readJson<Recipe | null>(recipeKey(id), null)
export const setRecipe = (recipe: Recipe) =>
  AsyncStorage.setItem(recipeKey(recipe.id), JSON.stringify(recipe))
export const removeRecipe = (id: string) => AsyncStorage.removeItem(recipeKey(id))

/** Рецепты, исчезнувшие из индекса: скрыты, но локально не удалены без подтверждения. */
export const getArchived = () => readJson<string[]>(ARCHIVED, [])
export const setArchived = (ids: string[]) => AsyncStorage.setItem(ARCHIVED, JSON.stringify(ids))

/** Появившиеся с последней синхронизации — для индикатора «новое». */
export const getFresh = () => readJson<string[]>(FRESH, [])
export const setFresh = (ids: string[]) => AsyncStorage.setItem(FRESH, JSON.stringify(ids))

export async function clearFresh(id: string): Promise<void> {
  const fresh = await getFresh()
  if (!fresh.includes(id)) return
  await setFresh(fresh.filter((x) => x !== id))
}

export const getLastSync = () => AsyncStorage.getItem(LAST_SYNC)
export const setLastSync = (iso: string) => AsyncStorage.setItem(LAST_SYNC, iso)

/**
 * Начатая готовка: порции, шаг и отмеченные ингредиенты.
 * Переживает сворачивание и перезапуск; через шесть часов считается забытой.
 */
export interface CookingSession {
  recipeId: string
  servings: number
  stepIndex: number
  checked: string[]
  updatedAt: number
}

export const SESSION_TTL_MS = 6 * 60 * 60 * 1000

export async function getSession(id: string): Promise<CookingSession | null> {
  const session = await readJson<CookingSession | null>(sessionKey(id), null)
  if (!session) return null
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    await clearSession(id)
    return null
  }
  return session
}

export const saveSession = (session: CookingSession) =>
  AsyncStorage.setItem(sessionKey(session.recipeId), JSON.stringify({ ...session, updatedAt: Date.now() }))

export const clearSession = (id: string) => AsyncStorage.removeItem(sessionKey(id))
