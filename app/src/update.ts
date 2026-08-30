import AsyncStorage from '@react-native-async-storage/async-storage'
import { appVersion } from './settings'

const KEY = 'updateCheck'
const DAY_MS = 24 * 60 * 60 * 1000

interface UpdateCheck {
  checkedAt: number
  latest: string | null
}

/** «v0.2.0» и «0.2.0» — одно и то же. */
const normalize = (tag: string) => tag.replace(/^v/, '').trim()

export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => normalize(v).split('.').map((p) => Number.parseInt(p, 10) || 0)
  const a = parse(latest)
  const b = parse(current)

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

/**
 * Не чаще раза в сутки: это единственное обращение к GitHub API,
 * у которого без токена лимит 60 запросов в час.
 */
export async function checkForUpdate(repo: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(KEY)
  const previous: UpdateCheck | null = raw ? (JSON.parse(raw) as UpdateCheck) : null

  if (previous && Date.now() - previous.checkedAt < DAY_MS) {
    return previous.latest && isNewer(previous.latest, appVersion) ? previous.latest : null
  }

  let latest: string | null = null
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (response.ok) {
      const release = (await response.json()) as { tag_name?: string }
      latest = release.tag_name ?? null
    }
  } catch {
    latest = previous?.latest ?? null
  }

  await AsyncStorage.setItem(KEY, JSON.stringify({ checkedAt: Date.now(), latest } satisfies UpdateCheck))

  return latest && isNewer(latest, appVersion) ? latest : null
}
