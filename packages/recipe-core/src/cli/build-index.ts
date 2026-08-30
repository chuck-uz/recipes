/**
 * Собирает index.json. Пишет файл только если изменился состав рецептов:
 * иначе меняющийся generatedAt давал бы пустой коммит на каждый запуск.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IndexEntry, Recipe, RecipeIndex } from '../types.js'
import { SUPPORTED_SCHEMA_VERSION } from '../types.js'
import { indexPath, recipesDir } from './paths.js'

const dir = fileURLToPath(recipesDir)
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()

const recipes: IndexEntry[] = files.map((file) => {
  const raw = readFileSync(new URL(file, recipesDir), 'utf8')
  const recipe = JSON.parse(raw) as Recipe
  return {
    id: recipe.id,
    title: recipe.title,
    tags: recipe.tags,
    totalTimeMin: recipe.totalTimeMin,
    servings: recipe.servings,
    updatedAt: recipe.updatedAt,
    file: `recipes/${file}`,
    sha256: createHash('sha256').update(raw).digest('hex'),
  }
})

const previous: RecipeIndex | null = existsSync(indexPath)
  ? (JSON.parse(readFileSync(indexPath, 'utf8')) as RecipeIndex)
  : null

const unchanged =
  previous !== null && JSON.stringify(previous.recipes) === JSON.stringify(recipes)

if (unchanged) {
  console.log(`index.json без изменений (${recipes.length}).`)
  process.exit(0)
}

const index: RecipeIndex = {
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  recipes,
}

writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(`index.json обновлён: рецептов ${recipes.length}.`)
