import { describe, expect, it } from 'vitest'
import { scaleIngredient, type Ingredient } from '../src/index.js'

const ing = (over: Partial<Ingredient>): Ingredient => ({
  id: 'x', name: 'тест', amount: 1, unit: 'g', ...over,
})

describe('масштабирование', () => {
  it('граммы до 100 — до целых', () => {
    expect(scaleIngredient(ing({ amount: 50, unit: 'g' }), 1.5).amount).toBe(75)
    expect(scaleIngredient(ing({ amount: 30, unit: 'g' }), 1.1).amount).toBe(33)
  })

  it('граммы свыше 100 — до 5', () => {
    expect(scaleIngredient(ing({ amount: 500, unit: 'g' }), 1.5).amount).toBe(750)
    expect(scaleIngredient(ing({ amount: 500, unit: 'g' }), 0.375).amount).toBe(190)
    expect(scaleIngredient(ing({ amount: 250, unit: 'g' }), 0.7).amount).toBe(175)
  })

  it('миллилитры — как граммы', () => {
    expect(scaleIngredient(ing({ amount: 200, unit: 'ml' }), 1.5).amount).toBe(300)
    expect(scaleIngredient(ing({ amount: 80, unit: 'ml' }), 1.3).amount).toBe(105)
  })

  it('килограммы и литры — до десятых', () => {
    expect(scaleIngredient(ing({ amount: 2, unit: 'l' }), 1.25).amount).toBe(2.5)
    expect(scaleIngredient(ing({ amount: 1, unit: 'kg' }), 1.33).amount).toBe(1.3)
  })

  it('штуки — до половины, не меньше половины', () => {
    expect(scaleIngredient(ing({ amount: 2, unit: 'pcs' }), 1.5).amount).toBe(3)
    expect(scaleIngredient(ing({ amount: 2, unit: 'pcs' }), 0.75).amount).toBe(1.5)
    expect(scaleIngredient(ing({ amount: 1, unit: 'pcs' }), 0.25).amount).toBe(0.5)
  })

  it('ложки — до четверти, не меньше четверти', () => {
    expect(scaleIngredient(ing({ amount: 1, unit: 'tsp' }), 0.5).amount).toBe(0.5)
    expect(scaleIngredient(ing({ amount: 1, unit: 'tsp' }), 0.3).amount).toBe(0.25)
    expect(scaleIngredient(ing({ amount: 1, unit: 'tbsp' }), 2.6).amount).toBe(2.5)
    expect(scaleIngredient(ing({ amount: 1, unit: 'tsp' }), 0.05).amount).toBe(0.25)
  })

  it('граммы не опускаются ниже 1', () => {
    expect(scaleIngredient(ing({ amount: 2, unit: 'g' }), 0.1).amount).toBe(1)
  })

  it('scalable: false — количество не меняется', () => {
    const water = ing({ amount: 2, unit: 'l', scalable: false })
    expect(scaleIngredient(water, 4).amount).toBe(2)
    expect(scaleIngredient(water, 0.5).amount).toBe(2)
  })

  it('по вкусу — не масштабируется', () => {
    const salt = ing({ amount: undefined, unit: 'to_taste' })
    expect(scaleIngredient(salt, 3).amount).toBeUndefined()
  })

  it('множитель 1 ничего не портит', () => {
    expect(scaleIngredient(ing({ amount: 500, unit: 'g' }), 1).amount).toBe(500)
    expect(scaleIngredient(ing({ amount: 1, unit: 'tsp' }), 1).amount).toBe(1)
  })
})
