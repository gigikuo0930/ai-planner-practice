/** A–D choices used by every question in the supplied question bank. */
export type AnswerChoice = 'A' | 'B' | 'C' | 'D'

export type SourceType = 'official_exam' | 'guide_practice' | 'ai_designed'

export type AnswerMode = 'practice' | 'mock_exam' | 'wrong_review' | 'random' | 'filtered' | 'wrong' | 'mock'

export interface GuideLocation {
  guide_subject?: string
  guide_file?: string
  guide_section?: string
  guide_heading?: string
  guide_printed_pages?: string
  guide_pdf_pages?: string
  coverage?: 'direct' | 'related' | string
  note?: string
  matched_terms?: string | string[]
  matched_pdf_pages?: Array<number | string>
  matched_printed_pages?: string[]
  match_method?: string
}

/**
 * Question shape intentionally mirrors the JSON question bank. Keeping the
 * source fields intact lets callers pass imported JSON directly to domain
 * functions without a browser or a persistence adapter.
 */
export interface Question {
  id: string
  source_type: SourceType
  answer_authority?: string
  session: string | null
  exam_date?: string | null
  subject: string
  question_no: number
  stem: string
  options: Record<AnswerChoice, string>
  correct_answer: AnswerChoice
  answer_text: string
  explanation?: string | null
  explanation_status?: string
  guide_location?: GuideLocation
  topic: string
  version_sensitive?: boolean
  source_file?: string
  source_page?: number | null
  quality_flags?: string[]
}

export interface QuestionFilter {
  subject?: string
  topic?: string
  session?: string | null
  sourceType?: SourceType | readonly SourceType[]
  sourceTypes?: readonly SourceType[]
  /** Snake-case alias useful when filters are persisted beside the JSON data. */
  source_type?: SourceType | readonly SourceType[]
  /** Short alias used by the UI's persisted filter shape. */
  source?: SourceType | readonly SourceType[]
  versionSensitive?: boolean
  ids?: readonly string[]
  predicate?: (question: Question) => boolean
}

export type QuestionCount = number | 'all'
export type RandomSource = () => number

export interface MockExam {
  mode: 'mock_exam'
  subject: string
  session: string
  questions: Question[]
  totalQuestions: 50
}

export interface MockExamOptions {
  subject: string
  session: string
  random?: RandomSource
}

export interface MockExamExpected {
  subject?: string
  session?: string
}

export interface AnswerAttempt {
  questionId: string
  selectedAnswer: AnswerChoice | null
  correctAnswer: AnswerChoice
  isCorrect: boolean
  mode: AnswerMode
  answeredAt: string
}

export interface AnswerSubmission {
  questionId: string
  selectedAnswer?: AnswerChoice | null
  /** Snake-case alias accepted by scoreAnswers for persisted submissions. */
  selected_answer?: AnswerChoice | null
}

export interface ScoredAnswer extends AnswerAttempt {
  order: number
}

export interface ScoreResult {
  totalQuestions: number
  answeredCount: number
  correctCount: number
  incorrectCount: number
  unansweredCount: number
  /** Correct answers divided by total questions (0 when there are no questions). */
  accuracy: number
  accuracyPercent: number
  score100?: number
  answers: ScoredAnswer[]
}

export type WrongAnswerStatus = 'needs_review' | 'review_correct' | 'mastered'

export interface WrongAnswerRecord {
  questionId: string
  attempts: AnswerAttempt[]
  status: WrongAnswerStatus
  /** Every correct answer submitted in wrong-review mode, including same-day repeats. */
  reviewCorrectAt: string[]
  /** Correct review answers selected by the 24-hour qualification rule. */
  qualifiedReviewCorrectAt: string[]
}

export type WrongAnswerBook = Record<string, WrongAnswerRecord>

export interface RecordAnswerInput {
  question: Question
  selectedAnswer?: AnswerChoice | null
  mode?: AnswerMode
  answeredAt?: string | Date
}

export interface CategoryStatistics {
  totalAnswered: number
  correctAnswers: number
  incorrectAnswers: number
  accuracy: number
  accuracyPercent: number
}

export interface WrongAnswerCounts {
  needsReview: number
  reviewCorrect: number
  mastered: number
}

export interface Statistics {
  totalAnswered: number
  correctAnswers: number
  incorrectAnswers: number
  accuracy: number
  accuracyPercent: number
  bySubject: Record<string, CategoryStatistics>
  byTopic: Record<string, CategoryStatistics>
  wrongAnswerCounts: WrongAnswerCounts
  /** Number of distinct local calendar dates containing a completed attempt. */
  learningDays: number
  /** Consecutive-day count ending on the latest attempt's date. */
  currentStreakDays: number
}
