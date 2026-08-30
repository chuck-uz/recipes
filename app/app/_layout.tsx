import { Link, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SettingsProvider, useSettings } from '../src/settings-context'
import { sizes, usePalette } from '../src/theme'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </SafeAreaProvider>
  )
}

function Shell() {
  const { settings } = useSettings()
  const palette = usePalette(settings.theme)

  return (
    <>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.text,
          headerTitleStyle: { fontSize: sizes.title, fontWeight: '600' },
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Рецепты',
            headerRight: () => (
              <Link href="/settings" style={{ color: palette.accent, fontSize: sizes.body, padding: 4 }}>
                <Text>Настройки</Text>
              </Link>
            ),
          }}
        />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen name="cook/[id]" options={{ title: 'Готовим', headerBackTitle: 'Назад' }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
      </Stack>
    </>
  )
}
