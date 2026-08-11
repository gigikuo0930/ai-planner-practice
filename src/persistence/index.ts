/**
 * The browser persistence boundary.
 *
 * This module deliberately owns its data contracts.  It does not import the
 * question-bank/domain modules, so a persisted backup remains usable when the
 * UI or domain implementation changes independently of storage.
 */

export const APP_DATA_VERSION = 1 as const
export const APP_STORAGE_KEY = 'ai-planner-practice.app-data'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type PracticeMode =
  | 'random'
  | 'filtered'
  | 'mistakes'
  | 'mock'
  | 'mock_exam'
  | 'wrong_review'
  | 'wrong'
  | 'practice'

export interface PracticeFilters {
  subject?: string
  topic?: string
  sourceType?: string
  source?: string
  session?: string
  questionCount?: number | 'all'
  [key: string]: unknown
}

export interface AnswerAttempt {
  questionId: string
  selectedAnswer: string | null
  correctAnswer: string
  isCorrect: boolean
  order: number
  answeredAt: string
  mode?: PracticeMode | string
  attemptId?: string
}

/** A completed practice session or mock examination. */
export interface AttemptRecord {
  id: string
  mode: PracticeMode | string
  startedAt?: string
  completedAt: string
  filters: PracticeFilters
  questionCount: number
  correctCount: number
  accuracy: number
  answers: AnswerAttempt[]
}

export type MasteryStatus = 'pending' | 'reviewed' | 'mastered'

export interface ProgressEvent {
  answeredAt: string
  isCorrect: boolean
  isReview?: boolean
  attemptId?: string
}

export interface QuestionProgress {
  questionId: string
  status: MasteryStatus
  history: ProgressEvent[]
}

export interface DraftAnswer {
  questionId: string
  selectedAnswer: string | null
  answeredAt?: string
}

export interface PracticeDraft {
  /** A caller-provided id makes it possible to keep several drafts. */
  id?: string
  mode: PracticeMode | string
  filters?: PracticeFilters
  questionIds: string[]
  answers: DraftAnswer[]
  currentIndex: number
  startedAt: string
  updatedAt: string
}

/**
 * The complete persisted document. `records` contains completed sessions;
 * `attempts` is a flat copy of their per-question answers for consumers that
 * need an answer-level history. Both arrays are kept in exported backups.
 */
export interface AppData {
  version: typeof APP_DATA_VERSION
  records: AttemptRecord[]
  attempts: AnswerAttempt[]
  progress: QuestionProgress[]
  drafts: PracticeDraft[]
}

export interface PersistenceOptions {
  storage?: StorageLike | null
  storageKey?: string
  now?: () => string
  idFactory?: () => string
}

export interface ImportSuccess {
  ok: true
  data: AppData
}

export interface ImportFailure {
  ok: false
  error: PersistenceValidationError
}

export type ImportResult = ImportSuccess | ImportFailure

export class PersistenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PersistenceValidationError'
  }
}

export interface PersistenceApi {
  loadAppData(): AppData
  saveAppData(data: AppData): AppData
  exportAppData(data?: AppData): string
  importAppData(json: string): AppData
  tryImportAppData(json: string): ImportResult
  clearAppData(): void
  loadDraft(id?: string): PracticeDraft | null
  saveDraft(draft: PracticeDraft): PracticeDraft
  clearDraft(id?: string): void
  appendRecord(record: AttemptRecord): AppData
}

const emptyAppData = (): AppData => ({
  version: APP_DATA_VERSION,
  records: [],
  attempts: [],
  progress: [],
  drafts: [],
})

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return undefined
  return [...value]
}

const normalizeFilters = (value: unknown): PracticeFilters => {
  if (!isObject(value)) return {}
  return { ...value }
}

