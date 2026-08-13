import { ChangeEvent, useMemo, useState } from 'react'
import { Question, questions, sessions, sourceLabel, SourceType, subjects, topics } from './data'
import { createMockExam, randomSelectQuestions } from './domain'
import { getLearningNote, learningNoteSourceLabel } from './learningNotes'

type Page = 'home' | 'practice' | 'mock' | 'wrong' | 'history' | 'settings' | 'active'
type Mode = 'practice' | 'mock' | 'wrong'
type Answer = 'A' | 'B' | 'C' | 'D'

interface Attempt {
  questionId: string
  selected: Answer
  correct: boolean
  at: string
  mode: Mode
  countsForMastery: boolean
}

interface Result {
  questionId: string
  selected: Answer | null
  correct: boolean
}

interface RecordItem {
  id: string
  completedAt: string
  mode: Mode
  filters: string
  total: number
  correct: number
  results: Result[]
}

interface ActiveSession {
  mode: Mode
  questionIds: string[]
  answers: Record<string, Answer>
  revealed: string[]
  marked?: string[]
  index: number
  filters: string
  startedAt: string
}

interface StoredData {
  version: 1
  records: RecordItem[]
  attempts: Attempt[]
  active: ActiveSession | null
}

const storageKey = 'ai-practice-data-v1'
const blankData = (): StoredData => ({ version: 1, records: [], attempts: [], active: null })

const readData = (): StoredData => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '')
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && (parsed as StoredData).version === 1) {
      const data = parsed as StoredData
      return { records: Array.isArray(data.records) ? data.records : [], attempts: Array.isArray(data.attempts) ? data.attempts : [], active: data.active ?? null, version: 1 }
    }
  } catch { /* Start safely if browser data is malformed. */ }
  return blankData()
}

const formatDate = (iso: string) => new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
const formatPercent = (correct: number, total: number) => total ? `${Math.round((correct / total) * 100)}%` : '—'
const localDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })

const consecutiveDays = (records: RecordItem[]) => {
  const days = new Set(records.map((record) => localDay(new Date(record.completedAt))))
  let count = 0
  const date = new Date()
  while (days.has(localDay(date))) { count += 1; date.setDate(date.getDate() - 1) }
  return count
}

const getMastery = (questionId: string, attempts: Attempt[]) => {
  const history = attempts.filter((attempt) => attempt.questionId === questionId)
  const failed = history.some((attempt) => !attempt.correct)
  if (!failed) return 'new' as const
  const lastWrong = history.filter((attempt) => !attempt.correct).at(-1)
  const qualified = history.filter((attempt) => attempt.correct && attempt.countsForMastery && (!lastWrong || Date.parse(attempt.at) > Date.parse(lastWrong.at))).length
  if (qualified >= 2) return 'mastered' as const
  if (qualified === 1) return 'reviewed' as const
  return 'due' as const
}

const masteryLabel = { new: '尚未作答', due: '待複習', reviewed: '複習答對', mastered: '已掌握' }

