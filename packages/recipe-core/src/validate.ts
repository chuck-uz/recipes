import Ajv2020 from 'ajv/dist/2020.js'
import type { ErrorObject } from 'ajv'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PLACEHOLDER } from './render.js'
import { findStopWords } from './stopwords.js'
import { SUPPORTED_SCHEMA_VERSION, type Recipe } from './types.js'

const schemaPath = fileURLToPath(new URL('../../../schema/recipe.schema.json', import.meta.url))
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validateSchema = ajv.compile(schema)

export interface Issue {
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
}

export interface ValidateOptions {
  /** имя файла без пути — должно совпадать с id */
  fileName: string
  /** личные имена из секрета GitHub Actions */
  extraStopWords?: string[]
}

function schemaIssues(errors: ErrorObject[] | null | undefined): Issue[] {
  return (errors ?? []).map((e) => ({
    code: 'schema',
    message: `${e.instancePath || '/'} ${e.message ?? 'не проходит схему'}`,
  }))
}

/** Поля, в которых ищутся стоп-слова. */
function textFields(recipe: Recipe): Array<[string, string]> {
  return [
    ['title', recipe.title],
    ['description', recipe.description],
    ['notes', recipe.notes ?? ''],
    ...(recipe.tags ?? []).map((t, i): [string, string] => [`tags[${i}]`, t]),
    ...recipe.steps.flatMap((s, i): Array<[string, string]> => [
      [`steps[${i}].title`, s.title],
      [`steps[${i}].text`, s.text],
    ]),
    ...recipe.ingredients.map((ing, i): [string, string] => [`ingredients[${i}].name`, ing.name]),
  ]
}

export function validateRecipe(input: unknown, options: ValidateOptions): ValidationResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []

  const version = (input as { schemaVersion?: unknown })?.schemaVersion
  if (typeof version === 'number' && version > SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        {
          code: 'unsupported-schema-version',
          message: `schemaVersion ${version} новее поддерживаемой (${SUPPORTED_SCHEMA_VERSION})`,
        },
      ],
      warnings,
    }
  }

  if (!validateSchema(input)) {
    errors.push(...schemaIssues(validateSchema.errors))
  }

  const recipe = input as Recipe

  // Дальше идут правила поверх структуры. Если структуры нет вовсе,
  // проверять нечего — иначе показываем все ошибки разом, чтобы Claude
  // чинил рецепт за один заход, а не за пять коммитов подряд.
  if (!Array.isArray(recipe?.ingredients) || !Array.isArray(recipe?.steps)) {
    return { ok: false, errors, warnings }
  }

  const expectedId = options.fileName.replace(/\.json$/, '')
  if (recipe.id !== expectedId) {
    errors.push({
      code: 'id-filename-mismatch',
      message: `id «${recipe.id}» не совпадает с именем файла «${options.fileName}»`,
    })
  }

  const seenIngredients = new Set<string>()
  for (const ingredient of recipe.ingredients) {
    if (seenIngredients.has(ingredient.id)) {
      errors.push({
        code: 'duplicate-ingredient-id',
        message: `ингредиент «${ingredient.id}» встречается дважды`,
      })
    }
    seenIngredients.add(ingredient.id)

    if (ingredient.unit === 'to_taste' && ingredient.amount !== undefined) {
      errors.push({
        code: 'to-taste-with-amount',
        message: `«${ingredient.id}»: у to_taste не бывает количества`,
      })
    }
    if (ingredient.unit !== 'to_taste' && ingredient.amount === undefined) {
      errors.push({
        code: 'missing-amount',
        message: `«${ingredient.id}»: не указано количество`,
      })
    }
  }

  const usedIngredients = new Set<string>()
  const seenSteps = new Set<string>()
  for (const step of recipe.steps) {
    if (seenSteps.has(step.id)) {
      errors.push({ code: 'duplicate-step-id', message: `шаг «${step.id}» встречается дважды` })
    }
    seenSteps.add(step.id)

    for (const match of step.text.matchAll(PLACEHOLDER)) {
      const id = match[1]!
      if (!seenIngredients.has(id)) {
        errors.push({
          code: 'unknown-placeholder',
          message: `шаг «${step.id}»: плейсхолдер {${id}} не соответствует ни одному ингредиенту`,
        })
      }
      usedIngredients.add(id)
    }
  }

  for (const ingredient of recipe.ingredients) {
    if (!usedIngredients.has(ingredient.id)) {
      warnings.push({
        code: 'unused-ingredient',
        message: `ингредиент «${ingredient.id}» не упомянут ни в одном шаге`,
      })
    }
  }

  for (const [field, text] of textFields(recipe).filter(([, t]) => typeof t === 'string')) {
    for (const hit of findStopWords(text, options.extraStopWords)) {
      errors.push({
        code: 'stopword',
        message: `${field}: «${hit.matched}» — медицинский или персональный контекст, см. раздел 8 SPEC.md`,
      })
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
