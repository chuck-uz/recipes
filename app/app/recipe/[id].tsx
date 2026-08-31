import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { renderRecipe, type Recipe } from '../../src/core'
import { deleteRecipeFile, NoTokenError, WriteForbiddenError } from '../../src/github'
import { useSettings } from '../../src/settings-context'
import * as storage from '../../src/storage'
import { sizes, usePalette, type Palette } from '../../src/theme'

const MIN_SERVINGS = 1
const MAX_SERVINGS = 12

export default function RecipeCard() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { settings } = useSettings()
  const palette = usePalette(settings.theme)
  const router = useRouter()

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [servings, setServings] = useState(4)
  const [checked, setChecked] = useState<string[]>([])
  const [missing, setMissing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    void (async () => {
      const loaded = await storage.getRecipe(id)
      if (!loaded) {
        setMissing(true)
        return
      }
      const session = await storage.getSession(id)
      setRecipe(loaded)
      setServings(session?.servings ?? loaded.servings)
      setChecked(session?.checked ?? [])
      void storage.clearFresh(id)
    })()
  }, [id])

  const persist = useCallback(
    (next: { servings?: number; checked?: string[] }) => {
      if (!id || !recipe) return
      void storage.saveSession({
        recipeId: id,
        servings: next.servings ?? servings,
        stepIndex: 0,
        checked: next.checked ?? checked,
        updatedAt: Date.now(),
      })
    },
    [id, recipe, servings, checked],
  )

  const changeServings = (value: number) => {
    const clamped = Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(value)))
    setServings(clamped)
    persist({ servings: clamped })
  }

  const toggle = (ingredientId: string) => {
    const next = checked.includes(ingredientId)
      ? checked.filter((x) => x !== ingredientId)
      : [...checked, ingredientId]
    setChecked(next)
    persist({ checked: next })
  }

  /**
   * Удаляет файл из репозитория. Локально прячем сразу, не дожидаясь CI:
   * индекс пересоберётся через минуту, и синхронизация подтвердит удаление.
   */
  const remove = async () => {
    if (!recipe || deleting) return
    setDeleting(true)
    try {
      await deleteRecipeFile(settings, `recipes/${recipe.id}.json`, recipe.title)
      await storage.setArchived([...(await storage.getArchived()), recipe.id])
      await storage.clearSession(recipe.id)
      router.back()
    } catch (error) {
      const message =
        error instanceof NoTokenError
          ? 'В настройках нет токена GitHub. Нужен токен с правом записи в репозиторий.'
          : error instanceof WriteForbiddenError
            ? `${(error as Error).message}. Проверьте права токена в настройках.`
            : (error as Error).message
      Alert.alert('Не получилось удалить', message)
    } finally {
      setDeleting(false)
    }
  }

  const confirmRemove = () => {
    if (!recipe) return
    Alert.alert(
      'Удалить рецепт?',
      `«${recipe.title}» исчезнет из репозитория и со всех устройств. Историю правок git сохранит, но в приложении рецепта не будет.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => void remove() },
      ],
    )
  }

  const styles = makeStyles(palette)

  if (missing) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Рецепт не найден на устройстве. Синхронизируйтесь на главном экране.</Text>
      </View>
    )
  }

  if (!recipe) return <View style={styles.centered} />

  const rendered = renderRecipe(recipe, servings, { abbreviated: settings.abbreviated })

  return (
    <ScrollView contentContainerStyle={{ padding: sizes.pad, gap: sizes.gap, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: recipe.title }} />

      <Text style={styles.title}>{recipe.title}</Text>
      {recipe.description !== '' && <Text style={styles.description}>{recipe.description}</Text>}
      <Text style={styles.meta}>
        {recipe.totalTimeMin} мин · {recipe.tags.join(', ')}
      </Text>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Порции</Text>
        <View style={styles.servingsRow}>
          <Pressable style={styles.step} onPress={() => changeServings(servings - 1)}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <TextInput
            value={String(servings)}
            onChangeText={(text) => {
              const parsed = Number.parseInt(text.replace(/\D/g, ''), 10)
              if (!Number.isNaN(parsed)) changeServings(parsed)
            }}
            keyboardType="number-pad"
            style={styles.servingsInput}
          />
          <Pressable style={styles.step} onPress={() => changeServings(servings + 1)}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Ингредиенты</Text>
        {rendered.ingredients.map((ingredient) => {
          const isChecked = checked.includes(ingredient.id)
          return (
            <Pressable key={ingredient.id} style={styles.ingredient} onPress={() => toggle(ingredient.id)}>
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
        {rendered.ingredients.some((i) => !i.scaled) && (
          <Text style={styles.hint}>Отмеченные цветом количества намеренно не пересчитываются.</Text>
        )}
      </View>

      {recipe.notes !== undefined && recipe.notes !== '' && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Заметки</Text>
          <Text style={styles.description}>{recipe.notes}</Text>
        </View>
      )}

      <Pressable
        style={styles.cook}
        onPress={() => router.push({ pathname: '/cook/[id]', params: { id: recipe.id, servings } })}
      >
        <Text style={styles.cookText}>Готовить</Text>
      </Pressable>

      <Pressable style={styles.remove} onPress={confirmRemove} disabled={deleting}>
        {deleting ? (
          <ActivityIndicator color={palette.danger} />
        ) : (
          <Text style={styles.removeText}>Удалить рецепт</Text>
        )}
      </Pressable>
    </ScrollView>
  )
}

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: sizes.pad },
    muted: { color: palette.muted, fontSize: sizes.body, textAlign: 'center' },
    title: { color: palette.text, fontSize: 26, fontWeight: '700' },
    description: { color: palette.text, fontSize: sizes.body, lineHeight: 24 },
    meta: { color: palette.muted, fontSize: sizes.small },
    block: {
      backgroundColor: palette.surface,
      borderRadius: sizes.radius,
      borderWidth: 1,
      borderColor: palette.border,
      padding: sizes.pad,
      gap: sizes.gap,
    },
    blockTitle: { color: palette.muted, fontSize: sizes.small, textTransform: 'uppercase', letterSpacing: 1 },
    servingsRow: { flexDirection: 'row', alignItems: 'center', gap: sizes.gap },
    step: {
      width: sizes.tap,
      height: sizes.tap,
      borderRadius: sizes.radius,
      backgroundColor: palette.background,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: { color: palette.text, fontSize: 26, fontWeight: '600' },
    servingsInput: {
      minWidth: 72,
      height: sizes.tap,
      textAlign: 'center',
      color: palette.text,
      fontSize: sizes.title,
      fontWeight: '600',
      borderRadius: sizes.radius,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.background,
    },
    ingredient: { flexDirection: 'row', alignItems: 'center', gap: sizes.gap, minHeight: 44 },
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
    hint: { color: palette.muted, fontSize: 13 },
    cook: {
      backgroundColor: palette.accent,
      borderRadius: sizes.radius,
      minHeight: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cookText: { color: palette.accentText, fontSize: 20, fontWeight: '700' },
    remove: {
      minHeight: sizes.tap,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    removeText: { color: palette.danger, fontSize: sizes.body },
  })