export default function App() {
  const [data, setData] = useState<StoredData>(readData)
  const [page, setPage] = useState<Page>('home')
  const [resumeChoice, setResumeChoice] = useState(Boolean(data.active))
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [selectedSources, setSelectedSources] = useState<SourceType[]>([])
  const [count, setCount] = useState('10')
  const [mockSession, setMockSession] = useState(sessions[0] ?? '')
  const [notice, setNotice] = useState('')
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [lastWrongRecord, setLastWrongRecord] = useState<RecordItem | null>(null)

  const persist = (next: StoredData) => { localStorage.setItem(storageKey, JSON.stringify(next)); setData(next) }
  const activeQuestions = useMemo(() => data.active ? data.active.questionIds.map((id) => questions.find((question) => question.id === id)).filter((question): question is Question => Boolean(question)) : [], [data.active])
  const activeQuestion = data.active ? activeQuestions[data.active.index] : undefined

  const start = (mode: Mode, pool: readonly { id: string }[], filters: string) => {
    if (data.active) { setResumeChoice(true); setPage('active'); return }
    if (!pool.length) { setNotice('沒有符合條件的題目。'); return }
    const amount = count === 'all' ? pool.length : Math.min(Number(count), pool.length)
    const selected = pool.slice(0, amount)
    const active: ActiveSession = { mode, questionIds: selected.map((question) => question.id), answers: {}, revealed: [], marked: [], index: 0, filters, startedAt: new Date().toISOString() }
    persist({ ...data, active })
    setNotice(''); setResumeChoice(false); setPage('active')
  }

  const startPractice = () => {
    const pool = questions.filter((question) =>
      (!selectedSubjects.length || selectedSubjects.includes(question.subject)) &&
      (!selectedTopics.length || selectedTopics.includes(question.topic)) &&
      (!selectedSources.length || selectedSources.includes(question.source_type)),
    )
    const labels = [
      selectedSubjects.length ? selectedSubjects.join('、') : '全部科目',
      selectedTopics.length ? selectedTopics.join('、') : '全部主題',
      selectedSources.length ? selectedSources.map((item) => sourceLabel[item]).join('、') : '全部來源',
    ]
    start('practice', randomSelectQuestions(pool, count === 'all' ? 'all' : Number(count)), labels.join('／'))
  }

  const startWrong = () => {
    const pool = questions.filter((question) => getMastery(question.id, data.attempts) === 'due')
    setLastWrongRecord(null)
    start('wrong', randomSelectQuestions(pool, count === 'all' ? 'all' : Number(count)), '待複習錯題')
  }

  const startMock = () => {
    if (data.active) { setResumeChoice(true); setPage('active'); return }
    const subjectForMock = subjects.find((item) => questions.filter((question) => question.source_type === 'official_exam' && question.session === mockSession && question.subject === item).length === 50)
    if (!subjectForMock) { setNotice('此考次尚無可用的 50 題單科模擬測驗。'); return }
    const exam = createMockExam(questions, { session: mockSession, subject: subjectForMock })
    const active: ActiveSession = { mode: 'mock', questionIds: exam.questions.map((question) => question.id), answers: {}, revealed: [], marked: [], index: 0, filters: `${mockSession}／${subjectForMock}`, startedAt: new Date().toISOString() }
    persist({ ...data, active }); setNotice(''); setResumeChoice(false); setPage('active')
  }

  const choose = (answer: Answer) => {
    if (!data.active || !activeQuestion) return
    if (data.active.mode !== 'mock' && data.active.revealed.includes(activeQuestion.id)) return
    const revealed = data.active.mode !== 'mock' ? [...data.active.revealed, activeQuestion.id] : data.active.revealed
    persist({ ...data, active: { ...data.active, answers: { ...data.active.answers, [activeQuestion.id]: answer }, revealed } })
  }

  const complete = () => {
    if (!data.active) return
    const now = new Date().toISOString()
    const results = data.active.questionIds.map((questionId) => {
      const question = questions.find((item) => item.id === questionId)!
      const selected = data.active!.answers[questionId] ?? null
      return { questionId, selected, correct: selected === question.correct_answer }
    })
    const attempts: Attempt[] = [...data.attempts]
    results.forEach((result) => {
      if (!result.selected) return
      const lastWrong = attempts.filter((attempt) => attempt.questionId === result.questionId && !attempt.correct).at(-1)
      const prior = attempts.filter((attempt) => attempt.questionId === result.questionId && attempt.correct && attempt.countsForMastery && (!lastWrong || Date.parse(attempt.at) > Date.parse(lastWrong.at))).at(-1)
      const countsForMastery = result.correct && data.active!.mode === 'wrong' && (!prior || Date.parse(now) - Date.parse(prior.at) >= 86_400_000)
      attempts.push({ questionId: result.questionId, selected: result.selected, correct: result.correct, at: now, mode: data.active!.mode, countsForMastery })
    })
    const record: RecordItem = { id: crypto.randomUUID(), completedAt: now, mode: data.active.mode, filters: data.active.filters, total: results.length, correct: results.filter((result) => result.correct).length, results }
    persist({ ...data, records: [record, ...data.records], attempts, active: null })
    setResumeChoice(false)
    if (record.mode === 'wrong') { setLastWrongRecord(record); setPage('wrong') } else { setPage('history') }
  }

  const pause = () => { setResumeChoice(false); setPage(data.active?.mode === 'wrong' ? 'wrong' : 'home') }
  const abandon = () => { if (!window.confirm('確定放棄這次作答嗎？未完成進度不會保留。')) return; persist({ ...data, active: null }); setResumeChoice(false); setPage(data.active?.mode === 'wrong' ? 'wrong' : 'home') }
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a')
    link.href = url; link.download = 'ai-practice-backup.json'; link.click(); URL.revokeObjectURL(url)
  }
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as { data?: StoredData }
      if (!parsed.data || parsed.data.version !== 1 || !Array.isArray(parsed.data.records) || !Array.isArray(parsed.data.attempts)) throw new Error('invalid')
      persist(parsed.data); setNotice('備份已匯入。')
    } catch { setNotice('無法辨識此備份檔。') }
    event.target.value = ''
  }

  if (data.active && resumeChoice) return <main className="app-shell"><section className="page"><h2>要繼續上次作答嗎？</h2><p className="muted">進度已保留，未交卷前不會計入成績。</p><button className="primary wide" onClick={() => { setResumeChoice(false); setPage('active') }}>繼續作答</button><button className="secondary wide" onClick={pause}>{data.active.mode === 'wrong' ? '返回錯題本' : '暫停並返回首頁'}</button><button className="danger wide" onClick={abandon}>放棄這次作答</button></section></main>
  if (data.active && activeQuestion && page === 'active') return <Quiz session={data.active} question={activeQuestion} index={data.active.index} total={activeQuestions.length} answer={data.active.answers[activeQuestion.id]} revealed={data.active.revealed.includes(activeQuestion.id)} onChoose={choose} onMove={(direction) => persist({ ...data, active: { ...data.active!, index: Math.min(Math.max(data.active!.index + direction, 0), activeQuestions.length - 1) } })} onMark={() => { const marked = data.active!.marked ?? []; persist({ ...data, active: { ...data.active!, marked: marked.includes(activeQuestion.id) ? marked.filter((id) => id !== activeQuestion.id) : [...marked, activeQuestion.id] } }) }} onComplete={complete} onPause={pause} onAbandon={abandon} />

  const masteryCounts = { due: questions.filter((question) => getMastery(question.id, data.attempts) === 'due').length, reviewed: questions.filter((question) => getMastery(question.id, data.attempts) === 'reviewed').length, mastered: questions.filter((question) => getMastery(question.id, data.attempts) === 'mastered').length }
  const totalCorrect = data.records.reduce((sum, record) => sum + record.correct, 0)
  const totalQuestions = data.records.reduce((sum, record) => sum + record.total, 0)

  return <main className="app-shell">
    <header><div><p className="eyebrow">AI 應用規劃師（初級）</p><h1>專心刷題，穩定進步</h1></div><button className="settings-button" onClick={() => setPage('settings')} aria-label="設定">⚙</button></header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {page === 'home' && <section className="page"><div className="hero"><p>今天也為自己累積一點把握。</p><button className="primary" onClick={() => setPage('practice')}>開始練習</button></div><div className="metrics"><Metric label="累計作答" value={`${totalQuestions} 題`} /><Metric label="整體正確率" value={formatPercent(totalCorrect, totalQuestions)} /><Metric label="連續學習" value={`${consecutiveDays(data.records)} 天`} /></div><h2>學習狀態</h2><div className="status-grid"><StatusCard label="待複習" value={masteryCounts.due} state="due" /><StatusCard label="複習答對" value={masteryCounts.reviewed} state="reviewed" /><StatusCard label="已掌握" value={masteryCounts.mastered} state="mastered" /></div><h2>科目與主題表現</h2><CategoryStats records={data.records} /><h2>最近紀錄</h2><RecordList records={data.records.slice(0, 4)} onSelect={(id) => { setSelectedRecordId(id); setPage('history') }} /></section>}
    {page === 'practice' && <section className="page"><h2>開始練習</h2><p className="muted">可複選篩選條件；未勾選代表不限制。</p><Filters subjects={selectedSubjects} topics={selectedTopics} sources={selectedSources} count={count} onSubjects={setSelectedSubjects} onTopics={setSelectedTopics} onSources={setSelectedSources} onCount={setCount} /><button className="primary wide" onClick={startPractice}>開始隨機練習</button></section>}
    {page === 'mock' && <section className="page"><h2>模擬測驗</h2><p className="muted">同一考次、同一科的 50 題官方考古題；交卷後統一評分。</p><label>選擇考次<select value={mockSession} onChange={(event) => setMockSession(event.target.value)}>{sessions.map((item) => <option key={item}>{item}</option>)}</select></label><button className="primary wide" onClick={startMock}>開始 50 題模擬測驗</button></section>}
    {page === 'wrong' && <WrongPage attempts={data.attempts} counts={masteryCounts} count={count} onCount={setCount} onStart={startWrong} lastRecord={lastWrongRecord} onViewRecord={() => { if (lastWrongRecord) { setSelectedRecordId(lastWrongRecord.id); setPage('history') } }} />}
    {page === 'history' && <HistoryPage records={data.records} initialRecordId={selectedRecordId} />}
    {page === 'settings' && <section className="page"><h2>設定與備份</h2><p className="muted">所有資料只留在此裝置的瀏覽器中。</p><button className="secondary wide" onClick={exportData}>匯出學習紀錄</button><label className="file-label">匯入 JSON 備份<input type="file" accept="application/json" onChange={importData} /></label><button className="danger wide" onClick={() => { if (window.confirm('確定清除所有作答紀錄、錯題與未完成作答嗎？此動作無法復原。')) { persist(blankData()); setPage('home') } }}>清除所有本機紀錄</button></section>}
    <nav>{([['home', '首頁'], ['practice', '練習'], ['mock', '模考'], ['wrong', '錯題'], ['history', '紀錄']] as [Page, string][]).map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>)}</nav>
  </main>
}

