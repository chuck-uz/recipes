import { formatQuantity, type FormatOptions } from './format.js'
import { scaleIngredient } from './scale.js'
import type { Ingredient, Recipe, Step } from './types.js'

export const PLACEHOLDER = /\{([a-zA-Z0-9_-]+)\}/g

export interface RenderedIngredient extends Ingredient {
  /** готовая строка: «500 г», «½ чайной ложки», «по вкусу» */
  display: string
  /** false — количество намеренно не пересчитывалось */
  scaled: boolean
}

export interface RenderedRecipe extends Omit<Recipe, 'ingredients' | 'steps'> {
  ingredients: RenderedIngredient[]
  steps: Step[]
  /** порции, на которые пересчитан рецепт */
  servingsShown: number
}

/**
 * Пересчитывает рецепт на нужное число порций и подставляет количества в текст шагов.
 * Плейсхолдер несёт только количество с единицей — названия ингредиентов
 * пишет автор текста, приложение их не склоняет (раздел 5 SPEC.md).
 */
export function renderRecipe(
  recipe: Recipe,
  servings: number,
  options: FormatOptions = {},
): RenderedRecipe {
  const factor = servings / recipe.servings

  const ingredients: RenderedIngredient[] = recipe.ingredients.map((ingredient) => {
    const scaled = scaleIngredient(ingredient, factor)
    return {
      ...scaled,
      display: formatQuantity(scaled.amount, scaled.unit, options),
      scaled: ingredient.scalable !== false,
    }
  })

  const byId = new Map(ingredients.map((i) => [i.id, i]))

  const steps = recipe.steps.map((step) => ({
    ...step,
    text: step.text.replace(PLACEHOLDER, (match, id: string) => byId.get(id)?.display ?? match),
  }))

  return { ...recipe, ingredients, steps, servingsShown: servings }
}
