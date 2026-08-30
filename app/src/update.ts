import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import * as IntentLauncher from 'expo-intent-launcher'
import { appVersion } from './settings'

export interface UpdateInfo {
  version: string
  tag: string
  url: string
  size: number
  pageUrl: string
}

interface Cached {
  checkedAt: number
  info: UpdateInfo | null
}

const KEY = 'updateCheck'

/**
 * Проверка при каждом возврате в приложение была бы расточительной: это
 * единственное обращение к GitHub API, где без токена лимит 60 запросов в час.
 * Получасовое окно оставляет проверку частой и в лимит не упирается.
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

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

interface Release {
  tag_name?: string
  html_url?: string
  assets?: Array<{ name?: string; size?: number; browser_download_url?: string }>
}

/** @param force ручная проверка кнопкой: игнорирует получасовое окно. */
export async function checkForUpdate(repo: string, force = false): Promise<UpdateInfo | null> {
  const raw = await AsyncStorage.getItem(KEY)
  const cached: Cached | null = raw ? (JSON.parse(raw) as Cached) : null

  if (!force && cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
    return cached.info && isNewer(cached.info.version, appVersion) ? cached.info : null
  }

  let info: UpdateInfo | null = null
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error(`GitHub ответил ${response.status}`)

    const release = (await response.json()) as Release
    const apk = release.assets?.find((asset) => asset.name?.endsWith('.apk'))

    if (release.tag_name && apk?.browser_download_url) {
      info = {
        version: normalize(release.tag_name),
        tag: release.tag_name,
        url: apk.browser_download_url,
        size: apk.size ?? 0,
        pageUrl: release.html_url ?? `https://github.com/${repo}/releases/latest`,
      }
    }
  } catch (error) {
    // Нет сети — молчим и оставляем прошлый результат: обновление не срочное.
    if (cached) return cached.info && isNewer(cached.info.version, appVersion) ? cached.info : null
    throw error
  }

  await AsyncStorage.setItem(KEY, JSON.stringify({ checkedAt: Date.now(), info } satisfies Cached))

  return info && isNewer(info.version, appVersion) ? info : null
}

export class InstallError extends Error {}

const ACTION_INSTALL = 'android.intent.action.INSTALL_PACKAGE'
const ACTION_VIEW = 'android.intent.action.VIEW'
const APK_MIME = 'application/vnd.android.package-archive'
const FLAG_GRANT_READ_URI_PERMISSION = 1

/**
 * Скачивает APK и передаёт системному установщику.
 *
 * Контрольной суммы нет намеренно: посчитать её для 36 мегабайт в JavaScript
 * дорого, а защита от подмены здесь и без того жёстче — Android откажется
 * ставить пакет, подписанный не тем же ключом, что установленный.
 * Поэтому проверяется только размер: он ловит оборванную загрузку.
 */
export async function downloadAndInstall(
  info: UpdateInfo,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const dir = `${FileSystem.cacheDirectory}updates/`
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined)

  const target = `${dir}recipes-${info.version}.apk`
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined)

  const download = FileSystem.createDownloadResumable(info.url, target, {}, (progress) => {
    const expected = progress.totalBytesExpectedToWrite || info.size
    if (expected > 0) onProgress(Math.min(1, progress.totalBytesWritten / expected))
  })

  const result = await download.downloadAsync()
  if (!result) throw new InstallError('загрузка прервалась')

  const file = await FileSystem.getInfoAsync(result.uri)
  if (!file.exists) throw new InstallError('скачанный файл не найден')
  if (info.size > 0 && file.size !== info.size) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined)
    throw new InstallError(`файл скачался не полностью: ${file.size} вместо ${info.size} байт`)
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri)

  const attempts: Array<[string, () => Promise<unknown>]> = [
    [
      'установщик',
      () =>
        IntentLauncher.startActivityAsync(ACTION_INSTALL, {
          data: contentUri,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        }),
    ],
    [
      'открыть файл',
      () =>
        IntentLauncher.startActivityAsync(ACTION_VIEW, {
          data: contentUri,
          type: APK_MIME,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        }),
    ],
  ]

  const failures: string[] = []
  for (const [name, attempt] of attempts) {
    try {
      await attempt()
      return
    } catch (error) {
      failures.push(`${name}: ${(error as Error).message}`)
    }
  }

  throw new InstallError(failures.join('\n'))
}
