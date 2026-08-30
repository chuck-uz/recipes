/**
 * Проверяет все рецепты. Красный статус означает, что рецепт не попал в приложение.
 * Личные имена приходят из секрета RECIPES_STOPWORDS; локально проверка их пропускает.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extraStopWordsFromEnv } from '../stopwords'
import { validateRecipe } from '../validate'
import { recipesDir } from './paths'

const dir = fileURLToPath(recipesDir)
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
const extraStopWords = extraStopWordsFromEnv()

let failed = 0
const seenIds = new Map<string, string>()

if (files.length === 0) {
  console.log('Рецептов пока нет.')
  process.exit(0)
}

for (const file of files) {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(new URL(file, recipesDir), 'utf8'))
  } catch (error) {
    failed++
    console.error(`✗ ${file}\n    не разбирается как JSON: ${(error as Error).message}`)
    continue
  }

  const result = validateRecipe(parsed, { fileName: file, extraStopWords })
  const id = (parsed as { id?: string }).id

  if (id && seenIds.has(id)) {
    result.errors.push({
      code: 'duplicate-id',
      message: `id «${id}» уже занят файлом ${seenIds.get(id)}`,
    })
  }
  if (id) seenIds.set(id, file)

  for (const warning of result.warnings) console.warn(`  ! ${file}: ${warning.message}`)

  if (result.errors.length > 0) {
    failed++
    console.error(`✗ ${file}`)
    for (const error of result.errors) console.error(`    [${error.code}] ${error.message}`)
  } else {
    console.log(`✓ ${file}`)
  }
}

if (failed > 0) {
  console.error(`\nНе прошли проверку: ${failed} из ${files.length}.`)
  process.exit(1)
}

console.log(`\nВсе рецепты в порядке: ${files.length}.`)
