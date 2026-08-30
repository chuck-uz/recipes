/**
 * Репозиторий публичный. В рецептах не должно быть медицинского контекста,
 * диагнозов и указаний на конкретного человека (раздел 8 SPEC.md).
 *
 * Здесь лежат только обезличенные термины. Личные имена передаются извне —
 * через секрет GitHub Actions, потому что список имён в публичном репозитории
 * раскрывал бы ровно то, что должен скрывать.
 */

/** Совпадение по началу слова: «гепатоз» ловит «гепатозе», «гепатозом». */
export const STOPWORD_PREFIXES = [
  'гепатоз',
  'джвп',
  'диагноз',
  'симптом',
  'болезн',
  'заболеван',
  'лечен',
  'обследован',
  'анализ',
  'врач',
  'педиатр',
  'гастроэнтеролог',
  'поликлиник',
  'диспансер',
  'холецистит',
  'гастрит',
  'панкреатит',
  'дисбактериоз',
  'непереносимост',
  'аллерги',
  'желчн',
  'желчегон',
  'ожирен',
  'избыточн',
]

/** Совпадение целым словом: «печени» не должно ловить «печенье». */
export const STOPWORD_EXACT = ['узи', 'печень', 'печени', 'печенью']

export interface StopWordHit {
  word: string
  matched: string
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? []
}

/**
 * @param extraPrefixes дополнительные основы (личные имена) — они склоняются,
 *   поэтому сравниваются по началу слова.
 */
export function findStopWords(text: string, extraPrefixes: string[] = []): StopWordHit[] {
  const prefixes = [...STOPWORD_PREFIXES, ...extraPrefixes.map((w) => w.toLowerCase())]
  const exact = new Set(STOPWORD_EXACT)
  const hits: StopWordHit[] = []

  for (const token of tokenize(text)) {
    if (exact.has(token)) {
      hits.push({ word: token, matched: token })
      continue
    }
    const prefix = prefixes.find((p) => token.startsWith(p))
    if (prefix) hits.push({ word: prefix, matched: token })
  }

  return hits
}

/** Имена читаются из секрета GitHub Actions, локально проверка их пропускает. */
export function extraStopWordsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.RECIPES_STOPWORDS ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
}