const normalizeAnswer = (value: unknown, index: number): AnswerAttempt | null => {
  if (!isObject(value)) return null
  const questionId = asString(value.questionId ?? value.question_id)
  const correctAnswer = asString(value.correctAnswer ?? value.correct_answer)
  const selectedValue = value.selectedAnswer ?? value.selected_answer
  const selectedAnswer = selectedValue === null ? null : asString(selectedValue)
  const isCorrect = asBoolean(value.isCorrect ?? value.is_correct)
  const answeredAt = asString(value.answeredAt ?? value.answered_at)
  if (!questionId || !correctAnswer || isCorrect === undefined || !answeredAt) return null

  const order = asNumber(value.order ?? value.questionOrder ?? value.question_order)
  return {
    questionId,
    selectedAnswer: selectedAnswer ?? null,
    correctAnswer,
    isCorrect,
    order: order !== undefined && order >= 0 ? Math.trunc(order) : index,
    answeredAt,
    ...(asString(value.mode) ? { mode: asString(value.mode) } : {}),
    ...(asString(value.attemptId ?? value.attempt_id)
      ? { attemptId: asString(value.attemptId ?? value.attempt_id) }
      : {}),
  }
}

const normalizeAttempt = (value: unknown, index: number): AttemptRecord | null => {
  if (!isObject(value)) return null
  const id = asString(value.id) ?? `attempt-${index + 1}`
  const completedAt = asString(value.completedAt ?? value.completed_at)
  if (!completedAt) return null
  const mode = asString(value.mode) ?? 'practice'
  const rawAnswers = value.answers
  if (rawAnswers !== undefined && !Array.isArray(rawAnswers)) return null
  const answers = (Array.isArray(rawAnswers) ? rawAnswers : [])
    .map((answer, answerIndex) => normalizeAnswer(answer, answerIndex))
    .filter((answer): answer is AnswerAttempt => answer !== null)
  if (Array.isArray(rawAnswers) && answers.length !== rawAnswers.length) return null

  const questionCountValue = asNumber(value.questionCount ?? value.question_count)
  const correctCountValue = asNumber(value.correctCount ?? value.correct_count)
  const questionCount = questionCountValue !== undefined ? Math.max(0, Math.trunc(questionCountValue)) : answers.length
  const correctCount =
    correctCountValue !== undefined
      ? Math.max(0, Math.min(questionCount, Math.trunc(correctCountValue)))
      : answers.filter((answer) => answer.isCorrect).length
  const accuracyValue = asNumber(value.accuracy)
  const accuracy = accuracyValue !== undefined ? Math.max(0, Math.min(1, accuracyValue)) : questionCount ? correctCount / questionCount : 0

  return {
    id,
    mode,
    ...(asString(value.startedAt ?? value.started_at) ? { startedAt: asString(value.startedAt ?? value.started_at) } : {}),
    completedAt,
    filters: normalizeFilters(value.filters),
    questionCount,
    correctCount,
    accuracy,
    answers,
  }
}

const normalizeProgressEvent = (value: unknown): ProgressEvent | null => {
  if (!isObject(value)) return null
  const answeredAt = asString(value.answeredAt ?? value.answered_at)
  const isCorrect = asBoolean(value.isCorrect ?? value.is_correct)
  if (!answeredAt || isCorrect === undefined) return null
  return {
    answeredAt,
    isCorrect,
    ...(typeof value.isReview === 'boolean' ? { isReview: value.isReview } : {}),
    ...(asString(value.attemptId ?? value.attempt_id) ? { attemptId: asString(value.attemptId ?? value.attempt_id) } : {}),
  }
}

const normalizeProgress = (value: unknown): QuestionProgress | null => {
  if (!isObject(value)) return null
  const questionId = asString(value.questionId ?? value.question_id)
  if (!questionId) return null
  const rawHistory = value.history
  if (rawHistory !== undefined && !Array.isArray(rawHistory)) return null
  const history = (Array.isArray(rawHistory) ? rawHistory : [])
    .map(normalizeProgressEvent)
    .filter((event): event is ProgressEvent => event !== null)
  if (Array.isArray(rawHistory) && history.length !== rawHistory.length) return null
  const rawStatus = value.status
  const status: MasteryStatus = rawStatus === 'mastered' || rawStatus === 'reviewed' || rawStatus === 'pending' ? rawStatus : 'pending'
  return { questionId, status, history }
}

