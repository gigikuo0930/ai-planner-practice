import { sourceLabel, type Question } from './data'

export interface LearningNote {
  explanation: string
  explanationSource: 'official' | 'ai_summary'
  conceptSummary: string
  materialSummary: string
  answerReasoning: string
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

const topicReasoning: Record<string, string> = {
  '人工智慧概念': '先分辨題幹在問人工智慧的能力、導入責任或治理限制；正解必須同時符合概念定義與人類監督、資料使用等必要條件。',
  '資料處理與分析概念': '先辨認題幹處於資料蒐集、清理、轉換、分析或視覺化的哪一步；正解應對應該步驟的目的，而非其他流程的工作。',
  '機器學習概念': '先找出資料是否有標記、模型的學習目標與評估現象；正解要符合監督式、非監督式或強化學習的基本機制。',
  '鑑別式 AI 與生成式 AI 概念': '先判斷任務是分類／預測既有標籤，還是產生新內容；正解必須與題目要的輸出型態一致。',
  '生成式 AI 應用領域與工具使用': '先確認任務目標、輸入資訊與輸出限制；正解應兼顧工具能力、提示品質與人工查核。',
  '生成式 AI 導入評估規劃': '先區分導入前的需求與風險盤點、試點驗證，以及上線後的成效衡量；正解應符合循序驗證、可衡量與風險可控的原則。',
  'No Code / Low Code 概念': '先看題幹需要的客製程度與開發能力；正解要符合 No Code 著重無程式建置、Low Code 可用少量程式延伸的差異。',
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
  const materialSummary = location.coverage === 'related'
    ? `教材以「${location.guide_heading}」的上位概念作為本題的判斷基礎。${matchedTerms ? `先理解「${matchedTerms}」與題幹情境的關聯；` : ''}再回到題目條件，辨識正確答案「${question.answer_text}」所依據的概念。`
    : `教材在「${location.guide_heading}」說明本題所需的概念。${matchedTerms ? `複習時先掌握「${matchedTerms}」；` : ''}本題要把這些概念套用到題幹情境，判斷為何「${question.answer_text}」最符合教材原則。`
  const answerReasoning = official
    ? official
    : `題幹的判斷重點是「${question.topic}」。${topicReasoning[question.topic] ?? '先將題幹條件與教材的概念定義逐一比對。'}因此選擇 ${question.correct_answer}「${question.answer_text}」；它最符合題幹要求與教材所述的判斷原則。`
  const locatingText = matchedTerms
    ? `請在「${location.guide_heading}」中優先尋找關鍵詞「${matchedTerms}」。`
    : `請閱讀「${location.guide_heading}」對應段落，並以題幹中的「${question.topic}」作為查找焦點。`

  if (official) {
    return {
      explanation: official,
      explanationSource: 'official',
      conceptSummary: baseSummary,
      materialSummary,
      answerReasoning,
      locatingText,
      caution: location.coverage === 'related' ? '此題的細節術語未必在指引中逐字出現；頁碼提供的是相關上位概念。' : undefined,
    }
  }

  return {
    explanation: `本題考查「${question.topic}」。正確選項是 ${question.correct_answer}：「${question.answer_text}」。作答時應先從題幹辨識要判斷的概念或情境，再選擇最符合該概念定義、流程或限制的敘述。`,
    explanationSource: 'ai_summary',
    conceptSummary: baseSummary,
    materialSummary,
    answerReasoning,
    locatingText,
    caution: location.coverage === 'related'
      ? `這是 ${sourceLabel[question.source_type]}；學習指引提供的是相關上位概念，請以原考次的題目與答案為準。`
      : '此為 AI 依題庫正解與學習指引定位整理的複習說明，並非官方逐題解析。',
  }
}
