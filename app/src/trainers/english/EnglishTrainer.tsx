// ============================================================
// Тренажёр английских слов: интерфейс. Состояние сессии и прогресса живёт
// здесь (в компоненте), а не в движке (engine/) — сам движок только принимает
// его параметром и возвращает пересчитанное. Все решения о том, что и когда
// показывать, — на стороне интерфейса; правила Лейтнера, даты повтора и т.п.
// решает исключительно engine/.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  answerCurrent,
  createSession,
  currentWord,
  getStats,
  isSessionFinished,
  parseProgress,
  serializeProgress,
} from './engine'
import type { ParseProgressError, ProgressStore, SessionState } from './engine'
import { getLocalToday, shuffleArray } from './browserEnv'
import { brokenProgressExport, loadInitialProgress, writeStoredProgress } from './progressStorage'
import { loadInitialSession, writeStoredSession } from './sessionStorage'
import { englishWordIds, getWordById } from './words'
import { ru } from './locales/ru'

const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

function speak(word: string) {
  if (!speechSupported) return
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  // отменяем то, что ещё договаривается — иначе повторные клики ставят фразы в очередь
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- Карточка слова ----------

function WordCard({
  wordId,
  revealed,
  onReveal,
  onAnswer,
}: {
  wordId: string
  revealed: boolean
  onReveal: () => void
  onAnswer: (answer: 'know' | 'dontKnow') => void
}) {
  const word = getWordById(wordId)
  if (!word) return null // не должно случаться — id сессии всегда берутся из englishWordIds

  return (
    <section className="border b">
      <div className="flex items-center justify-between gap-4 border-b b px-4 py-4">
        <h2 className="break-words text-2xl text-white">{word.word}</h2>
        {speechSupported && (
          <button
            type="button"
            onClick={() => speak(word.word)}
            aria-label={ru.ui.card.listenAriaLabel}
            className="nav-link label border b px-3 py-1"
          >
            {ru.ui.card.listenButton}
          </button>
        )}
      </div>

      {!revealed ? (
        <div className="px-4 py-6">
          <button type="button" onClick={onReveal} className="nav-link border b px-4 py-2 text-white">
            {ru.ui.card.revealButton}
            <span className="ml-2 label">[{ru.ui.card.revealHint}]</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="label mb-1">{ru.ui.card.translationLabel}</p>
            <p className="text-white">{word.translation}</p>
          </div>
          <div>
            <p className="label mb-1">{ru.ui.card.exampleLabel}</p>
            <p className="text-[var(--muted)]">{word.example}</p>
          </div>
          {word.note && (
            <div>
              <p className="label mb-1">{ru.ui.card.noteLabel}</p>
              <p className="text-[var(--muted)]">{word.note}</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => onAnswer('dontKnow')} className="nav-link border b px-4 py-2">
              {ru.ui.card.dontKnowButton}
              <span className="ml-2 label">[{ru.ui.card.dontKnowHint}]</span>
            </button>
            <button type="button" onClick={() => onAnswer('know')} className="nav-link border b px-4 py-2 text-white">
              {ru.ui.card.knowButton}
              <span className="ml-2 label">[{ru.ui.card.knowHint}]</span>
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------- Статистика ----------

function StatsPanel({ progress, today }: { progress: ProgressStore; today: string }) {
  const stats = getStats(progress, englishWordIds, today)
  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ru.ui.stats.title}</div>
      <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b b">
        <div className="px-4 py-3">
          <p className="text-xl text-white">{stats.newCount}</p>
          <p className="label mt-1">{ru.ui.stats.newCount}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xl text-white">{stats.learning}</p>
          <p className="label mt-1">{ru.ui.stats.learning}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xl text-white">{stats.learned}</p>
          <p className="label mt-1">{ru.ui.stats.learned}</p>
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-xl accent">{stats.dueToday}</p>
        <p className="label mt-1">{ru.ui.stats.dueToday}</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{ru.ui.stats.dueTodayNote}</p>
      </div>
    </section>
  )
}

// ---------- Прогресс: экспорт / импорт ----------

function ProgressPanel({
  progress,
  onImported,
}: {
  progress: ProgressStore
  onImported: (store: ProgressStore) => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    downloadJson(`english-progress-${getLocalToday()}.json`, serializeProgress(progress))
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // чтобы повторный выбор того же файла снова сработал
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const result = parseProgress(text)
      if (!result.ok) {
        setMessage(ru.ui.progress.importError(ru.parseErrorText[result.error]))
        return
      }
      if (!window.confirm(ru.ui.progress.importConfirm)) return
      onImported(result.store)
      setMessage(ru.ui.progress.importSuccess)
    }
    reader.readAsText(file)
  }

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ru.ui.progress.title}</div>
      <div className="flex flex-wrap gap-3 px-4 py-3">
        <button type="button" onClick={handleExport} className="nav-link label border b px-3 py-1">
          {ru.ui.progress.exportButton}
        </button>
        <button type="button" onClick={handleImportClick} className="nav-link label border b px-3 py-1">
          {ru.ui.progress.importButton}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      {message && <p className="border-t b px-4 py-3 text-[var(--muted)]">{message}</p>}
    </section>
  )
}

// ---------- Тренажёр целиком ----------

export default function EnglishTrainer() {
  const [initial] = useState(() => {
    const loaded = loadInitialProgress()
    // Сессия дня восстанавливается как есть, если она сохранена на сегодня (см.
    // sessionStorage.ts) — иначе createSession собрал бы её заново и обошёл дневной
    // лимит новых слов при каждой перезагрузке страницы.
    const session = loadInitialSession(loaded.store, englishWordIds, getLocalToday(), shuffleArray)
    return { progress: loaded.store, loadError: loaded.error, brokenRaw: loaded.brokenRaw, session }
  })
  const [progress, setProgress] = useState<ProgressStore>(() => initial.progress)
  const [session, setSession] = useState<SessionState>(() => initial.session)
  const [loadError, setLoadError] = useState<ParseProgressError | null>(() => initial.loadError)
  // сырая испорченная строка прогресса — только для кнопки «скачать испорченные данные»;
  // уже скопирована в BROKEN_PROGRESS_STORAGE_KEY на этапе loadInitialProgress
  const [brokenRaw] = useState<string | null>(() => initial.brokenRaw)
  // id слова, для которого сейчас показан перевод. Не совпадает с текущим wordId —
  // значит, для новой карточки перевод ещё не открыт (без лишнего эффекта на смену wordId).
  const [revealedWordId, setRevealedWordId] = useState<string | null>(null)

  const wordId = currentWord(session)
  const finished = isSessionFinished(session)
  const revealed = revealedWordId !== null && revealedWordId === wordId

  function handleAnswer(answer: 'know' | 'dontKnow') {
    const today = getLocalToday()
    const result = answerCurrent(session, progress, answer, today)
    setSession(result.session)
    setProgress(result.progress)
    writeStoredProgress(serializeProgress(result.progress))
    writeStoredSession(today, result.session)
    // с этого момента в хранилище лежит настоящий прогресс, а не пустой — сообщение о
    // повреждённом файле, если оно было, больше не описывает то, что реально сохранено
    setLoadError(null)
  }

  function handleImported(store: ProgressStore) {
    const today = getLocalToday()
    const newSession = createSession(store, englishWordIds, today, shuffleArray)
    setProgress(store)
    writeStoredProgress(serializeProgress(store))
    setSession(newSession)
    writeStoredSession(today, newSession)
    setLoadError(null)
  }

  function handleReveal() {
    if (wordId) setRevealedWordId(wordId)
  }

  function handleDownloadBroken() {
    if (!brokenRaw) return
    const { filename, content } = brokenProgressExport(brokenRaw, getLocalToday())
    downloadJson(filename, content)
  }

  // Горячие клавиши: пробел — показать перевод, 1 — не знаю, 2 — знаю.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (finished) return
      if (!revealed) {
        if (e.code === 'Space') {
          e.preventDefault()
          handleReveal()
        }
        return
      }
      if (e.key === '1') handleAnswer('dontKnow')
      else if (e.key === '2') handleAnswer('know')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl uppercase tracking-tight text-white">{ru.ui.heading}</h1>
        <p className="label mt-1">{ru.ui.subheading}</p>
      </div>
      <p className="max-w-2xl text-[var(--muted)]">{ru.ui.intro}</p>

      {loadError && (
        <div className="border b px-4 py-3">
          <p className="text-red-400">{ru.ui.progress.loadError(ru.parseErrorText[loadError])}</p>
          {brokenRaw && (
            <button type="button" onClick={handleDownloadBroken} className="nav-link label border b mt-3 px-3 py-1">
              {ru.ui.progress.downloadBrokenButton}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0 space-y-4">
          {!finished && <p className="label">{ru.ui.wordsLeft(session.queue.length)}</p>}
          {finished ? (
            <section className="border b px-4 py-8 text-center">
              <h2 className="text-xl text-white">{ru.ui.finished.heading}</h2>
              <p className="mt-3 text-[var(--muted)]">{ru.ui.finished.text}</p>
            </section>
          ) : (
            wordId && <WordCard wordId={wordId} revealed={revealed} onReveal={handleReveal} onAnswer={handleAnswer} />
          )}
        </div>
        <div className="min-w-0 space-y-6">
          <StatsPanel progress={progress} today={getLocalToday()} />
          <ProgressPanel progress={progress} onImported={handleImported} />
        </div>
      </div>
    </div>
  )
}