const normalizeDraftAnswer = (value: unknown): DraftAnswer | null => {
  if (!isObject(value)) return null
  const questionId = asString(value.questionId ?? value.question_id)
  if (!questionId) return null
  const selectedValue = value.selectedAnswer ?? value.selected_answer
  const selectedAnswer = selectedValue === null ? null : asString(selectedValue)
  if (selectedValue !== null && selectedAnswer === undefined) return null
  const answeredAt = asString(value.answeredAt ?? value.answered_at)
  return { questionId, selectedAnswer: selectedAnswer ?? null, ...(answeredAt ? { answeredAt } : {}) }
}

const normalizeDraft = (value: unknown, index: number, now: () => string, strict: boolean): PracticeDraft | null => {
  if (!isObject(value)) return null
  const questionIds = asStringArray(value.questionIds ?? value.question_ids)
  if (!questionIds) return null
  const rawAnswers = value.answers
  if (!Array.isArray(rawAnswers)) return null
  const answers = rawAnswers.map(normalizeDraftAnswer).filter((answer): answer is DraftAnswer => answer !== null)
  if (answers.length !== rawAnswers.length) return null
  const startedAt = asString(value.startedAt ?? value.started_at)
  const updatedAt = asString(value.updatedAt ?? value.updated_at)
  if (strict && (!startedAt || !updatedAt)) return null
  const currentIndex = asNumber(value.currentIndex ?? value.current_index)
  if (currentIndex !== undefined && currentIndex < 0) return null
  const mode = asString(value.mode) ?? 'practice'
  return {
    ...(asString(value.id) ? { id: asString(value.id) } : { id: `draft-${index + 1}` }),
    mode,
    ...(value.filters !== undefined ? { filters: normalizeFilters(value.filters) } : {}),
    questionIds,
    answers,
    currentIndex: currentIndex !== undefined ? Math.trunc(currentIndex) : 0,
    startedAt: startedAt ?? now(),
    updatedAt: updatedAt ?? now(),
  }
}

interface NormalizeOptions {
  strict: boolean
  now: () => string
}

const normalizeAppData = (value: unknown, options: NormalizeOptions): AppData | null => {
  if (!isObject(value)) return null
  const version = value.version
  if (options.strict && version !== APP_DATA_VERSION) return null
  if (version !== undefined && version !== APP_DATA_VERSION) return null

  if (options.strict && !Array.isArray(value.records)) return null
  const rawRecords = value.records ?? []
  if (!Array.isArray(rawRecords)) return null
  const records = rawRecords.map((record, index) => normalizeAttempt(record, index)).filter((record): record is AttemptRecord => record !== null)
  if (records.length !== rawRecords.length) return null

  const rawAttempts = value.attempts
  if (rawAttempts !== undefined && !Array.isArray(rawAttempts)) return null
  const attemptsFromRecords = records.flatMap((record) => record.answers)
  const attempts = (Array.isArray(rawAttempts) ? rawAttempts : attemptsFromRecords)
    .map((attempt, index) => normalizeAnswer(attempt, index))
    .filter((attempt): attempt is AnswerAttempt => attempt !== null)
  if (Array.isArray(rawAttempts) && attempts.length !== rawAttempts.length) return null

  const rawProgress = value.progress ?? []
  if (!Array.isArray(rawProgress)) return null
  const progress = rawProgress.map(normalizeProgress).filter((item): item is QuestionProgress => item !== null)
  if (progress.length !== rawProgress.length) return null

  // Accept a single `draft`/`active` field as a small migration seam for
  // earlier UI builds; all newly written documents use the drafts array.
  const rawDrafts = value.drafts ?? (value.draft !== undefined ? [value.draft] : value.active !== undefined ? [value.active] : [])
  if (!Array.isArray(rawDrafts)) return null
  const drafts = rawDrafts.map((item, index) => normalizeDraft(item, index, options.now, options.strict)).filter((item): item is PracticeDraft => item !== null)
  if (drafts.length !== rawDrafts.length) return null

  return { version: APP_DATA_VERSION, records, attempts, progress, drafts }
}