function Quiz({ session, question, index, total, answer, revealed, onChoose, onMove, onMark, onComplete, onPause, onAbandon }: { session: ActiveSession; question: Question; index: number; total: number; answer?: Answer; revealed: boolean; onChoose: (answer: Answer) => void; onMove: (direction: number) => void; onMark: () => void; onComplete: () => void; onPause: () => void; onAbandon: () => void }) {
  const immediateFeedback = session.mode !== 'mock'
  const allAnswered = session.questionIds.every((id) => Boolean(session.answers[id]))
  return <main className="quiz"><header><button className="text-button" onClick={onPause}>{session.mode === 'wrong' ? '返回錯題本' : '暫停返回首頁'}</button><span>{session.mode === 'practice' ? '練習模式' : session.mode === 'wrong' ? '錯題重練' : '模擬測驗'}</span><strong>{index + 1} / {total}</strong></header><div className="progress"><span style={{ width: `${((index + 1) / total) * 100}%` }} /></div><section className="question-card"><p className="meta">{question.subject} · {question.topic} · {sourceLabel[question.source_type]}</p>{question.version_sensitive && <p className="notice">⚠ 依原考次資訊：{question.exam_date ?? '日期未提供'}</p>}<h2>{question.stem}</h2><div className="options">{(['A', 'B', 'C', 'D'] as Answer[]).map((item) => <button key={item} className={`option ${answer === item ? 'selected' : ''} ${revealed && item === question.correct_answer ? 'correct' : ''} ${revealed && answer === item && item !== question.correct_answer ? 'incorrect' : ''}`} onClick={() => onChoose(item)}><b>{item}</b><span>{question.options[item]}</span></button>)}</div>{revealed && <Feedback question={question} correct={answer === question.correct_answer} />}</section><footer>{session.mode === 'mock' && <><button className="secondary" onClick={onMark}>{(session.marked ?? []).includes(question.id) ? '取消標記' : '標記待檢查'}</button><button className="secondary" onClick={() => onMove(-1)} disabled={index === 0}>上一題</button></>}<button className="danger quiet" onClick={onAbandon}>放棄本次</button>{index < total - 1 ? <button className="primary" onClick={() => onMove(1)} disabled={immediateFeedback && !revealed}>下一題</button> : <button className="primary" onClick={() => { if (immediateFeedback || window.confirm('確定交卷並計算成績嗎？')) onComplete() }} disabled={immediateFeedback ? !revealed : !allAnswered}>{immediateFeedback ? (session.mode === 'wrong' ? '完成重練' : '完成練習') : allAnswered ? '交卷並評分' : `尚有 ${total - Object.keys(session.answers).length} 題未答`}</button>}</footer></main>
}

