import type { Settings } from './settings'
import { loadToken } from './settings'

/**
 * Единственное место, где приложение пишет в репозиторий.
 * Всё остальное — чтение: источник правды по-прежнему Git.
 */
const API = 'https://api.github.com'

export class NoTokenError extends Error {}
export class WriteForbiddenError extends Error {}
export class DeleteFailedError extends Error {}

interface ContentsResponse {
  sha?: string
}

async function request(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
}

/**
 * Удаляет файл рецепта. GitHub требует sha именно blob-объекта, а не
 * контрольную сумму содержимого из нашего индекса, поэтому сначала спрашиваем её.
 */
export async function deleteRecipeFile(
  settings: Settings,
  file: string,
  title: string,
): Promise<void> {
  const token = await loadToken()
  if (!token) {
    throw new NoTokenError('в настройках нет токена GitHub с правом записи')
  }

  const url = `${API}/repos/${settings.repo}/contents/${file}?ref=${settings.branch}`

  let head: Response
  try {
    head = await request(url, token)
  } catch {
    throw new DeleteFailedError('нет сети')
  }

  if (head.status === 401) throw new WriteForbiddenError('токен не подошёл или истёк')
  if (head.status === 404) throw new DeleteFailedError('файл уже отсутствует в репозитории')
  if (!head.ok) throw new DeleteFailedError(`GitHub ответил ${head.status}`)

  const { sha } = (await head.json()) as ContentsResponse
  if (!sha) throw new DeleteFailedError('GitHub не вернул идентификатор файла')

  const response = await request(`${API}/repos/${settings.repo}/contents/${file}`, token, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `recipe: remove ${title}`,
      sha,
      branch: settings.branch,
    }),
  })

  if (response.status === 401) throw new WriteForbiddenError('токен не подошёл или истёк')
  if (response.status === 403 || response.status === 404) {
    throw new WriteForbiddenError('у токена нет права записи в этот репозиторий')
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new DeleteFailedError(`GitHub ответил ${response.status}. ${detail.slice(0, 200)}`)
  }
}
