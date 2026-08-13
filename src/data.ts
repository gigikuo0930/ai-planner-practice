import rawBank from '../ai-planner-junior-question-bank/ai-planner-junior-question-bank.json'

export type SourceType = 'official_exam' | 'guide_practice' | 'ai_designed'

export interface Question {
  id: string
  source_type: SourceType
  session: string | null
  exam_date: string | null
  subject: string
  question_no: number
  stem: string
  options: Record<'A' | 'B' | 'C' | 'D', string>
  correct_answer: 'A' | 'B' | 'C' | 'D'
  answer_text: string
  explanation: string | null
  explanation_status: string
  guide_location: {
    guide_section: string
    guide_heading: string
    guide_printed_pages: string
    guide_pdf_pages: string
    coverage?: 'direct' | 'related'
    note?: string
    matched_terms?: string | string[]
    matched_pdf_pages?: number[]
  }
  topic: string
  version_sensitive: boolean
}

interface QuestionBank {
  questions: Question[]
}

export const questions = (rawBank as QuestionBank).questions
export const subjects = [...new Set(questions.map((question) => question.subject))]
export const topics = [...new Set(questions.map((question) => question.topic))].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
export const sessions = [...new Set(questions.filter((question) => question.source_type === 'official_exam').map((question) => question.session).filter((session): session is string => Boolean(session)))]

export const sourceLabel: Record<SourceType, string> = {
  official_exam: '官方考古題',
  guide_practice: '學習指引練習',
  ai_designed: 'AI 設計題',
}

export const shuffle = <T,>(items: readonly T[]) => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
  }
  return copy
}
