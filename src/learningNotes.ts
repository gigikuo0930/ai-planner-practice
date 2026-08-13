import { sourceLabel, type Question } from './data'

export interface LearningNote {
  explanation: string
  explanationSource: 'official' | 'ai_summary'
  conceptSummary: string
  locatingText: string
  caution?: string
}

const topicSummaries: Record<string, string> = {
  '人工智慧概念': '本節聚焦人工智慧的基本定義、能力範圍、治理原則與人類監督。先辨認題目問的是技術能力、導入責任或治理角色，再回到選項的條件判斷。',
  '資料處理與分析概念': '本節說明資料蒐集、清理、轉換、分析與視覺化的流程。作答時要分清每一個資料處理步驟的目的，以及統計指標真正描述的資料特性。',
  '機器學習概念': '本節整理監督式、非監督式與強化學習，以及模型訓練、評估與泛化能力。先找出題幹中的學習目標、資料標記情況或誤差現象，再選符合模型原理的答案。',
  '鑑別式 AI 與生成式 AI 概念': '本節的核心是區分「判別／預測既有類別」與「依機率分布生成新內容」。判斷時看題目要求是分類、預測，還是產生文字、影像或其他新資料。',
  '生成式 AI 應用領域與工具使用': '本節涵蓋生成式 AI 的能力、提示工程、多模態工具與使用限制。作答要同時考量任務目標、輸入資訊、輸出品質與人工查核。',
  '生成式 AI 導入評估規劃': '本節說明導入前的需求盤點、試點驗證、KPI、成本效益與風險管理。通常應優先選擇可衡量、可控風險且能逐步驗證成效的做法。',
  'No Code / Low Code 概念': '本節比較 No Code 與 Low Code 的使用門檻、擴充性與適用情境。判斷時要以是否需要自行撰寫程式、客製複雜度與維護需求為準。',
}

export const learningNoteSourceLabel = (question: Question, note: LearningNote) => {
  if (note.explanationSource === 'official') return '官方解析'
  return question.source_type === 'official_exam'
    ? '無官方解析；以下為 AI 依學習指引整理'
    : `AI 依學習指引整理（${sourceLabel[question.source_type]}）`
}

export function getLearningNote(question: Question): LearningNote {
  const location = question.guide_location
  const official = question.explanation?.trim()
  const baseSummary = topicSummaries[question.topic] ?? `本題聚焦「${question.topic}」。閱讀時先掌握該概念的定義、適用情境與限制，再比對題幹要求的條件。`
  const matchedTerms = Array.isArray(location.matched_terms) ? location.matched_terms.join('、') : location.matched_terms
  const locatingText = matchedTerms
    ? `請在「${location.guide_heading}」中優先尋找關鍵詞「${matchedTerms}」。`
    : `請閱讀「${location.guide_heading}」對應段落，並以題幹中的「${question.topic}」作為查找焦點。`

  if (official) {
    return {
      explanation: official,
      explanationSource: 'official',
      conceptSummary: baseSummary,
      locatingText,
      caution: location.coverage === 'related' ? '此題的細節術語未必在指引中逐字出現；頁碼提供的是相關上位概念。' : undefined,
    }
  }

  return {
    explanation: `本題考查「${question.topic}」。正確選項是 ${question.correct_answer}：「${question.answer_text}」。作答時應先從題幹辨識要判斷的概念或情境，再選擇最符合該概念定義、流程或限制的敘述。`,
    explanationSource: 'ai_summary',
    conceptSummary: baseSummary,
    locatingText,
    caution: location.coverage === 'related'
      ? `這是 ${sourceLabel[question.source_type]}；學習指引提供的是相關上位概念，請以原考次的題目與答案為準。`
      : '此為 AI 依題庫正解與學習指引定位整理的複習說明，並非官方逐題解析。',
  }
}
