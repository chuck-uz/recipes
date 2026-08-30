import type { Unit } from './types'

const FRACTIONS: Record<string, string> = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾',
}

/**
 * Число по правилам раздела 4.3: ¼ ½ ¾ и смешанные «1½»,
 * остальное — десятичные с запятой, не более одного знака.
 * Трети не используются: они несовместимы с шагом округления ложек.
 */
export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)

  const whole = Math.floor(value)
  const fraction = FRACTIONS[String(Math.round((value - whole) * 100) / 100)]
  if (fraction) return whole === 0 ? fraction : `${whole}${fraction}`

  return String(Math.round(value * 10) / 10).replace('.', ',')
}

interface UnitForms {
  /** 1 ложка */
  one: string
  /** 2–4 ложки */
  few: string
  /** 5+ ложек */
  many: string
  /** ½ ложки — родительный падеж единственного числа */
  fraction: string
  /** null — сокращения нет, всегда полное слово */
  short: string | null
  /** единица без склонения: «г», «мл», «шт.» */
  fixed?: string
}

const UNITS: Record<Unit, UnitForms> = {
  tsp: {
    one: 'чайная ложка',
    few: 'чайные ложки',
    many: 'чайных ложек',
    fraction: 'чайной ложки',
    short: 'ч. л.',
  },
  tbsp: {
    one: 'столовая ложка',
    few: 'столовые ложки',
    many: 'столовых ложек',
    fraction: 'столовой ложки',
    short: 'ст. л.',
  },
  pinch: {
    one: 'щепотка',
    few: 'щепотки',
    many: 'щепоток',
    fraction: 'щепотки',
    short: null,
  },
  g: { one: 'г', few: 'г', many: 'г', fraction: 'г', short: 'г', fixed: 'г' },
  kg: { one: 'кг', few: 'кг', many: 'кг', fraction: 'кг', short: 'кг', fixed: 'кг' },
  ml: { one: 'мл', few: 'мл', many: 'мл', fraction: 'мл', short: 'мл', fixed: 'мл' },
  l: { one: 'л', few: 'л', many: 'л', fraction: 'л', short: 'л', fixed: 'л' },
  pcs: { one: 'шт.', few: 'шт.', many: 'шт.', fraction: 'шт.', short: 'шт.', fixed: 'шт.' },
  to_taste: {
    one: 'по вкусу',
    few: 'по вкусу',
    many: 'по вкусу',
    fraction: 'по вкусу',
    short: 'по вкусу',
    fixed: 'по вкусу',
  },
}

function pluralForm(amount: number, forms: UnitForms): string {
  if (!Number.isInteger(amount)) return forms.fraction

  const mod100 = amount % 100
  const mod10 = amount % 10
  if (mod10 === 1 && mod100 !== 11) return forms.one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few
  return forms.many
}

/**
 * Единицы с десятичным шагом округления: у них дроби ¼ ½ ¾ не показываются,
 * иначе «1½ кг» соседствовало бы с «1,3 кг» в одном списке.
 */
const DECIMAL_UNITS = new Set<Unit>(['g', 'kg', 'ml', 'l'])

function formatDecimal(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}

export interface FormatOptions {
  /** сокращения вместо полных слов; по умолчанию полные слова */
  abbreviated?: boolean
}

/**
 * Крупные количества показываются в кг и л: «1000 г» читается хуже, чем «1 кг».
 * Повышение только для круглых значений, чтобы не терять точность на 1750 г.
 */
function promote(amount: number, unit: Unit): { amount: number; unit: Unit } {
  if (amount >= 1000 && amount % 100 === 0) {
    if (unit === 'g') return { amount: amount / 1000, unit: 'kg' }
    if (unit === 'ml') return { amount: amount / 1000, unit: 'l' }
  }
  return { amount, unit }
}

/** «500 г», «½ чайной ложки», «по вкусу» */
export function formatQuantity(
  amount: number | undefined,
  unit: Unit,
  options: FormatOptions = {},
): string {
  if (unit === 'to_taste' || amount === undefined) return UNITS.to_taste.one

  const promoted = promote(amount, unit)
  const forms = UNITS[promoted.unit]
  const word =
    forms.fixed ?? (options.abbreviated && forms.short ? forms.short : pluralForm(promoted.amount, forms))

  const number = DECIMAL_UNITS.has(promoted.unit)
    ? formatDecimal(promoted.amount)
    : formatNumber(promoted.amount)

  return `${number} ${word}`
}
