import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings'

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
  ready: boolean
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: async () => undefined,
  ready: false,
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded)
      setReady(true)
    })
  }, [])

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch }
        void saveSettings(next)
        return next
      })
    },
    [],
  )

  const value = useMemo(() => ({ settings, update, ready }), [settings, update, ready])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
