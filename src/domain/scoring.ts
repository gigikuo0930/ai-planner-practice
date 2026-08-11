import type {
  AnswerMode,
  AnswerChoice,
  AnswerSubmission,
  Question,
  ScoreResult,
  ScoredAnswer,
} from './types'

export type AnswersInput =
  | Readonly<Record<string, AnswerChoice | null | undefined>>
  | readonly (AnswerChoice | null | undefined | AnswerSubmission)[]

export interface ScoreOptions {
  mode?: AnswerMode
}

const answerChoices = new Set<AnswerChoice>(['A', 'B', 'C', 'D'])

const normalizeAnswer = (answer: unknown): AnswerChoice | null =>
  typeof answer === 'string' && answerChoices.has(answer as AnswerChoice) ? (answer as AnswerChoice) : null

const answerForQuestion = (
  questions: readonly Question[],
  answers: AnswersInput,
  index: number,
): AnswerChoice | null => {
  if (Array.isArray(answers)) {
    const entry = answers[index]
    if (entry !== null && typeof entry === 'object') {
      const submission = answers.find(
        (candidate): candidate is AnswerSubmission =>
          candidate !== null && typeof candidate === 'object' && candidate.questionId === questions[index].id,
      )
      return normalizeAnswer(submission?.selectedAnswer ?? submission?.selected_answer)
    }
    return normalizeAnswer(entry)
  }
  const answerMap = answers as Readonly<Record<string, AnswerChoice | null | undefined>>
  return normalizeAnswer(answerMap[questions[index].id])
}

/** Score answers by question ID (or array order), including unanswered items. */
export function scoreAnswers(
  questions: readonly Question[],
  answers: AnswersInput,
  options: ScoreOptions = {},
): ScoreResult {
  const scored: ScoredAnswer[] = questions.map((question, index) => {
    const selectedAnswer = answerForQuestion(questions, answers, index)
    return {
      questionId: question.id,
      selectedAnswer,
      correctAnswer: question.correct_answer,
      isCorrect: selectedAnswer !== null && selectedAnswer === question.correct_answer,
      mode: options.mode ?? 'practice',
      answeredAt: '',
      order: index + 1,
    }
  })
  const answeredCount = scored.filter((answer) => answer.selectedAnswer !== null).length
  const correctCount = scored.filter((answer) => answer.isCorrect).length
  const totalQuestions = questions.length
  const accuracy = totalQuestions === 0 ? 0 : correctCount / totalQuestions
  const result: ScoreResult = {
    totalQuestions,
    answeredCount,
    correctCount,
    incorrectCount: answeredCount - correctCount,
    unansweredCount: totalQuestions - answeredCount,
    accuracy,
    accuracyPercent: accuracy * 100,
    answers: scored,
  }
  if ((options.mode === 'mock_exam' || options.mode === 'mock') && totalQuestions === 50) result.score100 = correctCount * 2
  return result
}

/** Convenience wrapper that always applies the 50-question mock-exam score. */
export function scoreMockExam(
  questions: readonly Question[],
  answers: AnswersInput,
): ScoreResult {
  return scoreAnswers(questions, answers, { mode: 'mock_exam' })
}
