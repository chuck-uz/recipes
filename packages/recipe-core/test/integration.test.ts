import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderRecipe, type Recipe, type RecipeIndex } from '../src/index'

const recipesDir = fileURLToPath(new URL('../../../recipes/', import.meta.url))
const read = (file: string) => JSON.parse(readFileSync(recipesDir + file, 'utf8')) as Recipe

const soup = read('kurinyj-sup-dieticheskij.json')

/** Ингредиент как его увидит пользователь. */
const shown = (recipe: Recipe, servings: number, id: string) =>
  renderRecipe(recipe, servings).ingredients.find((i) => i.id === id)?.display

describe('куриный суп на разном числе порций', () => {
  it('4 порции — как записано', () => {
    expect(shown(soup, 4, 'chicken')).toBe('500 г')
    expect(shown(soup, 4, 'potato')).toBe('3 шт.')
    expect(shown(soup, 4, 'salt')).toBe('1 чайная ложка')
    expect(shown(soup, 4, 'dill')).toBe('по вкусу')
  })

  it('2 порции — половина, склонения в родительном', () => {
    expect(shown(soup, 2, 'chicken')).toBe('250 г')
    expect(shown(soup, 2, 'potato')).toBe('1½ шт.')
    expect(shown(soup, 2, 'rice')).toBe('30 г')
    expect(shown(soup, 2, 'salt')).toBe('½ чайной ложки')
  })

  it('6 порций — полтора раза', () => {
    expect(shown(soup, 6, 'chicken')).toBe('750 г')
    expect(shown(soup, 6, 'potato')).toBe('4½ шт.')
    expect(shown(soup, 6, 'salt')).toBe('1½ чайной ложки')
  })

  it('8 порций — граммы переходят в килограммы, ложек становится две', () => {
    expect(shown(soup, 8, 'chicken')).toBe('1 кг')
    expect(shown(soup, 8, 'salt')).toBe('2 чайные ложки')
  })

  it('лавровый лист не растёт ни на каком числе порций', () => {
    for (const servings of [1, 2, 6, 8, 12]) {
      expect(shown(soup, servings, 'bayleaf')).toBe('1 шт.')
    }
  })

  // Бульон — это само блюдо, а не среда для отваривания: вдвое больше супа
  // требует вдвое больше воды.
  it('бульон растёт вместе с порциями', () => {
    expect(shown(soup, 2, 'water')).toBe('1 л')
    expect(shown(soup, 4, 'water')).toBe('2 л')
    expect(shown(soup, 8, 'water')).toBe('4 л')
  })

  it('количества подставляются в текст шагов', () => {
    const rendered = renderRecipe(soup, 8)
    expect(rendered.steps[0]?.text).toContain('куриную грудку (1 кг)')
    expect(rendered.steps[1]?.text).toContain('свежей водой (4 л)')
    expect(rendered.steps[4]?.text).toContain('посолите (2 чайные ложки)')
  })

  it('таймеры не зависят от порций', () => {
    const four = renderRecipe(soup, 4).steps.map((s) => s.timerSec)
    const twelve = renderRecipe(soup, 12).steps.map((s) => s.timerSec)
    expect(twelve).toEqual(four)
  })

  it('в тексте шагов не остаётся неразвёрнутых плейсхолдеров', () => {
    for (const file of readdirSync(recipesDir).filter((f) => f.endsWith('.json'))) {
      for (const step of renderRecipe(read(file), 4).steps) {
        expect(step.text).not.toMatch(/\{[a-zA-Z0-9_-]+\}/)
      }
    }
  })
})

describe('контракт index.json', () => {
  it('индекс описывает все рецепты в нужной форме', () => {
    const index = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../index.json', import.meta.url)), 'utf8'),
    ) as RecipeIndex

    const files = readdirSync(recipesDir).filter((f) => f.endsWith('.json'))
    expect(index.recipes).toHaveLength(files.length)
    expect(typeof index.generatedAt).toBe('string')

    for (const entry of index.recipes) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/)
      expect(entry.file).toBe(`recipes/${entry.id}.json`)
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(typeof entry.title).toBe('string')
      expect(Array.isArray(entry.tags)).toBe(true)
      expect(entry.totalTimeMin).toBeGreaterThan(0)
      expect(entry.servings).toBeGreaterThan(0)
      expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
