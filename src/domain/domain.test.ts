import { describe, expect, it } from 'vitest'

import {
  calculateStatistics,
  createMockExam,
  filterQuestions,
  isValidMockExam,
  randomSelectQuestions,
  recordAnswer,
  scoreAnswers,
} from './index'
import type {
  AnswerAttempt,
  AnswerChoice,
  Question,
  WrongAnswerBook,
} from './types'

const makeQuestion = (
  id: string,
  overrides: Partial<Question> = {},
): Question => ({
  id,
  source_type: 'official_exam',
  answer_authority: 'official_announcement',
  session: '114 年第四次',
  exam_date: '2025-11-01',
  subject: '科目一：人工智慧基礎概論',
  question_no: Number(id.replace(/\D/g, '')) || 1,
  stem: `題目 ${id}`,
  options: { A: '選項 A', B: '選項 B', C: '選項 C', D: '選項 D' },
  correct_answer: 'B',
  answer_text: '選項 B',
  explanation: null,
  explanation_status: 'missing',
  guide_location: undefined,
  topic: '人工智慧概念',
  version_sensitive: false,
  source_file: undefined,
  source_page: undefined,
  quality_flags: [],
  ...overrides,
})

describe('question selection', () => {
  const questions = [
    makeQuestion('Q1'),
    makeQuestion('Q2', { topic: '機器學習概念' }),
    makeQuestion('Q3', {
      source_type: 'guide_practice',
      session: null,
      topic: '機器學習概念',
    }),
  ]

  it('filters by subject, topic, source and session without changing input order', () => {
    expect(
      filterQuestions(questions, {
        subject: '科目一：人工智慧基礎概論',
        topic: '機器學習概念',
        sourceTypes: ['official_exam'],
        session: '114 年第四次',
      }).map((question) => question.id),
    ).toEqual(['Q2'])
  })

  it('selects a bounded number randomly without duplicate questions', () => {
    const selected = randomSelectQuestions(questions, 10, () => 0)

    expect(selected).toHaveLength(3)
    expect(new Set(selected.map((question) => question.id)).size).toBe(3)
    expect(selected.every((question) => questions.includes(question))).toBe(true)
  })
})

describe('mock exam creation and validation', () => {
  it('builds exactly one official 50-question exam for a subject and session', () => {
    const examQuestions = Array.from({ length: 50 }, (_, index) =>
      makeQuestion(`Q${index + 1}`, { question_no: index + 1 }),
    )
    const unrelated = makeQuestion('other', {
      subject: '科目二：生成式 AI 應用與規劃',
      question_no: 1,
    })
    const exam = createMockExam([...examQuestions, unrelated], {
      subject: '科目一：人工智慧基礎概論',
      session: '114 年第四次',
      random: () => 0.5,
    })

    expect(exam.questions).toHaveLength(50)
    expect(exam.questions.every((question) => question.source_type === 'official_exam')).toBe(true)
    expect(new Set(exam.questions.map((question) => question.id)).size).toBe(50)
    expect(exam.subject).toBe('科目一：人工智慧基礎概論')
    expect(exam.session).toBe('114 年第四次')
    expect(isValidMockExam(exam)).toBe(true)
  })

  it('rejects an incomplete or mixed mock exam', () => {
    const valid = Array.from({ length: 50 }, (_, index) =>
      makeQuestion(`Q${index + 1}`, { question_no: index + 1 }),
    )
    expect(isValidMockExam({ mode: 'mock_exam', subject: valid[0].subject, session: valid[0].session!, questions: valid.slice(0, 49) })).toBe(false)
    expect(
      isValidMockExam({
        mode: 'mock_exam',
        subject: valid[0].subject,
        session: valid[0].session!,
        questions: [...valid.slice(0, 49), makeQuestion('Q-other', { session: '115 年第一次', question_no: 50 })],
      }),
    ).toBe(false)
  })
})

describe('answer scoring', () => {
  it('scores selected answers and leaves custom practice without a 100-point score', () => {
    const questions = [makeQuestion('Q1', { correct_answer: 'B' }), makeQuestion('Q2', { correct_answer: 'D' })]
    const result = scoreAnswers(questions, { Q1: 'B', Q2: 'A' })

    expect(result.totalQuestions).toBe(2)
    expect(result.answeredCount).toBe(2)
    expect(result.correctCount).toBe(1)
    expect(result.incorrectCount).toBe(1)
    expect(result.unansweredCount).toBe(0)
    expect(result.accuracy).toBe(0.5)
    expect(result.accuracyPercent).toBe(50)
    expect(result.score100).toBeUndefined()
  })

  it('assigns two points per question for a 50-question mock exam', () => {
    const questions = Array.from({ length: 50 }, (_, index) => makeQuestion(`Q${index + 1}`, { question_no: index + 1 }))
    const answers = Object.fromEntries(questions.map((question) => [question.id, question.correct_answer]))

    expect(scoreAnswers(questions, answers, { mode: 'mock_exam' }).score100).toBe(100)
  })
})

