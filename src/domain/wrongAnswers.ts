import type {
  AnswerAttempt,
  AnswerChoice,
  AnswerMode,
  Question,
  RecordAnswerInput,
  WrongAnswerBook,
  WrongAnswerCounts,
  WrongAnswerRecord,
  WrongAnswerStatus,
} from './types'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const choices = new Set<AnswerChoice>(['A', 'B', 'C', 'D'])

const normalizeChoice = (answer: AnswerChoice | null | undefined): AnswerChoice | null =>
  answer !== null && answer !== undefined && choices.has(answer) ? answer : null

const normalizeTimestamp = (value: string | Date | undefined): string => {
  const date = value === undefined ? new Date() : value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError(`invalid answer timestamp: ${String(value)}`)
  return date.toISOString()
}

const compareAttempts = (left: AnswerAttempt, right: AnswerAttempt): number =>
  new Date(left.answeredAt).getTime() - new Date(right.answeredAt).getTime()

const reviewTimeline = (record: WrongAnswerRecord): {
  reviewCorrectAt: string[]
  qualifiedReviewCorrectAt: string[]
  status: WrongAnswerStatus
} => {
  const attempts = [...record.attempts].sort(compareAttempts)
  let latestWrongAt: number | undefined
  for (const attempt of attempts) {
    if (!attempt.isCorrect) latestWrongAt = new Date(attempt.answeredAt).getTime()
  }
  const reviewCorrectAt = attempts
    .filter(
      (attempt) =>
        attempt.mode === 'wrong_review' &&
        attempt.isCorrect &&
        (latestWrongAt === undefined || new Date(attempt.answeredAt).getTime() > latestWrongAt),
    )
    .map((attempt) => attempt.answeredAt)
  const qualifiedReviewCorrectAt: string[] = []
  for (const timestamp of reviewCorrectAt) {
    const current = new Date(timestamp).getTime()
    const previous = qualifiedReviewCorrectAt.at(-1)
    if (previous === undefined || current - new Date(previous).getTime() >= DAY_IN_MS) {
      qualifiedReviewCorrectAt.push(timestamp)
    }
  }
  const status: WrongAnswerStatus =
    qualifiedReviewCorrectAt.length >= 2
      ? 'mastered'
      : qualifiedReviewCorrectAt.length === 1
        ? 'review_correct'
        : 'needs_review'
  return { reviewCorrectAt, qualifiedReviewCorrectAt, status }
}

/** Recalculate status fields from the immutable attempt history. */
export function refreshWrongAnswerRecord(record: WrongAnswerRecord): WrongAnswerRecord {
  const timeline = reviewTimeline(record)
  return {
    questionId: record.questionId,
    attempts: record.attempts.map((attempt) => ({ ...attempt })),
    ...timeline,
  }
}

export function getWrongAnswerStatus(record: WrongAnswerRecord): WrongAnswerStatus {
  return reviewTimeline(record).status
}

const makeAttempt = (
  input: RecordAnswerInput,
): AnswerAttempt => {
  const selectedAnswer = normalizeChoice(input.selectedAnswer)
  const mode: AnswerMode = input.mode ?? 'practice'
  return {
    questionId: input.question.id,
    selectedAnswer,
    correctAnswer: input.question.correct_answer,
    isCorrect: selectedAnswer !== null && selectedAnswer === input.question.correct_answer,
    mode,
    answeredAt: normalizeTimestamp(input.answeredAt),
  }
}

/**
 * Add one completed answer to a wrong-answer book without mutating the input.
 * Correct answers outside wrong-review mode remain in an existing history but
 * do not advance the review qualification counter.
 */
export function recordAnswer(book: WrongAnswerBook, input: RecordAnswerInput): WrongAnswerBook {
  const attempt = makeAttempt(input)
  const previous = book[input.question.id]
  if (previous === undefined && attempt.isCorrect) return { ...book }

  const record: WrongAnswerRecord = previous === undefined
    ? {
        questionId: input.question.id,
        attempts: [attempt],
        status: 'needs_review',
        reviewCorrectAt: [],
        qualifiedReviewCorrectAt: [],
      }
    : {
        ...previous,
        attempts: [...previous.attempts, attempt],
      }
  const refreshed = refreshWrongAnswerRecord(record)
  return { ...book, [input.question.id]: refreshed }
}

/** Explicitly named convenience for callers handling a known incorrect answer. */
export function recordWrongAnswer(
  book: WrongAnswerBook,
  question: Question,
  selectedAnswer: AnswerChoice | null | undefined,
  options: Pick<RecordAnswerInput, 'mode' | 'answeredAt'> = {},
): WrongAnswerBook {
  return recordAnswer(book, { question, selectedAnswer, mode: options.mode, answeredAt: options.answeredAt })
}

export function getWrongAnswerCounts(book: WrongAnswerBook): WrongAnswerCounts {
  const counts: WrongAnswerCounts = { needsReview: 0, reviewCorrect: 0, mastered: 0 }
  for (const record of Object.values(book)) {
    const status = getWrongAnswerStatus(record)
    if (status === 'needs_review') counts.needsReview += 1
    else if (status === 'review_correct') counts.reviewCorrect += 1
    else counts.mastered += 1
  }
  return counts
}

