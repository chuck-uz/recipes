import type { Ingredient, Unit } from './types.js'

interface Rounding {
  /** шаг округления */
  step: number
  /** минимальное значение после округления */
  min: number
  /** шаг для значений свыше порога */
  coarseStep?: number
  threshold?: number
}

const ROUNDING: Record<Exclude<Unit, 'to_taste'>, Rounding> = {
  g: { step: 1, min: 1, coarseStep: 5, threshold: 100 },
  ml: { step: 1, min: 1, coarseStep: 5, threshold: 100 },
  kg: { step: 0.1, min: 0.1 },
  l: { step: 0.1, min: 0.1 },
  pcs: { step: 0.5, min: 0.5 },
  tsp: { step: 0.25, min: 0.25 },
  tbsp: { step: 0.25, min: 0.25 },
  pinch: { step: 0.5, min: 0.5 },
}

function roundTo(value: number, step: number): number {
  return Math.round(Math.round((value / step) * 1e6) / 1e6) * step
}

/** Округление после масштабирования по правилам раздела 4.3. */
export function roundForUnit(value: number, unit: Unit): number {
  if (unit === 'to_taste') return value

  const rule = ROUNDING[unit]
  const step = rule.threshold !== undefined && value > rule.threshold ? rule.coarseStep! : rule.step
  const rounded = roundTo(value, step)

  return Math.round(Math.max(rounded, rule.min) * 1e6) / 1e6
}

/**
 * Пересчёт одного ингредиента. Множитель — целевые порции, делённые на порции рецепта.
 * Ингредиенты с scalable: false остаются как есть: лавровый лист, вода для варки, масло для жарки.
 */
export function scaleIngredient(ingredient: Ingredient, factor: number): Ingredient {
  if (ingredient.amount === undefined || ingredient.unit === 'to_taste') return ingredient
  if (ingredient.scalable === false || factor === 1) return ingredient

  return { ...ingredient, amount: roundForUnit(ingredient.amount * factor, ingredient.unit) }
}
