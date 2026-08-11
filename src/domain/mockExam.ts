import { randomSelectQuestions } from './questions'
import type {
  MockExam,
  MockExamExpected,
  MockExamOptions,
  Question,
} from './types'

type MockExamLike = {
  mode: 'mock_exam'
  subject: string
  session: string
  questions: readonly Question[]
  totalQuestions?: number
}
type MockExamInput = MockExamLike | readonly Question[]

const isMockExam = (input: MockExamInput): input is MockExamLike => !Array.isArray(input)

/** Return human-readable invariant failures for an official 50-question exam. */
export function getMockExamValidationErrors(
  input: MockExamInput,
  expected: MockExamExpected = {},
): string[] {
  const isExam = isMockExam(input)
  const questions = isExam ? input.questions : input
  const subject = isExam ? input.subject : expected.subject
  const session = isExam ? input.session : expected.session
  const errors: string[] = []

  if (isExam && input.mode !== 'mock_exam') errors.push('mode must be mock_exam')
  if (questions.length !== 50) errors.push('mock exam must contain exactly 50 questions')
  if (subject === undefined || subject.length === 0) errors.push('mock exam subject is required')
  if (session === undefined || session.length === 0) errors.push('mock exam session is required')

  const ids = new Set<string>()
  const questionNumbers = new Set<number>()
  for (const question of questions) {
    if (ids.has(question.id)) errors.push(`duplicate question id: ${question.id}`)
    ids.add(question.id)
    if (question.source_type !== 'official_exam') errors.push(`question ${question.id} is not an official exam question`)
    if (question.session === null || question.session === undefined) {
      errors.push(`question ${question.id} has no exam session`)
    } else if (session !== undefined && question.session !== session) {
      errors.push(`question ${question.id} belongs to a different session`)
    }
    if (subject !== undefined && question.subject !== subject) {
      errors.push(`question ${question.id} belongs to a different subject`)
    }
    if (questionNumbers.has(question.question_no)) errors.push(`duplicate question number: ${question.question_no}`)
    questionNumbers.add(question.question_no)
  }

  if (expected.subject !== undefined && subject !== expected.subject) errors.push('mock exam subject does not match expected subject')
  if (expected.session !== undefined && session !== expected.session) errors.push('mock exam session does not match expected session')
  return errors
}

/** Boolean convenience at the validation seam used by UI and persistence code. */
export function isValidMockExam(input: MockExamInput, expected: MockExamExpected = {}): boolean {
  return getMockExamValidationErrors(input, expected).length === 0
}

/** Alias for callers that prefer the verb `validate`. */
export const validateMockExam = isValidMockExam

/**
 * Build one shuffled official exam. Questions from other subjects, sessions,
 * and source types are ignored; an exam is rejected when its official pool is
 * not a complete 50-question set.
 */
export function createMockExam(questions: readonly Question[], options: MockExamOptions): MockExam {
  const candidates = questions.filter(
    (question) =>
      question.source_type === 'official_exam' &&
      question.subject === options.subject &&
      question.session === options.session,
  )
  if (candidates.length !== 50) {
    throw new Error(
      `cannot create mock exam: expected 50 official questions for ${options.subject} / ${options.session}, found ${candidates.length}`,
    )
  }

  const exam: MockExam = {
    mode: 'mock_exam',
    subject: options.subject,
    session: options.session,
    questions: randomSelectQuestions(candidates, 50, options.random),
    totalQuestions: 50,
  }
  if (!isValidMockExam(exam)) {
    throw new Error('cannot create mock exam: official question set is invalid')
  }
  return exam
}