const getBrowserStorage = (): StorageLike | null => {
  try {
    if (typeof globalThis.localStorage === 'undefined') return null
    return globalThis.localStorage
  } catch {
    return null
  }
}

const createMemoryStorage = (): StorageLike => {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

// A process-local fallback keeps the top-level helpers useful during SSR and
// in tests that do not provide a browser `localStorage` implementation.
const fallbackStorage = createMemoryStorage()

const safeRead = (storage: StorageLike, key: string): string | null => {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const safeWrite = (storage: StorageLike, key: string, value: string): void => {
  try {
    storage.setItem(key, value)
  } catch {
    // Quota/security errors should not make a React render crash.
  }
}

const safeRemove = (storage: StorageLike, key: string): void => {
  try {
    storage.removeItem(key)
  } catch {
    // Ignore unavailable storage; the in-memory state is still cleared.
  }
}

const isStorageLike = (value: unknown): value is StorageLike =>
  isObject(value) && typeof value.getItem === 'function' && typeof value.setItem === 'function' && typeof value.removeItem === 'function'

const optionsFrom = (value?: PersistenceOptions | StorageLike): PersistenceOptions | undefined => {
  if (value === undefined) return undefined
  return isStorageLike(value) ? { storage: value } : value
}

const defaultIdFactory = (): string => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const createPersistence = (options: PersistenceOptions = {}): PersistenceApi => {
  const storage = options.storage ?? getBrowserStorage() ?? fallbackStorage
  const storageKey = options.storageKey ?? APP_STORAGE_KEY
  const now = options.now ?? (() => new Date().toISOString())
  const idFactory = options.idFactory ?? defaultIdFactory

  const loadAppData = (): AppData => {
    const raw = safeRead(storage, storageKey)
    if (!raw) return emptyAppData()
    try {
      const parsed: unknown = JSON.parse(raw)
      return normalizeAppData(parsed, { strict: true, now }) ?? emptyAppData()
    } catch {
      return emptyAppData()
    }
  }

  const saveAppData = (data: AppData): AppData => {
    const normalized = normalizeAppData(data, { strict: false, now })
    if (!normalized) throw new PersistenceValidationError('無法保存：本機資料格式不正確。')
    safeWrite(storage, storageKey, JSON.stringify(normalized))
    return normalized
  }

  const exportAppData = (data?: AppData): string => {
    const value = data === undefined ? loadAppData() : saveForExport(data)
    return JSON.stringify(value, null, 2)
  }

  const saveForExport = (data: AppData): AppData => {
    const normalized = normalizeAppData(data, { strict: false, now })
    if (!normalized) throw new PersistenceValidationError('無法匯出：本機資料格式不正確。')
    return normalized
  }

  const importAppData = (json: string): AppData => {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new PersistenceValidationError('匯入失敗：不是有效的 JSON。')
    }
    if (!isObject(parsed)) throw new PersistenceValidationError('匯入失敗：資料必須是 JSON 物件。')

    const envelopeVersion = parsed.version
    const payload = isObject(parsed.data) ? parsed.data : parsed
    const payloadVersion = payload.version
    if (envelopeVersion !== undefined && envelopeVersion !== APP_DATA_VERSION) {
      throw new PersistenceValidationError(`匯入失敗：不支援的資料版本 ${String(envelopeVersion)}。`)
    }
    if (payloadVersion !== undefined && payloadVersion !== APP_DATA_VERSION) {
      throw new PersistenceValidationError(`匯入失敗：不支援的資料版本 ${String(payloadVersion)}。`)
    }
    const normalized = normalizeAppData(payload, { strict: true, now })
    if (!normalized) throw new PersistenceValidationError('匯入失敗：資料欄位或型別不正確。')
    return saveAppData(normalized)
  }

  const tryImportAppData = (json: string): ImportResult => {
    try {
      return { ok: true, data: importAppData(json) }
    } catch (error) {
      const validationError =
        error instanceof PersistenceValidationError
          ? error
          : new PersistenceValidationError('匯入失敗：資料欄位或型別不正確。')
      return { ok: false, error: validationError }
    }
  }

  const clearAppData = (): void => safeRemove(storage, storageKey)

  const loadDraft = (id?: string): PracticeDraft | null => {
    const drafts = loadAppData().drafts
    if (id) return drafts.find((draft) => draft.id === id) ?? null
    return drafts.reduce<PracticeDraft | null>((latest, draft) => {
      if (!latest) return draft
      return draft.updatedAt >= latest.updatedAt ? draft : latest
    }, null)
  }

  const saveDraft = (draft: PracticeDraft): PracticeDraft => {
    const draftWithId = draft.id ? draft : { ...draft, id: idFactory() }
    const normalized = normalizeDraft(draftWithId, 0, now, false)
    if (!normalized) throw new PersistenceValidationError('無法保存：未完成作答草稿格式不正確。')
    const data = loadAppData()
    const drafts = data.drafts.filter((item) => item.id !== normalized.id)
    drafts.push(normalized)
    saveAppData({ ...data, drafts })
    return normalized
  }

  const clearDraft = (id?: string): void => {
    if (!id) {
      const data = loadAppData()
      if (data.drafts.length > 0) saveAppData({ ...data, drafts: [] })
      return
    }
    const data = loadAppData()
    const drafts = data.drafts.filter((draft) => draft.id !== id)
    if (drafts.length !== data.drafts.length) saveAppData({ ...data, drafts })
  }

  const appendRecord = (record: AttemptRecord): AppData => {
    const data = loadAppData()
    const normalized = normalizeAttempt(record, data.records.length)
    if (!normalized) throw new PersistenceValidationError('無法保存：作答紀錄格式不正確。')
    return saveAppData({
      ...data,
      records: [...data.records.filter((item) => item.id !== normalized.id), normalized],
      attempts: [...data.attempts, ...normalized.answers],
    })
  }

  return {
    loadAppData,
    saveAppData,
    exportAppData,
    importAppData,
    tryImportAppData,
    clearAppData,
    loadDraft,
    saveDraft,
    clearDraft,
    appendRecord,
  }
}

export const isAppData = (value: unknown): value is AppData =>
  normalizeAppData(value, { strict: true, now: () => new Date().toISOString() }) !== null

export const validateAppData = (value: unknown): AppData => {
  const normalized = normalizeAppData(value, { strict: true, now: () => new Date().toISOString() })
  if (!normalized) throw new PersistenceValidationError('資料欄位或型別不正確。')
  return normalized
}

export const loadAppData = (options?: PersistenceOptions | StorageLike): AppData =>
  createPersistence(optionsFrom(options)).loadAppData()

export const saveAppData = (data: AppData, options?: PersistenceOptions | StorageLike): AppData =>
  createPersistence(optionsFrom(options)).saveAppData(data)

export const exportAppData = (data?: AppData, options?: PersistenceOptions | StorageLike): string =>
  createPersistence(optionsFrom(options)).exportAppData(data)

export const importAppData = (json: string, options?: PersistenceOptions | StorageLike): AppData =>
  createPersistence(optionsFrom(options)).importAppData(json)

export const tryImportAppData = (json: string, options?: PersistenceOptions | StorageLike): ImportResult =>
  createPersistence(optionsFrom(options)).tryImportAppData(json)

export const clearAppData = (options?: PersistenceOptions | StorageLike): void =>
  createPersistence(optionsFrom(options)).clearAppData()

export const loadDraft = (id?: string, options?: PersistenceOptions | StorageLike): PracticeDraft | null =>
  createPersistence(optionsFrom(options)).loadDraft(id)

export const saveDraft = (draft: PracticeDraft, options?: PersistenceOptions | StorageLike): PracticeDraft =>
  createPersistence(optionsFrom(options)).saveDraft(draft)

export const clearDraft = (id?: string, options?: PersistenceOptions | StorageLike): void =>
  createPersistence(optionsFrom(options)).clearDraft(id)

export default createPersistence
