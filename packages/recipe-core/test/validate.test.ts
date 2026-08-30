import { describe, expect, it } from 'vitest'
import { validateRecipe, type Recipe } from '../src/index'

const base = (): Recipe => ({
  schemaVersion: 1,
  id: 'kurinyj-sup',
  version: 1,
  title: 'Куриный суп',
  description: 'Суп на втором бульоне.',
  tags: ['суп'],
  servings: 4,
  totalTimeMin: 70,
  ingredients: [{ id: 'chicken', name: 'куриная грудка', amount: 500, unit: 'g' }],
  steps: [{ id: 's1', title: 'Варка', text: 'Варите курицу ({chicken}) 30 минут.', timerSec: 1800 }],
  notes: '',
  createdAt: '2026-08-30',
  updatedAt: '2026-08-30',
  source: 'claude-chat',
})

const errors = (r: unknown, file = 'kurinyj-sup.json') =>
  validateRecipe(r, { fileName: file }).errors.map((e) => e.code)

describe('валидация', () => {
  it('корректный рецепт проходит', () => {
    expect(validateRecipe(base(), { fileName: 'kurinyj-sup.json' }).ok).toBe(true)
  })

  it('id должен совпадать с именем файла', () => {
    expect(errors(base(), 'drugoe-imya.json')).toContain('id-filename-mismatch')
  })

  it('id только латиница и дефисы', () => {
    expect(errors({ ...base(), id: 'Куриный_суп' }, 'Куриный_суп.json')).toContain('schema')
  })

  it('неизвестная единица отклоняется', () => {
    const r = base()
    r.ingredients[0]!.unit = 'cup' as never
    expect(errors(r)).toContain('schema')
  })

  it('плейсхолдер без ингредиента — ошибка', () => {
    const r = base()
    r.steps[0]!.text = 'Варите курицу ({beef}) 30 минут.'
    expect(errors(r)).toContain('unknown-placeholder')
  })

  it('ингредиент, не упомянутый ни в одном шаге, — предупреждение, а не ошибка', () => {
    const r = base()
    r.ingredients.push({ id: 'salt', name: 'соль', amount: 1, unit: 'tsp' })
    const result = validateRecipe(r, { fileName: 'kurinyj-sup.json' })
    expect(result.ok).toBe(true)
    expect(result.warnings.map((w) => w.code)).toContain('unused-ingredient')
  })

  it('to_taste не должен иметь amount', () => {
    const r = base()
    r.ingredients.push({ id: 'pepper', name: 'перец', amount: 1, unit: 'to_taste' })
    expect(errors(r)).toContain('to-taste-with-amount')
  })

  it('обычная единица без amount — ошибка', () => {
    const r = base()
    r.ingredients.push({ id: 'salt', name: 'соль', unit: 'tsp' })
    expect(errors(r)).toContain('missing-amount')
  })

  it('дублирующиеся id ингредиентов', () => {
    const r = base()
    r.ingredients.push({ id: 'chicken', name: 'ещё курица', amount: 100, unit: 'g' })
    expect(errors(r)).toContain('duplicate-ingredient-id')
  })

  it('будущая schemaVersion отклоняется внятно', () => {
    expect(errors({ ...base(), schemaVersion: 2 })).toContain('unsupported-schema-version')
  })

  it('стоп-слово в notes ловится', () => {
    const r = { ...base(), notes: 'Помогает при гепатозе' }
    expect(errors(r)).toContain('stopword')
  })

  it('стоп-слово в описании ловится с учётом формы слова', () => {
    const r = { ...base(), description: 'Диета после УЗИ печени.' }
    expect(errors(r)).toContain('stopword')
  })

  it('дополнительные стоп-слова приходят извне', () => {
    const r = { ...base(), title: 'Суп для Михаила' }
    const result = validateRecipe(r, { fileName: 'kurinyj-sup.json', extraStopWords: ['михаил'] })
    expect(result.errors.map((e) => e.code)).toContain('stopword')
  })

  it('слово «диетический» разрешено', () => {
    const r = { ...base(), tags: ['суп', 'диетическое'], description: 'Диетический суп.' }
    expect(validateRecipe(r, { fileName: 'kurinyj-sup.json' }).ok).toBe(true)
  })

  it('таймер должен быть положительным целым', () => {
    const r = base()
    r.steps[0]!.timerSec = 0
    expect(errors(r)).toContain('schema')
  })
})
