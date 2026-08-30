import { useColorScheme } from 'react-native'
import type { ThemeChoice } from './settings'

export interface Palette {
  background: string
  surface: string
  border: string
  text: string
  muted: string
  accent: string
  accentText: string
  danger: string
  fixed: string
  dark: boolean
}

const light: Palette = {
  background: '#f6f5f2',
  surface: '#ffffff',
  border: '#e2ded6',
  text: '#1c1b18',
  muted: '#7a746a',
  accent: '#a8501e',
  accentText: '#ffffff',
  danger: '#a33a2a',
  fixed: '#5f7a52',
  dark: false,
}

const dark: Palette = {
  background: '#16150f',
  surface: '#21201a',
  border: '#35332b',
  text: '#f2efe7',
  muted: '#a49d90',
  accent: '#d98b4a',
  accentText: '#1c1b18',
  danger: '#e08573',
  fixed: '#9dbb8c',
  dark: true,
}

export function usePalette(choice: ThemeChoice): Palette {
  const system = useColorScheme()
  if (choice === 'light') return light
  if (choice === 'dark') return dark
  return system === 'dark' ? dark : light
}

/** Крупные размеры: экран смотрят издалека и мокрыми руками. */
export const sizes = {
  gap: 12,
  pad: 16,
  radius: 14,
  tap: 52,
  title: 22,
  body: 17,
  cookTitle: 28,
  cookBody: 21,
  small: 14,
}
