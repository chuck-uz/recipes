import type { Recipe, RecipeIndex } from './core'
import type { Settings } from './settings'
import { loadToken } from './settings'
import * as storage from './storage'

export interface SyncResult {
  added: number
  updated: number
  removed: number
  total: number
}

export class OfflineError extends Error {}
export class AuthError extends Error {}

const rawUrl = (settings: Settings, file: string) =>
  `https://raw.githubusercontent.com/${settings.repo}/${settings.branch}/${file}`

async function fetchJson<T>(url: string, token: string | null): Promise<T> {
  // Никаких лишних заголовков: любой нестандартный превращает запрос
  // в предварительный (preflight), которого GitHub на raw не принимает.
  // Свежесть обеспечивает параметр в адресе, а не заголовок.
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  // GitHub отдаёт содержимое через CDN и держит его в кеше дольше, чем обещает.
  // Без уникального параметра приложение получает вчерашний индекс и честно
  // сообщает «Всё актуально» — худший вид ошибки, потому что он выглядит успехом.
  // Файлы крошечные, поэтому обходим кеш всегда, а не только при ручном свайпе.
  const target = `${url}?t=${Date.now()}`

  let response: Response
  try {
    response = await fetch(target, { headers })
  } catch {
    throw new OfflineError('нет сети')
  }

  if (response.status === 401 || response.status === 403) {
    throw new AuthError('токен не подошёл или истёк')
  }
  if (!response.ok) {
    throw new Error(`${response.status} при загрузке ${url}`)
  }

  return (await response.json()) as T
}

/** Загружает пачками, чтобы не открывать полсотни соединений разом. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  }
  return results
}

/**
 * Сверяет индекс, скачивает только изменившееся и заменяет локальные копии.
 * index.json сохраняется последним: если загрузка оборвётся на середине,
 * следующая синхронизация просто доделает работу.
 */
export async function sync(settings: Settings): Promise<SyncResult> {
  const token = await loadToken()
  const remote = await fetchJson<RecipeIndex>(rawUrl(settings, 'index.json'), token)

  const local = await storage.getIndex()
  const localById = new Map((local?.recipes ?? []).map((entry) => [entry.id, entry]))

  const stale = await inBatches(remote.recipes, 6, async (entry) => {
    const known = localById.get(entry.id)
    const cached = known?.sha256 === entry.sha256 ? await storage.getRecipe(entry.id) : null
    return cached ? null : entry
  })

  const toDownload = stale.filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  await inBatches(toDownload, 6, async (entry) => {
    const recipe = await fetchJson<Recipe>(rawUrl(settings, entry.file), token)
    await storage.setRecipe(recipe)
  })

  const remoteIds = new Set(remote.recipes.map((entry) => entry.id))
  const removed = [...localById.keys()].filter((id) => !remoteIds.has(id))
  if (removed.length > 0) {
    const archived = await storage.getArchived()
    await storage.setArchived([...new Set([...archived, ...removed])])
  }

  const added = toDownload.filter((entry) => !localById.has(entry.id)).map((entry) => entry.id)
  if (added.length > 0) {
    const fresh = await storage.getFresh()
    await storage.setFresh([...new Set([...fresh, ...added])])
  }

  await storage.setIndex(remote)
  await storage.setLastSync(new Date().toISOString())

  return {
    added: added.length,
    updated: toDownload.length - added.length,
    removed: removed.length,
    total: remote.recipes.length,
  }
}

/** Человеческий итог синхронизации для строки под списком. */
export function describeSync(result: SyncResult): string {
  const changed = result.added + result.updated
  if (changed === 0 && result.removed === 0) return 'Всё актуально'

  const parts: string[] = []
  if (result.added > 0) parts.push(`новых: ${result.added}`)
  if (result.updated > 0) parts.push(`обновлено: ${result.updated}`)
  if (result.removed > 0) parts.push(`убрано: ${result.removed}`)

  return parts.join(', ')
}
