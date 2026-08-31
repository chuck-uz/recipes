import AsyncStorage from '@react-native-async-storage/async-storage'
import * as IntentLauncher from 'expo-intent-launcher'
import { Platform } from 'react-native'

/**
 * Таймеры ведёт системное приложение «Часы»: мы лишь заводим их стандартным
 * интентом Android. Ни фоновых сервисов, ни собственных уведомлений.
 */
const SET_TIMER = 'android.intent.action.SET_TIMER'
const SHOW_TIMERS = 'android.intent.action.SHOW_TIMERS'

const EXTRA_LENGTH = 'android.intent.extra.alarm.LENGTH'
const EXTRA_MESSAGE = 'android.intent.extra.alarm.MESSAGE'
const EXTRA_SKIP_UI = 'android.intent.extra.alarm.SKIP_UI'

const KEY = 'timers'

export interface ActiveTimer {
  key: string
  label: string
  /** абсолютное время окончания: отсчёт переживает перезапуск приложения */
  endsAt: number
}

export class TimersUnavailableError extends Error {}

/**
 * Длительность обязана уехать целым числом: «Часы» читают её через
 * getIntExtra и, не найдя целого, заводят таймер по умолчанию — на минуту.
 *
 * Поэтому здесь именно expo-intent-launcher: он приводит числа из JavaScript
 * к Int. Linking.sendIntent из React Native этого не делает — кладёт любое
 * число дробным (см. IntentModule.kt: «We cannot know from JS if is an
 * Integer or Double»), и таймер получается неправильным без единой ошибки.
 */
async function sendTimerIntent(seconds: number, label: string, skipUi: boolean): Promise<void> {
  await IntentLauncher.startActivityAsync(SET_TIMER, {
    extra: {
      [EXTRA_LENGTH]: Math.round(seconds),
      [EXTRA_MESSAGE]: label,
      [EXTRA_SKIP_UI]: skipUi,
    },
  })
}

/**
 * Заводит таймер, не покидая рецепт. Если тихий запуск не проходит, пробуем
 * с открытием «Часов»: лучше переключить экран, чем промолчать.
 *
 * При полной неудаче сообщение содержит причины всех попыток — иначе
 * «не запустился» невозможно отличить от «нет разрешения».
 */
export async function startTimer(seconds: number, label: string): Promise<ActiveTimer> {
  if (Platform.OS !== 'android') {
    throw new TimersUnavailableError('системный таймер доступен только на Android')
  }

  const attempts: Array<[string, () => Promise<void>]> = [
    ['тихий запуск', () => sendTimerIntent(seconds, label, true)],
    ['с открытием «Часов»', () => sendTimerIntent(seconds, label, false)],
  ]

  const failures: string[] = []

  for (const [name, attempt] of attempts) {
    try {
      await attempt()
      const timer: ActiveTimer = {
        key: `${Date.now()}-${Math.round(seconds)}`,
        label,
        endsAt: Date.now() + Math.round(seconds) * 1000,
      }
      await saveTimers([...(await loadTimers()), timer])
      return timer
    } catch (error) {
      failures.push(`${name}: ${(error as Error).message}`)
    }
  }

  throw new TimersUnavailableError(failures.join('\n'))
}

export async function openClock(): Promise<void> {
  await IntentLauncher.startActivityAsync(SHOW_TIMERS).catch(() => undefined)
}

export async function loadTimers(): Promise<ActiveTimer[]> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return []
  try {
    return (JSON.parse(raw) as ActiveTimer[]).filter((timer) => timer.endsAt > Date.now())
  } catch {
    return []
  }
}

async function saveTimers(timers: ActiveTimer[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(timers.filter((t) => t.endsAt > Date.now())))
}

export async function forgetTimer(key: string): Promise<ActiveTimer[]> {
  const timers = (await loadTimers()).filter((timer) => timer.key !== key)
  await saveTimers(timers)
  return timers
}

/** «12:34» или «1:05:00» — сколько осталось. */
export function formatRemaining(endsAt: number, now = Date.now()): string {
  const total = Math.max(0, Math.round((endsAt - now) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** «30 минут», «1 ч 30 мин» — предзаполненная длительность на кнопке. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} мин`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`
}
