import { describe, expect, it } from 'vitest'
import { renderRecipe, type Recipe } from '../src/index'

const recipe: Recipe = {
  schemaVersion: 1,
  id: 'test',
  version: 1,
  title: 'Тест',
  description: '',
  tags: [],
  servings: 4,
  totalTimeMin: 30,
  ingredients: [
    { id: 'chicken', name: 'куриная грудка', amount: 500, unit: 'g' },
    { id: 'water', name: 'вода', amount: 2, unit: 'l', scalable: false },
    { id: 'salt', name: 'соль', amount: 1, unit: 'tsp' },
    { id: 'pepper', name: 'перец', unit: 'to_taste' },
  ],
  steps: [
    { id: 's1', title: 'Шаг', text: 'Положите куриную грудку ({chicken}) и залейте водой ({water}).' },
    { id: 's2', title: 'Соль', text: 'Посолите ({salt}) и поперчите ({pepper}).', timerSec: 300 },
  ],
  notes: '',
  createdAt: '2026-08-30',
  updatedAt: '2026-08-30',
  source: 'claude-chat',
}

describe('подстановка количеств в шаги', () => {
  it('исходные порции', () => {
    const r = renderRecipe(recipe, 4)
    expect(r.steps[0]!.text).toBe('Положите куриную грудку (500 г) и залейте водой (2 л).')
    expect(r.steps[1]!.text).toBe('Посолите (1 чайная ложка) и поперчите (по вкусу).')
  })

  it('удвоенные порции: вода не растёт, соль растёт', () => {
    const r = renderRecipe(recipe, 8)
    expect(r.steps[0]!.text).toBe('Положите куриную грудку (1 кг) и залейте водой (2 л).')
    expect(r.steps[1]!.text).toBe('Посолите (2 чайные ложки) и поперчите (по вкусу).')
  })

  it('половина порций', () => {
    const r = renderRecipe(recipe, 2)
    expect(r.steps[0]!.text).toBe('Положите куриную грудку (250 г) и залейте водой (2 л).')
    expect(r.steps[1]!.text).toBe('Посолите (½ чайной ложки) и поперчите (по вкусу).')
  })

  it('шесть порций', () => {
    const r = renderRecipe(recipe, 6)
    expect(r.steps[0]!.text).toBe('Положите куриную грудку (750 г) и залейте водой (2 л).')
    expect(r.steps[1]!.text).toBe('Посолите (1½ чайной ложки) и поперчите (по вкусу).')
  })

  it('таймер не масштабируется', () => {
    expect(renderRecipe(recipe, 12).steps[1]!.timerSec).toBe(300)
  })

  it('ингредиенты отдаются готовыми строками', () => {
    const r = renderRecipe(recipe, 8)
    expect(r.ingredients[0]!.display).toBe('1 кг')
    expect(r.ingredients[1]!.display).toBe('2 л')
    expect(r.ingredients[1]!.scaled).toBe(false)
    expect(r.ingredients[3]!.display).toBe('по вкусу')
  })

  it('сокращения включаются настройкой', () => {
    const r = renderRecipe(recipe, 4, { abbreviated: true })
    expect(r.steps[1]!.text).toBe('Посолите (1 ч. л.) и поперчите (по вкусу).')
  })

  it('граммы переходят в килограммы после 1000', () => {
    const r = renderRecipe(recipe, 12)
    expect(r.steps[0]!.text).toContain('1,5 кг')
  })
})
