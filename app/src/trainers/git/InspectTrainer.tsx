// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): интерфейс. Состояние живёт
// в движке (engine/inspectSection.ts) — этот файл только показывает
// InspectState и передаёт действия игрока в runInspectCommand/editFile/
// deleteFile/createFile. Никакого поведения git здесь не решается заново.
//
// В отличие от раздела 2 (BranchingTrainer.tsx) здесь нет графа коммитов:
// история раздела 3 линейная (одна ветка, коммитов слияния нет —
// inspectTypes.ts), и она и так видна через `git log` в терминале — рисовать
// тот же список вторым способом на панели рядом значило бы дублировать
// то, что уже честно показывает сама команда.
//
// Компоненты этого файла приватны разделу 3 и не переиспользуют компоненты
// GitTrainer.tsx/BranchingTrainer.tsx (разделов 1–2) — состояния и функции
// движка у всех трёх разделов разные (см. шапку inspectTypes.ts), общих
// компонентов между ними нет.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { createFile, createInspectSection, deleteFile, editFile, getHeadTree, getInspectMissions, runInspectCommand } from './engine/inspectSection'
import type { FileTree, HistoryEntry, InspectMissionView, InspectState } from './engine/inspectSection'
import { ru } from './locales/ru'

const ri = ru.inspecting
const ui = ri.ui

function createInitialState(): InspectState {
  return createInspectSection(ri.seed)
}

function isCommandEntry(h: HistoryEntry): h is Extract<HistoryEntry, { kind: 'command' }> {
  return h.kind === 'command'
}

/** Равенство двух снимков файлового дерева — обычное сравнение записей, без интерпретации
 * git-правил (что считается staged/unstaged/untracked — это остаётся внутри движка,
 * inspectRepo.ts; здесь только «совпадают ли два набора файл→содержимое как данные»). */
function sameFileTree(a: FileTree, b: FileTree): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k])
}

// ---------- Терминал ----------

function Terminal({ state, onRun }: { state: InspectState; onRun: (input: string) => void }) {
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

// ---------- Статус рабочего дерева ----------
//
// Та же сознательная граница, что и в StatusPanel раздела 2 (BranchingTrainer.tsx, см. её
// комментарий): подробная классификация staged/not staged/untracked — правило git, посчитанное
// движком (inspectRepo.ts, formatInspectStatus/formatInspectStatusShort) — не переносится сюда
// вторым, не связанным с движком способом. Панель показывает только сырые списки файлов трёх
// областей (working/index/HEAD) и факт «совпадают ли они»; построчный разбор — дело `git status`
// и `git status -s` в терминале.

function FileList({ label, files }: { label: string; files: string[] }) {
  return (
    <div className="px-4 py-3">
      <p className="label mb-2">{label}</p>
      {files.length === 0 ? (
        <p className="text-[var(--muted)]">{ui.status.empty}</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f} className="text-white">
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusPanel({ state }: { state: InspectState }) {
  const head = getHeadTree(state)
  const workingFiles = Object.keys(state.working).sort()
  const indexFiles = Object.keys(state.index).sort()
  const headFiles = Object.keys(head).sort()
  const clean = sameFileTree(state.working, state.index) && sameFileTree(state.index, head)

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ui.status.title}</div>
      <div className="px-4 py-3">
        <p className="text-[var(--muted)]">{ui.status.branchLabel(state.head)}</p>
      </div>
      <div className="grid grid-cols-1 divide-y divide-[var(--border)] border-t b md:grid-cols-3 md:divide-x md:divide-y-0">
        <FileList label={ui.status.workingLabel} files={workingFiles} />
        <FileList label={ui.status.indexLabel} files={indexFiles} />
        <FileList label={ui.status.headLabel} files={headFiles} />
      </div>
      <div className="border-t b px-4 py-3 text-[var(--muted)]">
        <p>{clean ? ui.status.clean : ui.status.dirty}</p>
        <p className="mt-1">{ui.status.detailHint}</p>
      </div>
    </section>
  )
}

// ---------- Файлы в рабочем дереве ----------
//
// Та же сознательная граница, что и в FilesPanel раздела 2 (BranchingTrainer.tsx, см. её
// комментарий): «✎ изменить» дописывает фиксированный суффикс (engine/inspectFileOps.ts,
// editFile — нет параметра content), полноценного редактора здесь по той же причине нет.

function FilesPanel({
  state,
  onEdit,
  onDelete,
  onCreate,
}: {
  state: InspectState
  onEdit: (file: string) => void
  onDelete: (file: string) => void
  onCreate: (name: string) => void
}) {
  const [newName, setNewName] = useState('')
  const files = Object.keys(state.working).sort()

  function submitCreate() {
    onCreate(newName)
    setNewName('')
  }

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ui.files.title}</div>
      <div className="space-y-4 px-4 py-3">
        {files.length === 0 ? (
          <p className="text-[var(--muted)]">{ui.files.empty}</p>
        ) : (
          <ul className="space-y-3">
            {files.map((f) => (
              <li key={f} className="border b p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white">{f}</span>
                  <div className="flex gap-3 text-[12px]">
                    <button type="button" onClick={() => onEdit(f)} className="nav-link">
                      {ui.files.editButton}
                    </button>
                    <button type="button" onClick={() => onDelete(f)} className="nav-link">
                      {ui.files.deleteButton}
                    </button>
                  </div>
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-words text-[var(--muted)]">{state.working[f]}</pre>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate()
            }}
            placeholder={ui.files.newFileNamePlaceholder}
            className="flex-1 border b bg-transparent px-2 py-1 text-white outline-none placeholder:text-[var(--muted)]"
          />
          <button type="button" onClick={submitCreate} className="nav-link border b px-3 py-1">
            {ui.files.createButton}
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------- Миссии ----------

function MissionsPanel({ missions }: { missions: InspectMissionView[] }) {
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

export default function InspectTrainer() {
  const [state, setState] = useState<InspectState>(createInitialState)

  function handleRun(input: string) {
    const { state: next, result } = runInspectCommand(state, input)
    if (result === null) return
    setState(next)
  }
  function handleEdit(file: string) {
    setState(editFile(state, file))
  }
  function handleDelete(file: string) {
    setState(deleteFile(state, file))
  }
  function handleCreate(name: string) {
    setState(createFile(state, name))
  }
  function handleReset() {
    setState(createInitialState())
  }

  const missions = getInspectMissions(state)

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
      <p className="max-w-2xl text-[13px] text-[var(--muted)]">{ui.noAuthorDateNote}</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Terminal state={state} onRun={handleRun} />
        <div className="min-w-0 space-y-6">
          <StatusPanel state={state} />
          <FilesPanel state={state} onEdit={handleEdit} onDelete={handleDelete} onCreate={handleCreate} />
        </div>
      </div>

      <MissionsPanel missions={missions} />
    </div>
  )
}
