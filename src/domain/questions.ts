import type {
  Question,
  QuestionCount,
  QuestionFilter,
  RandomSource,
  SourceType,
} from './types'

const toSourceList = (filter: QuestionFilter): readonly SourceType[] | SourceType | undefined =>
  filter.sourceTypes ?? filter.sourceType ?? filter.source_type ?? filter.source

/** Return questions matching all supplied filter fields, preserving source order. */
export function filterQuestions(
  questions: readonly Question[],
  filter: QuestionFilter = {},
): Question[] {
  const sourceFilter = toSourceList(filter)
  const sourceSet = Array.isArray(sourceFilter) ? new Set(sourceFilter) : undefined
  const idSet = filter.ids === undefined ? undefined : new Set(filter.ids)

  return questions.filter((question) => {
    if (filter.subject !== undefined && question.subject !== filter.subject) return false
    if (filter.topic !== undefined && question.topic !== filter.topic) return false
    if (filter.session !== undefined && question.session !== filter.session) return false
    if (filter.versionSensitive !== undefined && question.version_sensitive !== filter.versionSensitive) return false
    if (idSet !== undefined && !idSet.has(question.id)) return false
    if (sourceSet !== undefined && !sourceSet.has(question.source_type)) return false
    if (sourceFilter !== undefined && !Array.isArray(sourceFilter) && question.source_type !== sourceFilter) return false
    return filter.predicate === undefined || filter.predicate(question)
  })
}

const uniqueQuestions = (questions: readonly Question[]): Question[] => {
  const seen = new Set<string>()
  const result: Question[] = []
  for (const question of questions) {
    if (!seen.has(question.id)) {
      seen.add(question.id)
      result.push(question)
    }
  }
  return result
}

/**
 * Select up to `count` unique questions with Fisher–Yates sampling. A custom
 * random source makes the pure function deterministic in tests and callers
 * that need reproducible practice sessions.
 */
export function randomSelectQuestions(
  questions: readonly Question[],
  count: QuestionCount = 'all',
  random: RandomSource = Math.random,
): Question[] {
  const pool = uniqueQuestions(questions)
  if (pool.length === 0) return []
  if (count !== 'all' && (!Number.isFinite(count) || count <= 0)) return []
  const requested = count === 'all' ? pool.length : Math.min(pool.length, Math.floor(count))

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const sample = random()
    const normalized = Number.isFinite(sample) ? Math.min(0.9999999999999999, Math.max(0, sample)) : 0
    const swapIndex = Math.floor(normalized * (index + 1))
    const current = pool[index]
    pool[index] = pool[swapIndex]
    pool[swapIndex] = current
  }
  return pool.slice(0, requested)
}

/** Alias with a verb that reads naturally at call sites. */
export const selectRandomQuestions = randomSelectQuestions
