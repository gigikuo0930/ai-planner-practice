import { getWrongAnswerCounts } from './wrongAnswers'
import type {
  AnswerAttempt,
  CategoryStatistics,
  Question,
  Statistics,
  WrongAnswerBook,
} from './types'

const emptyCategory = (): CategoryStatistics => ({
  totalAnswered: 0,
  correctAnswers: 0,
  incorrectAnswers: 0,
  accuracy: 0,
  accuracyPercent: 0,
})

const addAttempt = (category: CategoryStatistics, attempt: AnswerAttempt): void => {
  category.totalAnswered += 1
  if (attempt.isCorrect) category.correctAnswers += 1
  else category.incorrectAnswers += 1
  category.accuracy = category.correctAnswers / category.totalAnswered
  category.accuracyPercent = category.accuracy * 100
}

const dateKey = (timestamp: string): string => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

const dayNumber = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000)
}

const streakLength = (dates: Set<string>): number => {
  if (dates.size === 0) return 0
  const sorted = [...dates].sort()
  let streak = 1
  for (let index = sorted.length - 1; index > 0; index -= 1) {
    if (dayNumber(sorted[index]) - dayNumber(sorted[index - 1]) !== 1) break
    streak += 1
  }
  return streak
}

/** Aggregate completed attempts for dashboard subject/topic cards. */
export function calculateStatistics(
  questions: readonly Question[],
  attempts: readonly AnswerAttempt[],
  wrongBook: WrongAnswerBook = {},
): Statistics {
  const questionById = new Map(questions.map((question) => [question.id, question]))
  const bySubject: Record<string, CategoryStatistics> = {}
  const byTopic: Record<string, CategoryStatistics> = {}
  const learningDateKeys = new Set<string>()
  let correctAnswers = 0

  for (const attempt of attempts) {
    if (attempt.isCorrect) correctAnswers += 1
    learningDateKeys.add(dateKey(attempt.answeredAt))
    const question = questionById.get(attempt.questionId)
    if (question === undefined) continue
    const subjectStats = bySubject[question.subject] ?? emptyCategory()
    const topicStats = byTopic[question.topic] ?? emptyCategory()
    addAttempt(subjectStats, attempt)
    addAttempt(topicStats, attempt)
    bySubject[question.subject] = subjectStats
    byTopic[question.topic] = topicStats
  }

  const totalAnswered = attempts.length
  const accuracy = totalAnswered === 0 ? 0 : correctAnswers / totalAnswered
  return {
    totalAnswered,
    correctAnswers,
    incorrectAnswers: totalAnswered - correctAnswers,
    accuracy,
    accuracyPercent: accuracy * 100,
    bySubject,
    byTopic,
    wrongAnswerCounts: getWrongAnswerCounts(wrongBook),
    learningDays: learningDateKeys.size,
    currentStreakDays: streakLength(learningDateKeys),
  }
}

