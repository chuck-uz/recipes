import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { IndexEntry } from '../src/core'
import { useSettings } from '../src/settings-context'
import * as storage from '../src/storage'
import { AuthError, describeSync, OfflineError, sync } from '../src/sync'
import { sizes, usePalette, type Palette } from '../src/theme'
import { checkForUpdate, downloadAndInstall, type UpdateInfo } from '../src/update'

export default function RecipeList() {
  const { settings, ready } = useSettings()
  const palette = usePalette(settings.theme)
  const router = useRouter()

  const [entries, setEntries] = useState<IndexEntry[]>([])
  const [fresh, setFresh] = useState<string[]>([])
  const [archived, setArchived] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState(0)

  // Две синхронизации разом затирают итог друг друга: свайп вниз во время
  // стартовой показал бы «Всё актуально» поверх «новых: 1».
  const syncing = useRef(false)

  const readLocal = useCallback(async () => {
    const [index, freshIds, archivedIds] = await Promise.all([
      storage.getIndex(),
      storage.getFresh(),
      storage.getArchived(),
    ])
    setEntries(index?.recipes ?? [])
    setFresh(freshIds)
    setArchived(archivedIds)
  }, [])

  const runSync = useCallback(
    async () => {
      if (syncing.current) return
      syncing.current = true
      setBusy(true)
      try {
        const result = await sync(settings)
        setMessage(describeSync(result))
      } catch (error) {
        if (error instanceof OfflineError) setMessage('Нет сети — показаны сохранённые')
        else if (error instanceof AuthError) setMessage('Токен не подошёл или истёк — проверьте настройки')
        else setMessage(`Не получилось обновить: ${(error as Error).message}`)
      } finally {
        await readLocal()
        setBusy(false)
        syncing.current = false
      }
    },
    [settings, readLocal],
  )

  useEffect(() => {
    if (!ready) return
    void readLocal().then(() => runSync())
    void checkForUpdate(settings.repo).then(setUpdate).catch(() => undefined)
    // намеренно только при готовности настроек: синхронизация при запуске
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Приложение может неделями висеть в фоне: без проверки при возврате
  // плашку обновления можно не увидеть до следующего холодного старта.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      void checkForUpdate(settings.repo).then(setUpdate).catch(() => undefined)
    })
    return () => subscription.remove()
  }, [settings.repo])

  const install = useCallback(async () => {
    if (!update || installing) return
    setInstalling(true)
    setProgress(0)
    try {
      await downloadAndInstall(update, setProgress)
    } catch (error) {
      Alert.alert('Не получилось обновить', (error as Error).message, [
        { text: 'Закрыть', style: 'cancel' },
        { text: 'Открыть в браузере', onPress: () => void Linking.openURL(update.pageUrl) },
      ])
    } finally {
      setInstalling(false)
    }
  }, [update, installing])

  useFocusEffect(
    useCallback(() => {
      void readLocal()
    }, [readLocal]),
  )

  const visible = entries.filter((entry) => !archived.includes(entry.id))
  const tags = [...new Set(visible.flatMap((entry) => entry.tags))].sort()

  const shown = visible.filter((entry) => {
    const matchesQuery =
      query.trim() === '' || entry.title.toLowerCase().includes(query.trim().toLowerCase())
    const matchesTags = activeTags.every((tag) => entry.tags.includes(tag))
    return matchesQuery && matchesTags
  })

  const styles = makeStyles(palette)

  return (
    <FlatList
      data={shown}
      keyExtractor={(entry) => entry.id}
      contentContainerStyle={{ padding: sizes.pad, gap: sizes.gap, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={busy} onRefresh={() => void runSync()} tintColor={palette.accent} />
      }
      ListHeaderComponent={
        <View style={{ gap: sizes.gap, marginBottom: sizes.gap }}>
          {update && (
            <Pressable
              style={styles.banner}
              onPress={() => void install()}
              disabled={installing}
            >
              <Text style={styles.bannerText}>
                {installing
                  ? `Скачивание версии ${update.version} — ${Math.round(progress * 100)}%`
                  : `Доступна версия ${update.version} — нажмите, чтобы обновить`}
              </Text>
              {installing && (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
              )}
            </Pressable>
          )}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск по названию"
            placeholderTextColor={palette.muted}
            style={styles.search}
          />

          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((tag) => {
                const active = activeTags.includes(tag)
                return (
                  <Pressable
                    key={tag}
                    onPress={() =>
                      setActiveTags((current) =>
                        active ? current.filter((t) => t !== tag) : [...current, tag],
                      )
                    }
                    style={[styles.tag, active && styles.tagActive]}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}

          {message && (
            <View style={styles.messageRow}>
              {busy && <ActivityIndicator color={palette.muted} />}
              <Text style={styles.message}>{message}</Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {entries.length === 0
            ? 'Рецептов пока нет. Потяните вниз, чтобы синхронизироваться.'
            : 'Ничего не нашлось. Попробуйте другой запрос или снимите фильтры.'}
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/recipe/${item.id}`)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {fresh.includes(item.id) && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>новое</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardMeta}>
            {item.totalTimeMin} мин · {item.servings} порц. · {item.tags.join(', ')}
          </Text>
        </Pressable>
      )}
    />
  )
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    search: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: sizes.radius,
      paddingHorizontal: sizes.pad,
      minHeight: sizes.tap,
      color: palette.text,
      fontSize: sizes.body,
    },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: {
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    tagActive: { backgroundColor: palette.accent, borderColor: palette.accent },
    tagText: { color: palette.muted, fontSize: sizes.small },
    tagTextActive: { color: palette.accentText },
    card: {
      backgroundColor: palette.surface,
      borderRadius: sizes.radius,
      borderWidth: 1,
      borderColor: palette.border,
      padding: sizes.pad,
      gap: 6,
    },
    cardPressed: { opacity: 0.7 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { color: palette.text, fontSize: sizes.title, fontWeight: '600', flexShrink: 1 },
    cardMeta: { color: palette.muted, fontSize: sizes.small },
    badge: { backgroundColor: palette.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { color: palette.accentText, fontSize: 12, fontWeight: '600' },
    messageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    message: { color: palette.muted, fontSize: sizes.small },
    empty: { color: palette.muted, fontSize: sizes.body, textAlign: 'center', marginTop: 40 },
    banner: {
      backgroundColor: palette.accent,
      borderRadius: sizes.radius,
      padding: sizes.pad,
      minHeight: sizes.tap,
      justifyContent: 'center',
    },
    bannerText: { color: palette.accentText, fontSize: sizes.small, fontWeight: '600' },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.35)',
      marginTop: 10,
      overflow: 'hidden',
    },
    progressFill: { height: 6, backgroundColor: palette.accentText },
  })
