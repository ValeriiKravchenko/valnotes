// ============================================================
// Раздел 6 git-тренажёра («Поиск в репозитории»), ШАГ A — репозиторий
// «Проект» (grep, blame, show, log): интерфейс. Состояние живёт в движке
// (engine/searchSection.ts) — этот файл только показывает SearchState и
// передаёт ввод игрока в runSearchCommand. Никакого поведения git здесь не
// решается заново.
//
// Устройство — сокращённый аналог InspectTrainer.tsx (раздел 3): терминал,
// файлы с содержимым, миссии шага A, «начать раздел заново». Без панели
// статуса рабочего дерева и без графа коммитов — в этом репозитории их
// незачем показывать: правок файлов нет, index/working отдельно от дерева
// коммита не бывает, ветка одна и HEAD всегда на ней (searchTypes.ts,
// шапка SearchState) — «рабочее дерево», «индекс» и «HEAD» здесь всегда
// один и тот же снимок, показывать один снимок тремя одинаковыми колонками
// не за чем.
//
// ШАГ B («Магазин», git bisect) сюда не входит — движок его не реализует
// (см. заметку в шапке engine/searchSection.ts). Второго терминала и панели
// bisect на этой странице нет.
//
// Компоненты этого файла приватны разделу 6 и не переиспользуют компоненты
// GitTrainer.tsx/BranchingTrainer.tsx/InspectTrainer.tsx/UndoTrainer.tsx —
// состояния и функции движка у всех разделов разные, общих компонентов
// между ними нет.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { createSearchSection, getHeadTree, getSearchMissions, runSearchCommand } from './engine/searchSection'
import type { HistoryEntry, SearchMissionView, SearchState } from './engine/searchSection'
import { ru } from './locales/ru'

const rs = ru.searching
const ui = rs.ui

function createInitialState(): SearchState {
  return createSearchSection(rs.seed)
}

function isCommandEntry(h: HistoryEntry): h is Extract<HistoryEntry, { kind: 'command' }> {
  return h.kind === 'command'
}

// ---------- Терминал ----------

function Terminal({ state, onRun }: { state: SearchState; onRun: (input: string) => void }) {
  const [draft, setDraft] = useState('')
  const [pendingDraft, setPendingDraft] = useState<string | null>(null)
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  const commandHistory = state.history.filter(isCommandEntry)

  useEffect(() => {
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.history.length])

  function submit() {
    if (!draft.trim()) return
    onRun(draft)
    setDraft('')
    setHistoryIndex(null)
    setPendingDraft(null)
  }

  function navigateHistory(direction: -1 | 1) {
    if (!commandHistory.length) return
    if (historyIndex === null) {
      if (direction === 1) return
      setPendingDraft(draft)
      setHistoryIndex(commandHistory.length - 1)
      setDraft(commandHistory[commandHistory.length - 1].input)
      return
    }
    const next = historyIndex + direction
    if (next < 0) return
    if (next >= commandHistory.length) {
      setHistoryIndex(null)
      setDraft(pendingDraft ?? '')
      setPendingDraft(null)
      return
    }
    setHistoryIndex(next)
    setDraft(commandHistory[next].input)
  }

  const prompt = ui.terminal.prompt(state.head)

  return (
    <section className="border b flex min-w-0 flex-col h-[420px] md:h-[520px]">
      <div className="label px-4 py-2 border-b b">{ui.terminal.title}</div>
      <div ref={outputRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[12px] leading-5">
        {state.history.length === 0 && <p className="text-[var(--muted)]"># {ui.terminal.emptyHistory}</p>}
        {state.history.map((entry, i) =>
          isCommandEntry(entry) ? (
            <div key={i}>
              <p className="break-words text-white">
                <span className="accent">{prompt}</span> {entry.input}
              </p>
              {entry.output && (
                <pre className={`whitespace-pre-wrap break-words ${entry.ok ? 'text-[var(--text)]' : 'text-red-400'}`}>{entry.output}</pre>
              )}
              {entry.explanation && <p className="mt-1 break-words text-[var(--accent)]">💡 {entry.explanation}</p>}
            </div>
          ) : (
            <p key={i} className="text-[var(--muted)]"># {entry.text}</p>
          ),
        )}
      </div>
      <div className="flex items-center gap-2 border-t b px-4 py-3">
        <span className="accent">{prompt}</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            else if (e.key === 'ArrowUp') {
              e.preventDefault()
              navigateHistory(-1)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              navigateHistory(1)
            }
          }}
          placeholder={ui.terminal.placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label={ui.terminal.inputAriaLabel}
          className="flex-1 bg-transparent text-white outline-none placeholder:text-[var(--muted)]"
        />
      </div>
    </section>
  )
}

// ---------- Файлы «Проекта» ----------
//
// В отличие от FilesPanel разделов 1–4 здесь нет ни «✎ изменить», ни «создать», ни «удалить»: в
// этом репозитории правок файлов не бывает вовсе (searchTypes.ts, шапка SearchState — «в разделе
// нет команд, создающих коммиты или меняющих файлы»). Показывается ровно то, что в дереве коммита,
// на который указывает единственная ветка (getHeadTree) — панель только показывает состояние,
// не позволяя ничего в нём поменять.

function FilesPanel({ state }: { state: SearchState }) {
  const head = getHeadTree(state)
  const files = Object.keys(head).sort()

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ui.files.title}</div>
      <div className="px-4 py-3">
        <ul className="space-y-3">
          {files.map((f) => (
            <li key={f} className="border b p-3">
              <span className="text-white">{f}</span>
              <pre className="mt-2 whitespace-pre-wrap break-words text-[var(--muted)]">{head[f]}</pre>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ---------- Миссии ----------

function MissionsPanel({ missions }: { missions: SearchMissionView[] }) {
  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ui.missions.title}</div>
      <ul className="space-y-3 px-4 py-3">
        {missions.map((m) => (
          <li key={m.id} className={`flex items-start gap-3 ${m.done ? 'text-[var(--muted)]' : ''}`}>
            <span className="accent">{m.done ? '✓' : '—'}</span>
            <span className={m.done ? 'line-through' : ''}>
              {m.text}
              <span className="mt-1 block text-[11px] text-[var(--muted)] no-underline">{m.hint}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------- Тренажёр целиком ----------

export default function SearchTrainer() {
  const [state, setState] = useState<SearchState>(createInitialState)

  function handleRun(input: string) {
    const { state: next, result } = runSearchCommand(state, input)
    if (result === null) return
    setState(next)
  }
  function handleReset() {
    setState(createInitialState())
  }

  const missions = getSearchMissions(state)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl uppercase tracking-tight text-white">{ui.heading}</h1>
          <p className="label mt-1">{ui.subheading}</p>
        </div>
        <button type="button" onClick={handleReset} className="nav-link label border b px-3 py-1">
          {ui.resetButton}
        </button>
      </div>
      <p className="max-w-2xl text-[var(--muted)]">{ui.intro}</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Terminal state={state} onRun={handleRun} />
        <FilesPanel state={state} />
      </div>

      <MissionsPanel missions={missions} />
    </div>
  )
}