function Feedback({ question, correct }: { question: Question; correct: boolean }) { const note = getLearningNote(question); return <aside className={correct ? 'feedback good' : 'feedback bad'}><strong>{correct ? '答對了！' : `正確答案：${question.correct_answer}`}</strong><strong>重點判讀：為何選 {question.correct_answer}</strong><p>{note.answerReasoning}</p><strong>教材重點摘要</strong><p>{note.materialSummary}</p><strong>概念補充</strong><p>{note.conceptSummary}</p><strong>答案定位</strong><p>{note.locatingText}</p><p>學習指引：{question.guide_location.guide_heading}（{question.guide_location.guide_section}，紙本 {question.guide_location.guide_printed_pages}／PDF {question.guide_location.guide_pdf_pages}）</p>{question.version_sensitive && <p>⚠ 依原考次資訊：{question.exam_date ?? '日期未提供'}</p>}<small>{learningNoteSourceLabel(question, note)}</small></aside> }

const toggle = <T,>(items: T[], item: T) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]
function MultiSelect<T extends string>({ label, options, selected, onChange, display }: { label: string; options: T[]; selected: T[]; onChange: (next: T[]) => void; display?: (item: T) => string }) { return <fieldset className="multi-select"><legend>{label}<small>{selected.length ? `已選 ${selected.length} 項` : '全部'}</small></legend><div>{options.map((item) => <label key={item}><input type="checkbox" checked={selected.includes(item)} onChange={() => onChange(toggle(selected, item))} /><span>{display ? display(item) : item}</span></label>)}</div></fieldset> }
function SubjectCards({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) { return <fieldset className="subject-cards"><legend>科目<small>{selected.length ? `已選 ${selected.length} 項` : '全部'}</small></legend><div>{subjects.map((subject) => { const isSelected = selected.includes(subject); return <button key={subject} type="button" className={isSelected ? 'selected' : ''} aria-pressed={isSelected} onClick={() => onChange(toggle(selected, subject))}><span>{subject}</span><small>{isSelected ? '已選取，再點一次取消' : '點選以加入篩選'}</small></button> })}</div></fieldset> }
function Filters({ subjects: chosenSubjects, topics: chosenTopics, sources: chosenSources, count, onSubjects, onTopics, onSources, onCount }: { subjects: string[]; topics: string[]; sources: SourceType[]; count: string; onSubjects: (value: string[]) => void; onTopics: (value: string[]) => void; onSources: (value: SourceType[]) => void; onCount: (value: string) => void }) { return <div className="filters"><SubjectCards selected={chosenSubjects} onChange={onSubjects} /><MultiSelect label="主題" options={topics} selected={chosenTopics} onChange={onTopics} /><MultiSelect label="來源" options={Object.keys(sourceLabel) as SourceType[]} selected={chosenSources} onChange={onSources} display={(item) => sourceLabel[item]} /><label>題數<select value={count} onChange={(event) => onCount(event.target.value)}><option value="10">10 題</option><option value="20">20 題</option><option value="50">50 題</option><option value="all">全部符合條件的題目</option></select></label></div> }

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
function StatusCard({ label, value, state }: { label: string; value: number; state: string }) { return <div className={`status-card ${state}`}><span>{label}</span><strong>{value}</strong><small>題</small></div> }
function RecordList({ records, detailed = false, onSelect }: { records: RecordItem[]; detailed?: boolean; onSelect?: (id: string) => void }) { return records.length ? <div className="record-list">{records.map((record) => <button className="record-card" key={record.id} onClick={() => onSelect?.(record.id)}><div><strong>{record.mode === 'mock' ? '模擬測驗' : record.mode === 'wrong' ? '錯題重練' : '練習'}</strong><span>{record.filters}</span><small>{formatDate(record.completedAt)}</small></div><b>{record.correct}/{record.total}<small> · {formatPercent(record.correct, record.total)}</small>{record.mode === 'mock' && <small> · {record.correct * 2} 分</small>}</b>{detailed && <em>{record.total - record.correct} 題待加強 · 點選查看題目</em>}</button>)}</div> : <p className="empty">尚無完成紀錄，開始第一回練習吧。</p> }
function HistoryPage({ records, initialRecordId }: { records: RecordItem[]; initialRecordId: string | null }) { const groups = Object.entries(records.reduce<Record<string, RecordItem[]>>((all, record) => { const day = localDay(new Date(record.completedAt)); (all[day] ??= []).push(record); return all }, {})).sort(([left], [right]) => right.localeCompare(left)); const initialDay = records.find((record) => record.id === initialRecordId); const defaultDay = initialDay ? localDay(new Date(initialDay.completedAt)) : groups[0]?.[0] ?? null; const [openDay, setOpenDay] = useState<string | null>(defaultDay); const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialRecordId); const today = localDay(new Date()); return <section className="page"><h2>學習紀錄</h2><p className="muted">今天預設展開；其他日期點選後查看當日練習，再點選一筆紀錄查看逐題結果與解析。</p>{groups.length ? <div className="day-groups">{groups.map(([day, dayRecords]) => { const open = openDay === day; const total = dayRecords.reduce((sum, record) => sum + record.total, 0); const correct = dayRecords.reduce((sum, record) => sum + record.correct, 0); const label = day === today ? `今天 · ${day}` : day; return <section className="day-group" key={day}><button className={`day-summary ${open ? 'expanded' : ''}`} aria-expanded={open} onClick={() => { setOpenDay(open ? null : day); setSelectedRecordId(null) }}><div><strong>{label}</strong><span>{dayRecords.length} 次練習 · 共 {total} 題 · 正確率 {formatPercent(correct, total)}</span></div><b>{open ? '收合' : '展開'}</b><small>{total - correct} 題待加強</small></button>{open && <div className="record-list day-records">{dayRecords.map((record) => { const selected = selectedRecordId === record.id; return <div className="record-result" key={record.id}><button className={`record-card ${selected ? 'expanded' : ''}`} aria-expanded={selected} onClick={() => setSelectedRecordId(selected ? null : record.id)}><div><strong>{record.mode === 'mock' ? '模擬測驗' : record.mode === 'wrong' ? '錯題重練' : '練習'}</strong><span>{record.filters}</span><small>{formatDate(record.completedAt)}</small></div><b>{record.correct}/{record.total}<small> · {formatPercent(record.correct, record.total)}</small>{record.mode === 'mock' && <small> · {record.correct * 2} 分</small>}</b><em>{record.total - record.correct} 題待加強 · {selected ? '收合逐題結果' : '點選查看題目'}</em></button>{selected && <ReviewResults record={record} onCollapse={() => setSelectedRecordId(null)} />}</div> })}</div>}</section> })}</div> : <p className="empty">尚無完成紀錄，開始第一回練習吧。</p>}</section> }
function QuestionStatusList({ attempts, expandedId, onToggle }: { attempts: Attempt[]; expandedId: string | null; onToggle: (id: string) => void }) { const ids = [...new Set(attempts.filter((attempt) => !attempt.correct).map((attempt) => attempt.questionId))]; return ids.length ? <div className="status-list">{ids.map((id) => { const question = questions.find((item) => item.id === id)!; const history = attempts.filter((attempt) => attempt.questionId === id); const status = getMastery(id, attempts); const retries = history.filter((attempt) => attempt.correct && attempt.countsForMastery).length; const lastWrong = history.filter((attempt) => !attempt.correct).at(-1); const lastValidReview = history.filter((attempt) => attempt.correct && attempt.countsForMastery).at(-1); const canCountAgain = !lastValidReview || Date.now() - Date.parse(lastValidReview.at) >= 86_400_000; const expanded = expandedId === id; const lastAttempt = history.at(-1); return <div className="question-result" key={id}><button className={`question-row ${expanded ? 'expanded' : ''}`} aria-expanded={expanded} onClick={() => onToggle(id)}><div><strong>{question.topic}</strong><span>{question.stem}</span></div><b className={status}>{masteryLabel[status]}</b><small>{expanded ? '收合完整題目與解析' : `有效複習答對 ${retries}/2 次 · 點選查看解析`}</small><small className="review-progress">{lastWrong && `上次答錯：${formatDate(lastWrong.at)}　`}{lastValidReview ? (canCountAgain ? '下一次答對可計入掌握' : '下一次有效複習需相隔 24 小時') : '完成一次複習答對後開始累積'}</small></button>{expanded && <QuestionDetail question={question} selected={lastAttempt?.selected} onCollapse={() => onToggle(id)} />}</div> })}</div> : <p className="empty">還沒有錯題紀錄。</p> }
function CategoryStats({ records }: { records: RecordItem[] }) { const results = records.flatMap((record) => record.results); const rows = (values: string[], by: (question: Question) => string) => values.map((value) => { const ids = new Set(questions.filter((question) => by(question) === value).map((question) => question.id)); const matched = results.filter((result) => ids.has(result.questionId)); return { value, correct: matched.filter((result) => result.correct).length, total: matched.length } }).filter((row) => row.total).sort((left, right) => (left.correct / left.total) - (right.correct / right.total)); const subjectRows = rows(subjects, (question) => question.subject); const topicRows = rows(topics, (question) => question.topic).slice(0, 6); return <><h3>科目</h3><MiniStats rows={subjectRows} empty="完成練習後會顯示科目表現。" /><h3>主題（優先顯示待加強）</h3><MiniStats rows={topicRows} empty="完成練習後會顯示主題表現。" /></> }
function MiniStats({ rows, empty }: { rows: { value: string; correct: number; total: number }[]; empty: string }) { return rows.length ? <div className="performance-chart">{rows.map((row) => { const percent = Math.round((row.correct / row.total) * 100); const tone = percent < 60 ? 'low' : percent < 80 ? 'medium' : 'high'; return <div className="performance-row" key={row.value}><div><span>{row.value}</span><b>{percent}%</b></div><div className="performance-track"><i className={tone} style={{ width: `${percent}%` }} /></div><small>{row.correct}/{row.total} 題</small></div> })}</div> : <p className="empty">{empty}</p> }
function QuestionDetail({ question, selected, onCollapse }: { question: Question; selected?: Answer | null; onCollapse?: () => void }) { const note = getLearningNote(question); return <article className="question-detail"><p className="meta">{question.subject} · {question.topic} · {sourceLabel[question.source_type]}</p><h3>{question.stem}</h3><div className="detail-options">{(['A', 'B', 'C', 'D'] as Answer[]).map((choice) => <p key={choice} className={choice === question.correct_answer ? 'correct-answer' : choice === selected ? 'your-answer' : ''}><b>{choice}</b>{question.options[choice]}{choice === selected && <small>你的答案</small>}{choice === question.correct_answer && <small>正確答案</small>}</p>)}</div><div className="answer-location"><strong>重點判讀：為何選 {question.correct_answer}</strong><p>{note.answerReasoning}</p><small>{learningNoteSourceLabel(question, note)}</small><strong>教材重點摘要</strong><p>{note.materialSummary}</p><strong>概念補充</strong><p>{note.conceptSummary}</p><strong>答案在哪裡找到？</strong><p>{note.locatingText}</p><p>學習指引：{question.guide_location.guide_heading}（{question.guide_location.guide_section}）</p><p>紙本頁碼：{question.guide_location.guide_printed_pages}　PDF 頁碼：{question.guide_location.guide_pdf_pages}</p>{note.caution && <p className="caution">⚠ {note.caution}</p>}</div>{onCollapse && <button className="secondary collapse-detail" onClick={onCollapse}>收合本題解析</button>}</article> }
function ReviewResults({ record, onCollapse }: { record: RecordItem; onCollapse?: () => void }) { const [selectedId, setSelectedId] = useState<string | null>(null); const [filter, setFilter] = useState<'all' | 'wrong'>('all'); const displayed = record.results.map((result, index) => ({ result, index })).filter(({ result }) => filter === 'all' || !result.correct); return <section><h2>本次逐題結果</h2><div className="tab-row result-filter"><button className={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>全部（{record.total}）</button><button className={filter === 'wrong' ? 'primary' : 'secondary'} onClick={() => setFilter('wrong')}>僅看答錯（{record.total - record.correct}）</button></div>{displayed.length ? <div className="status-list">{displayed.map(({ result, index }) => { const item = questions.find((question) => question.id === result.questionId)!; const expanded = selectedId === result.questionId; return <div className="question-result" key={result.questionId}><button className={`question-row ${expanded ? 'expanded' : ''}`} aria-expanded={expanded} onClick={() => setSelectedId(expanded ? null : result.questionId)}><div><strong>第 {index + 1} 題 · {result.correct ? '答對' : '答錯'}</strong><span>{item.stem}</span></div><b>{result.selected ?? '未作答'}／{item.correct_answer}</b><small>{expanded ? '收合完整題目與解析' : '點選查看完整題目與解析'}</small></button>{expanded && <QuestionDetail question={item} selected={result.selected} onCollapse={() => setSelectedId(null)} />}</div> })}</div> : <p className="empty">這次沒有答錯題目。</p>}{onCollapse && <button className="secondary wide collapse-results" onClick={onCollapse}>收合本次結果，回到當日紀錄</button>}</section> }
function WrongDistribution({ attempts }: { attempts: Attempt[] }) { const wrongIds = [...new Set(attempts.filter((attempt) => !attempt.correct).map((attempt) => attempt.questionId))]; const grouped = wrongIds.reduce<Record<string, number>>((all, id) => { const topic = questions.find((question) => question.id === id)?.topic ?? '其他'; all[topic] = (all[topic] ?? 0) + 1; return all }, {}); const allEntries = Object.entries(grouped).sort(([, left], [, right]) => right - left); const leading = allEntries.slice(0, 5); const remaining = allEntries.slice(5).reduce((sum, [, value]) => sum + value, 0); const entries = remaining ? [...leading, ['其他主題', remaining] as [string, number]] : leading; const colors = ['#315a48', '#d98a36', '#5484a6', '#8d6aa8', '#c65f5f', '#839b64']; let progress = 0; const segments = entries.map(([, value], index) => { const start = progress; progress += (value / wrongIds.length) * 100; return `${colors[index]} ${start}% ${progress}%` }); return wrongIds.length ? <section className="wrong-distribution" aria-label="累計錯題主題分布"><div><h3>錯題分布</h3><p>依主題統計；同一題重複答錯只計一次。</p></div><div className="distribution-content"><div className="donut" style={{ background: `conic-gradient(${segments.join(', ')})` }}><div><strong>{wrongIds.length}</strong><small>錯題</small></div></div><ol className="distribution-legend">{entries.map(([topic, value], index) => <li key={topic}><i style={{ backgroundColor: colors[index] }} /><span>{topic}</span><b>{value} 題 · {Math.round((value / wrongIds.length) * 100)}%</b></li>)}</ol></div></section> : null }
function WrongPage({ attempts, counts, count, onCount, onStart, lastRecord, onViewRecord }: { attempts: Attempt[]; counts: { due: number; reviewed: number; mastered: number }; count: string; onCount: (value: string) => void; onStart: () => void; lastRecord: RecordItem | null; onViewRecord: () => void }) { const [filter, setFilter] = useState<'due' | 'reviewed' | 'mastered'>('due'); const [selectedId, setSelectedId] = useState<string | null>(null); const visible = attempts.filter((attempt) => !attempt.correct).filter((attempt, index, all) => all.findIndex((item) => item.questionId === attempt.questionId) === index).filter((attempt) => getMastery(attempt.questionId, attempts) === filter); const visibleAttempts = visible.flatMap((item) => attempts.filter((attempt) => attempt.questionId === item.questionId)); const selectedAmount = count === 'all' ? counts.due : Math.min(Number(count), counts.due); return <section className="page"><h2>錯題本</h2><p className="muted">錯題需在不同日累積兩次複習答對，才會標示為已掌握。</p>{lastRecord && <aside className="review-summary"><strong>本次錯題重練完成</strong><p>{lastRecord.correct}/{lastRecord.total} 題答對 · {formatPercent(lastRecord.correct, lastRecord.total)}</p><button className="secondary" onClick={onViewRecord}>查看本次逐題結果</button></aside>}<div className="status-grid"><StatusCard label="待複習" value={counts.due} state="due" /><StatusCard label="複習答對" value={counts.reviewed} state="reviewed" /><StatusCard label="已掌握" value={counts.mastered} state="mastered" /></div><WrongDistribution attempts={attempts} /><div className="tab-row">{(['due', 'reviewed', 'mastered'] as const).map((state) => <button className={filter === state ? 'primary' : 'secondary'} key={state} onClick={() => { setFilter(state); setSelectedId(null) }}>{masteryLabel[state]}</button>)}</div><label className="wrong-count">本次重練題數<select value={count} onChange={(event) => onCount(event.target.value)}><option value="10">10 題</option><option value="20">20 題</option><option value="50">50 題</option><option value="all">全部待複習錯題</option></select></label><button className="primary wide" disabled={!counts.due} onClick={onStart}>重練待複習錯題（{selectedAmount} 題）</button><p className="muted list-count">{masteryLabel[filter]}，共 {visible.length} 題</p><QuestionStatusList attempts={visibleAttempts} expandedId={selectedId} onToggle={(id) => setSelectedId(id === selectedId ? null : id)} /></section> }
