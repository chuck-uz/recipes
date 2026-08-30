import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { appVersion, loadToken, saveToken, type ThemeChoice } from '../src/settings'
import { useSettings } from '../src/settings-context'
import * as storage from '../src/storage'
import { AuthError, describeSync, OfflineError, sync } from '../src/sync'
import { startTimer, TimersUnavailableError } from '../src/timers'
import { sizes, usePalette, type Palette } from '../src/theme'

const THEMES: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'Системная' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
]

export default function SettingsScreen() {
  const { settings, update } = useSettings()
  const palette = usePalette(settings.theme)

  const [repo, setRepo] = useState(settings.repo)
  const [branch, setBranch] = useState(settings.branch)
  const [token, setToken] = useState('')
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void loadToken().then((stored) => setToken(stored ?? ''))
    void storage.getLastSync().then(setLastSync)
  }, [])

  const styles = makeStyles(palette)

  const syncNow = async () => {
    setBusy(true)
    try {
      const result = await sync({ ...settings, repo, branch })
      setLastSync(await storage.getLastSync())
      Alert.alert('Синхронизация', describeSync(result))
    } catch (error) {
      const message =
        error instanceof OfflineError
          ? 'Нет сети — показаны сохранённые рецепты.'
          : error instanceof AuthError
            ? 'Токен не подошёл или истёк.'
            : (error as Error).message
      Alert.alert('Не получилось', message)
    } finally {
      setBusy(false)
    }
  }

  // Прошивки по-разному обрабатывают интент таймера. Десять секунд — самый
  // дешёвый способ убедиться, что на этом телефоне всё в порядке.
  const testTimer = async () => {
    try {
      await startTimer(10, 'Проверка')
      Alert.alert('Таймер заведён', 'Через десять секунд должны зазвонить «Часы».')
    } catch (error) {
      // Показываем настоящую причину: без неё «не запустился» невозможно
      // отличить от «нет разрешения» и починить с одного захода.
      Alert.alert(
        'Таймер не запустился',
        `Приложение «Часы» не приняло интент.\n\n${(error as Error).message}`,
      )
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: sizes.pad, gap: sizes.gap, paddingBottom: 48 }}>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Репозиторий</Text>
        <TextInput
          value={repo}
          onChangeText={setRepo}
          onBlur={() => void update({ repo: repo.trim() })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="владелец/репозиторий"
          placeholderTextColor={palette.muted}
          style={styles.input}
        />
        <TextInput
          value={branch}
          onChangeText={setBranch}
          onBlur={() => void update({ branch: branch.trim() })}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ветка"
          placeholderTextColor={palette.muted}
          style={styles.input}
        />
        <Text style={styles.hint}>
          Токен нужен только приватному репозиторию. Хранится в защищённом хранилище устройства.
        </Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          onBlur={() => void saveToken(token)}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="токен только на чтение"
          placeholderTextColor={palette.muted}
          style={styles.input}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Единицы</Text>
        <View style={styles.row}>
          {[
            { value: false, label: 'Полные слова' },
            { value: true, label: 'Сокращения' },
          ].map((option) => (
            <Pressable
              key={String(option.value)}
              onPress={() => void update({ abbreviated: option.value })}
              style={[styles.choice, settings.abbreviated === option.value && styles.choiceOn]}
            >
              <Text
                style={[styles.choiceText, settings.abbreviated === option.value && styles.choiceTextOn]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          {settings.abbreviated ? '2 ст. л. оливкового масла' : '2 столовые ложки оливкового масла'}
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Тема</Text>
        <View style={styles.row}>
          {THEMES.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => void update({ theme: option.value })}
              style={[styles.choice, settings.theme === option.value && styles.choiceOn]}
            >
              <Text style={[styles.choiceText, settings.theme === option.value && styles.choiceTextOn]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Обслуживание</Text>
        <Pressable style={styles.action} onPress={() => void syncNow()} disabled={busy}>
          <Text style={styles.actionText}>{busy ? 'Синхронизирую…' : 'Синхронизировать сейчас'}</Text>
        </Pressable>
        <Pressable style={styles.actionQuiet} onPress={() => void testTimer()}>
          <Text style={styles.actionQuietText}>Проверить таймер (10 секунд)</Text>
        </Pressable>
        <Text style={styles.hint}>
          {lastSync
            ? `Последняя синхронизация: ${new Date(lastSync).toLocaleString('ru-RU')}`
            : 'Синхронизации ещё не было'}
        </Text>
      </View>

      <Text style={styles.version}>Версия {appVersion}</Text>
    </ScrollView>
  )
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    block: {
      backgroundColor: palette.surface,
      borderRadius: sizes.radius,
      borderWidth: 1,
      borderColor: palette.border,
      padding: sizes.pad,
      gap: sizes.gap,
    },
    blockTitle: { color: palette.muted, fontSize: sizes.small, textTransform: 'uppercase', letterSpacing: 1 },
    input: {
      backgroundColor: palette.background,
      borderRadius: sizes.radius,
      borderWidth: 1,
      borderColor: palette.border,
      paddingHorizontal: sizes.pad,
      minHeight: sizes.tap,
      color: palette.text,
      fontSize: sizes.body,
    },
    hint: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    choice: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 999,
      paddingHorizontal: 16,
      minHeight: 44,
      justifyContent: 'center',
    },
    choiceOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    choiceText: { color: palette.muted, fontSize: sizes.small },
    choiceTextOn: { color: palette.accentText, fontWeight: '600' },
    action: {
      backgroundColor: palette.accent,
      borderRadius: sizes.radius,
      minHeight: sizes.tap,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionText: { color: palette.accentText, fontSize: sizes.body, fontWeight: '700' },
    actionQuiet: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: sizes.radius,
      minHeight: sizes.tap,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionQuietText: { color: palette.text, fontSize: sizes.body },
    version: { color: palette.muted, fontSize: 13, textAlign: 'center' },
  })
