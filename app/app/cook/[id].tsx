import { useKeepAwake } from 'expo-keep-awake'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { renderRecipe, type Recipe } from '../../src/core'
import { useSettings } from '../../src/settings-context'
import * as storage from '../../src/storage'
import {
  formatDuration,
  formatRemaining,
  forgetTimer,
  loadTimers,
  openClock,
  startTimer,
  TimersUnavailableError,
  type ActiveTimer,
} from '../../src/timers'
import { sizes, usePalette, type Palette } from '../../src/theme'

export default function CookMode() {
  useKeepAwake()

  const { id, servings: servingsParam } = useLocalSearchParams<{ id: string; servings?: string }>()
  const { settings } = useSettings()
  const palette = usePalette(settings.theme)
  const navigation = useNavigation()

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [servings, setServings] = useState(4)
  const [stepIndex, setStepIndex] = useState(0)
  const [checked, setChecked] = useState<string[]>([])
  const [timers, setTimers] = useState<ActiveTimer[]>([])
  const [showIngredients, setShowIngredients] = useState(false)
  const [editingMinutes, setEditingMinutes] = useState<string | null>(null)
  const [, forceTick] = useState(0)

  const restored = useRef(false)

  useEffect(() => {
    if (!id) return
    void (async () => {
      const loaded = await storage.getRecipe(id)
      if (!loaded) return
      setRecipe(loaded)

      const session = await storage.getSession(id)
      const fromParam = servingsParam ? Number.parseInt(servingsParam, 10) : Number.NaN
      setServings(Number.isNaN(fromParam) ? session?.servings ?? loaded.servings : fromParam)
      setChecked(session?.checked ?? [])
      setTimers(await loadTimers())

      // Готовка, прерванная меньше шести часов назад, предлагается к продолжению.
      if (session && session.stepIndex > 0 && !restored.current) {
        restored.current = true
        Alert.alert(
          'Продолжить готовку?',
          `Вы остановились на шаге ${session.stepIndex + 1} из ${loaded.steps.length}.`,
          [
            { text: 'Начать заново', style: 'destructive', onPress: () => setStepIndex(0) },
            { text: `Продолжить с шага ${session.stepIndex + 1}`, onPress: () => setStepIndex(session.stepIndex) },
          ],
        )
      }
    })()
  }, [id, servingsParam])

  // Обратный отсчёт считается от абсолютного времени окончания,
  // поэтому тик нужен только для перерисовки.
  useEffect(() => {
    if (timers.length === 0) return
    const handle = setInterval(() => {
      forceTick((n) => n + 1)
      setTimers((current) => current.filter((timer) => timer.endsAt > Date.now()))
    }, 1000)
    return () => clearInterval(handle)
  }, [timers.length])

  const save = useCallback(
    (next: { stepIndex?: number; checked?: string[] }) => {
      if (!id) return
      void storage.saveSession({
        recipeId: id,
        servings,
        stepIndex: next.stepIndex ?? stepIndex,
        checked: next.checked ?? checked,
        updatedAt: Date.now(),
      })
    },
    [id, servings, stepIndex, checked],
  )

  // Выход из режима с подтверждением, если таймеры ещё идут.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (timers.length === 0) return
      event.preventDefault()
      Alert.alert('Выйти из режима готовки?', 'Таймеры продолжат идти в приложении «Часы».', [
        { text: 'Остаться', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ])
    })
    return unsubscribe
  }, [navigation, timers.length])

  const styles = makeStyles(palette)

  if (!recipe) return <View style={styles.screen} />

  const rendered = renderRecipe(recipe, servings, { abbreviated: settings.abbreviated })
  const step = rendered.steps[stepIndex]
  if (!step) return <View style={styles.screen} />

  const go = (delta: number) => {
    const next = Math.min(rendered.steps.length - 1, Math.max(0, stepIndex + delta))
    setStepIndex(next)
    save({ stepIndex: next })
  }

  const launchTimer = async (seconds: number) => {
    try {
      await startTimer(seconds, step.title)
      setTimers(await loadTimers())
    } catch (error) {
      const message =
        error instanceof TimersUnavailableError
          ? 'Приложение «Часы» не приняло таймер. Поставьте его вручную.'
          : (error as Error).message
      Alert.alert('Таймер не запустился', message)
    }
  }

  const finished = stepIndex === rendered.steps.length - 1

  return (
    <View style={styles.screen}>
      {timers.length > 0 && (
        <View style={styles.timerBar}>
          {timers.map((timer) => (
            <Pressable key={timer.key} style={styles.timerChip} onPress={() => void openClock()}>
              <Text style={styles.timerText} numberOfLines={1}>
                ⏱ {timer.label} — {formatRemaining(timer.endsAt)}
              </Text>
              <Pressable
                hitSlop={10}
                onPress={() => void forgetTimer(timer.key).then(setTimers)}
                style={styles.timerClose}
              >
                <Text style={styles.timerCloseText}>×</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.progress}>
          Шаг {stepIndex + 1} из {rendered.steps.length}
        </Text>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepText}>{step.text}</Text>

        {step.timerSec !== undefined && (
          <View style={styles.timerBlock}>
            {editingMinutes === null ? (
              <>
                <Pressable style={styles.timerButton} onPress={() => void launchTimer(step.timerSec!)}>
                  <Text style={styles.timerButtonText}>
                    Запустить таймер · {formatDuration(step.timerSec)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditingMinutes(String(Math.round(step.timerSec! / 60)))}
                  style={styles.link}
                >
                  <Text style={styles.linkText}>Изменить время</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.editRow}>
                <TextInput
                  value={editingMinutes}
                  onChangeText={(text) => setEditingMinutes(text.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  autoFocus
                  style={styles.minutesInput}
                />
                <Text style={styles.minutesLabel}>мин</Text>
                <Pressable
                  style={styles.timerButtonSmall}
                  onPress={() => {
                    const minutes = Number.parseInt(editingMinutes, 10)
                    setEditingMinutes(null)
                    if (!Number.isNaN(minutes) && minutes > 0) void launchTimer(minutes * 60)
                  }}
                >
                  <Text style={styles.timerButtonText}>Запустить</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.controls}>
        <Pressable
          style={[styles.navButton, stepIndex === 0 && styles.navButtonOff]}
          disabled={stepIndex === 0}
          onPress={() => go(-1)}
        >
          <Text style={styles.navText}>Назад</Text>
        </Pressable>

        <Pressable style={styles.sheetButton} onPress={() => setShowIngredients(true)}>
          <Text style={styles.sheetButtonText}>Ингредиенты</Text>
        </Pressable>

        <Pressable
          style={[styles.navButton, styles.navPrimary, finished && styles.navButtonOff]}
          disabled={finished}
          onPress={() => go(1)}
        >
          <Text style={[styles.navText, styles.navPrimaryText]}>Далее</Text>
        </Pressable>
      </View>

      <Modal visible={showIngredients} animationType="slide" transparent onRequestClose={() => setShowIngredients(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowIngredients(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Ингредиенты · {servings} порц.</Text>
            <ScrollView>
              {rendered.ingredients.map((ingredient) => {
                const isChecked = checked.includes(ingredient.id)
                return (
                  <Pressable
                    key={ingredient.id}
                    style={styles.ingredient}
                    onPress={() => {
                      const next = isChecked
                        ? checked.filter((x) => x !== ingredient.id)
                        : [...checked, ingredient.id]
                      setChecked(next)
                      save({ checked: next })
                    }}
                  >
                    <View style={[styles.checkbox, isChecked && styles.checkboxOn]}>
                      {isChecked && <Text style={styles.checkboxMark}>✓</Text>}
                    </View>
                    <Text style={[styles.ingredientName, isChecked && styles.ingredientDone]}>
                      {ingredient.name}
                    </Text>
                    <Text style={[styles.amount, !ingredient.scaled && styles.amountFixed]}>
                      {ingredient.display}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    body: { padding: sizes.pad, gap: sizes.gap, paddingBottom: 32 },
    progress: { color: palette.muted, fontSize: sizes.small, letterSpacing: 1 },
    stepTitle: { color: palette.text, fontSize: sizes.cookTitle, fontWeight: '700' },
    stepText: { color: palette.text, fontSize: sizes.cookBody, lineHeight: 32 },
    timerBlock: { gap: 8, marginTop: sizes.gap },
    timerButton: {
      backgroundColor: palette.accent,
      borderRadius: sizes.radius,
      minHeight: 60,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: sizes.pad,
    },
    timerButtonSmall: {
      backgroundColor: palette.accent,
      borderRadius: sizes.radius,
      minHeight: sizes.tap,
      paddingHorizontal: sizes.pad,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timerButtonText: { color: palette.accentText, fontSize: 18, fontWeight: '700' },
    link: { alignSelf: 'flex-start', paddingVertical: 8 },
    linkText: { color: palette.muted, fontSize: sizes.small, textDecorationLine: 'underline' },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: sizes.gap },
    minutesInput: {
      width: 88,
      minHeight: sizes.tap,
      borderRadius: sizes.radius,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      color: palette.text,
      fontSize: sizes.title,
      textAlign: 'center',
    },
    minutesLabel: { color: palette.muted, fontSize: sizes.body },
    controls: {
      flexDirection: 'row',
      gap: sizes.gap,
      padding: sizes.pad,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      backgroundColor: palette.surface,
    },
    navButton: {
      flex: 1,
      minHeight: 60,
      borderRadius: sizes.radius,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navPrimary: { backgroundColor: palette.accent, borderColor: palette.accent },
    navPrimaryText: { color: palette.accentText },
    navButtonOff: { opacity: 0.35 },
    navText: { color: palette.text, fontSize: 18, fontWeight: '600' },
    sheetButton: { minHeight: 60, paddingHorizontal: sizes.pad, alignItems: 'center', justifyContent: 'center' },
    sheetButtonText: { color: palette.muted, fontSize: sizes.small },
    timerBar: {
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingHorizontal: sizes.pad,
      paddingVertical: 8,
      gap: 6,
    },
    timerChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    timerText: { color: palette.text, fontSize: sizes.body, fontWeight: '600', flexShrink: 1 },
    timerClose: { paddingHorizontal: 8 },
    timerCloseText: { color: palette.muted, fontSize: 22 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: palette.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: sizes.pad,
      gap: sizes.gap,
      maxHeight: '75%',
    },
    sheetTitle: { color: palette.muted, fontSize: sizes.small, textTransform: 'uppercase', letterSpacing: 1 },
    ingredient: { flexDirection: 'row', alignItems: 'center', gap: sizes.gap, minHeight: 48 },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: palette.accent, borderColor: palette.accent },
    checkboxMark: { color: palette.accentText, fontSize: 16, fontWeight: '700' },
    ingredientName: { color: palette.text, fontSize: sizes.body, flex: 1 },
    ingredientDone: { color: palette.muted, textDecorationLine: 'line-through' },
    amount: { color: palette.text, fontSize: sizes.body, fontWeight: '600' },
    amountFixed: { color: palette.fixed },
  })
