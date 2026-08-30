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
 * Заводит таймер, не покидая рецепт. Если прошивка не умеет тихий запуск,
 * пробуем ещё раз с открытием «Часов» — лучше переключить экран, чем промолчать.
 */
export async function startTimer(seconds: number, label: string): Promise<ActiveTimer> {
  if (Platform.OS !== 'android') {
    throw new TimersUnavailableError('системный таймер доступен только на Android')
  }

  const extra: Record<string, string | number | boolean> = {
    [EXTRA_LENGTH]: Math.round(seconds),
    [EXTRA_MESSAGE]: label,
    [EXTRA_SKIP_UI]: true,
  }

  try {
    await IntentLauncher.startActivityAsync(SET_TIMER, { extra })
  } catch {
    try {
      await IntentLauncher.startActivityAsync(SET_TIMER, { extra: { ...extra, [EXTRA_SKIP_UI]: false } })
    } catch {
      throw new TimersUnavailableError('приложение «Часы» не приняло таймер')
    }
  }

  const timer: ActiveTimer = {
    key: `${Date.now()}-${Math.round(seconds)}`,
    label,
    endsAt: Date.now() + Math.round(seconds) * 1000,
  }

  await saveTimers([...(await loadTimers()), timer])
  return timer
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
