import { describe, expect, it } from 'vitest'

import {
  APP_STORAGE_KEY,
  APP_DATA_VERSION,
  PersistenceValidationError,
  createPersistence,
  type AttemptRecord,
  type PracticeDraft,
  type StorageLike,
} from './index'

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const makeAttempt = (id = 'attempt-1'): AttemptRecord => ({
  id,
  mode: 'random',
  startedAt: '2026-08-11T10:00:00.000Z',
  completedAt: '2026-08-11T10:05:00.000Z',
  filters: { subject: '科目一' },
  questionCount: 1,
  correctCount: 1,
  accuracy: 1,
  answers: [
    {
      questionId: 'question-1',
      selectedAnswer: 'A',
      correctAnswer: 'A',
      isCorrect: true,
      order: 0,
      answeredAt: '2026-08-11T10:04:00.000Z',
    },
  ],
})

const makeDraft = (): PracticeDraft => ({
  id: 'draft-1',
  mode: 'mock',
  questionIds: ['question-1', 'question-2'],
  answers: [
    {
      questionId: 'question-1',
      selectedAnswer: 'B',
      answeredAt: '2026-08-11T10:04:00.000Z',
    },
  ],
  currentIndex: 1,
  startedAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:04:00.000Z',
})

describe('browser persistence', () => {
  it('returns a versioned empty document when storage is empty', () => {
    const storage = new MemoryStorage()
    const persistence = createPersistence({ storage })

    expect(persistence.loadAppData()).toEqual({
      version: APP_DATA_VERSION,
      records: [],
      attempts: [],
      progress: [],
      drafts: [],
    })
  })

  it('does not throw or trust a corrupted value in localStorage', () => {
    const storage = new MemoryStorage()
    storage.setItem(APP_STORAGE_KEY, '{not valid json')
    const persistence = createPersistence({ storage })

    expect(persistence.loadAppData()).toEqual({
      version: APP_DATA_VERSION,
      records: [],
      attempts: [],
      progress: [],
      drafts: [],
    })
  })

  it('round-trips records and keeps the storage value versioned', () => {
    const storage = new MemoryStorage()
    const persistence = createPersistence({ storage })
    const data = { ...persistence.loadAppData(), records: [makeAttempt()] }

    persistence.saveAppData(data)

    expect(persistence.loadAppData().records).toEqual([makeAttempt()])
    expect(JSON.parse(storage.getItem(APP_STORAGE_KEY) ?? '')).toMatchObject({ version: APP_DATA_VERSION })
  })

  it('exports JSON and imports validated data without partially writing invalid input', () => {
    const sourceStorage = new MemoryStorage()
    const source = createPersistence({ storage: sourceStorage })
    const data = { ...source.loadAppData(), records: [makeAttempt()] }
    source.saveAppData(data)
    const exported = source.exportAppData()

    const targetStorage = new MemoryStorage()
    const target = createPersistence({ storage: targetStorage })
    expect(target.importAppData(exported).records).toEqual([makeAttempt()])
    expect(() => target.importAppData('{"version":999,"records":[]}')).toThrow(PersistenceValidationError)
    expect(target.loadAppData().records).toEqual([makeAttempt()])
  })

  it('clears all app data', () => {
    const storage = new MemoryStorage()
    const persistence = createPersistence({ storage })
    persistence.saveAppData({ ...persistence.loadAppData(), records: [makeAttempt()] })

    persistence.clearAppData()

    expect(storage.getItem(APP_STORAGE_KEY)).toBeNull()
    expect(persistence.loadAppData().records).toEqual([])
  })

  it('saves, retrieves, replaces, and clears unfinished drafts', () => {
    const storage = new MemoryStorage()
    const persistence = createPersistence({ storage })
    const draft = makeDraft()

    persistence.saveDraft(draft)
    expect(persistence.loadDraft()).toEqual(draft)

    const updated = { ...draft, currentIndex: 2 }
    persistence.saveDraft(updated)
    expect(persistence.loadDraft('draft-1')).toEqual(updated)

    persistence.clearDraft('draft-1')
    expect(persistence.loadDraft()).toBeNull()
  })

  it('rejects malformed imported documents', () => {
    const persistence = createPersistence({ storage: new MemoryStorage() })

    expect(() => persistence.importAppData(JSON.stringify({ version: APP_DATA_VERSION, records: 'nope' }))).toThrow(
      PersistenceValidationError,
    )
    expect(() => persistence.importAppData(JSON.stringify({ version: APP_DATA_VERSION }))).toThrow(PersistenceValidationError)
  })
})