describe('wrong-answer review mastery', () => {
  it('requires two review-correct answers at least 24 hours apart', () => {
    const question = makeQuestion('Q1')
    let book: WrongAnswerBook = {}

    book = recordAnswer(book, {
      question,
      selectedAnswer: 'A',
      mode: 'practice',
      answeredAt: '2026-01-01T00:00:00.000Z',
    })
    expect(book.Q1.status).toBe('needs_review')

    book = recordAnswer(book, {
      question,
      selectedAnswer: 'B',
      mode: 'wrong_review',
      answeredAt: '2026-01-02T00:00:00.000Z',
    })
    expect(book.Q1.status).toBe('review_correct')
    expect(book.Q1.qualifiedReviewCorrectAt).toHaveLength(1)

    book = recordAnswer(book, {
      question,
      selectedAnswer: 'B',
      mode: 'wrong_review',
      answeredAt: '2026-01-02T01:00:00.000Z',
    })
    expect(book.Q1.status).toBe('review_correct')
    expect(book.Q1.reviewCorrectAt).toHaveLength(2)
    expect(book.Q1.qualifiedReviewCorrectAt).toHaveLength(1)

    book = recordAnswer(book, {
      question,
      selectedAnswer: 'B',
      mode: 'wrong_review',
      answeredAt: '2026-01-04T01:00:00.000Z',
    })
    expect(book.Q1.status).toBe('mastered')
    expect(book.Q1.qualifiedReviewCorrectAt).toEqual([
      '2026-01-02T00:00:00.000Z',
      '2026-01-04T01:00:00.000Z',
    ])
    expect(book.Q1.attempts).toHaveLength(4)
  })
})

describe('subject and topic statistics', () => {
  it('aggregates answer counts and wrong-answer status counts', () => {
    const questions = [
      makeQuestion('Q1', { topic: '主題 A', correct_answer: 'B' }),
      makeQuestion('Q2', { topic: '主題 A', correct_answer: 'C' }),
      makeQuestion('Q3', {
        topic: '主題 B',
        subject: '科目二：生成式 AI 應用與規劃',
        correct_answer: 'D',
      }),
    ]
    const attempts: AnswerAttempt[] = [
      { questionId: 'Q1', selectedAnswer: 'B', correctAnswer: 'B', isCorrect: true, mode: 'practice', answeredAt: '2026-01-01T00:00:00.000Z' },
      { questionId: 'Q2', selectedAnswer: 'A', correctAnswer: 'C', isCorrect: false, mode: 'practice', answeredAt: '2026-01-01T01:00:00.000Z' },
      { questionId: 'Q3', selectedAnswer: 'D', correctAnswer: 'D', isCorrect: true, mode: 'practice', answeredAt: '2026-01-02T00:00:00.000Z' },
    ]
    let wrongBook: WrongAnswerBook = {}
    wrongBook = recordAnswer(wrongBook, {
      question: questions[1],
      selectedAnswer: 'A',
      mode: 'practice',
      answeredAt: '2026-01-01T01:00:00.000Z',
    })

    const statistics = calculateStatistics(questions, attempts, wrongBook)

    expect(statistics.totalAnswered).toBe(3)
    expect(statistics.correctAnswers).toBe(2)
    expect(statistics.accuracy).toBeCloseTo(2 / 3)
    expect(statistics.bySubject['科目一：人工智慧基礎概論']).toMatchObject({ totalAnswered: 2, correctAnswers: 1, accuracy: 0.5 })
    expect(statistics.byTopic['主題 A']).toMatchObject({ totalAnswered: 2, correctAnswers: 1, accuracy: 0.5 })
    expect(statistics.wrongAnswerCounts).toEqual({ needsReview: 1, reviewCorrect: 0, mastered: 0 })
  })
})

// Keep the imported union in this behavior-spec file explicit for TypeScript's noUnusedLocals check.
const answerChoiceForTypeCheck: AnswerChoice = 'A'
void answerChoiceForTypeCheck
