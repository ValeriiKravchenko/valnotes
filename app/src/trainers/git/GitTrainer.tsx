// ============================================================
// Раздел 1 git-тренажёра: интерфейс. Состояние живёт в движке (engine/) —
// этот файл только показывает SectionState и передаёт действия игрока
// в runCommand/editFile/deleteFile/createFile/resetSection. Никакого
// поведения git здесь не решается заново.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import type { HistoryEntry, MissionView, SectionState } from './engine'
import { Stage, createFile, createSection, deleteFile, editFile, getHeadTree, getMissions, getStage, getStatus, repoHasNoFiles, resetSection, runCommand } from './engine'
import { ru } from './locales/ru'

function isCommandEntry(h: HistoryEntry): h is Extract<HistoryEntry, { kind: 'command' }> {
  return h.kind === 'command'
}

// ---------- Терминал ----------

function Terminal({ state, onRun }: { state: SectionState; onRun: (input: string) => void }) {
  const [draft, setDraft] = useState('')
  // Текст, набранный до входа в историю ↑/↓ — возвращается по ↓ после последней команды.
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

  const prompt = ru.ui.terminal.prompt(state.branch)

  return (
    <section className="border b flex min-w-0 flex-col h-[420px] md:h-[520px]">
      <div className="label px-4 py-2 border-b b">{ru.ui.terminal.title}</div>
      <div ref={outputRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[12px] leading-5">
        {state.history.length === 0 && <p className="text-[var(--muted)]"># {ru.ui.terminal.emptyHistory}</p>}
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
          placeholder={ru.ui.terminal.placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label={ru.ui.terminal.inputAriaLabel}
          className="flex-1 bg-transparent text-white outline-none placeholder:text-[var(--muted)]"
        />
      </div>
    </section>
  )
}

// ---------- Статус рабочего дерева ----------

function StatusBadge({ text }: { text: string }) {
  return <span className="label border b px-1.5 py-0.5">{text}</span>
}

function StatusPanel({ state }: { state: SectionState }) {
  const stage = getStage(state)
  const status = getStatus(state)
  const noFiles = repoHasNoFiles(state)

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ru.ui.status.title}</div>
      <div className="space-y-3 px-4 py-3">
        <p className="text-[var(--muted)]">{ru.ui.status.branchLabel(status.branch)}</p>
        {stage === Stage.NoRepo && <p>{ru.explain.notAGitRepo}</p>}
        {stage !== Stage.NoRepo && noFiles && <p className="text-[var(--muted)]">{ru.ui.status.empty}</p>}
        {stage !== Stage.NoRepo && !noFiles && (
          <>
            {status.staged.length > 0 && (
              <div>
                <p className="label mb-1">{ru.ui.status.stagedGroup}</p>
                <ul className="space-y-1">
                  {status.staged.map((f) => (
                    <li key={f.file} className="flex items-center gap-2">
                      <StatusBadge text={f.type} />
                      <span>{f.file}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {status.notStaged.length > 0 && (
              <div>
                <p className="label mb-1">{ru.ui.status.notStagedGroup}</p>
                <ul className="space-y-1">
                  {status.notStaged.map((f) => (
                    <li key={f.file} className="flex items-center gap-2">
                      <StatusBadge text={f.type} />
                      <span>{f.file}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {status.untracked.length > 0 && (
              <div>
                <p className="label mb-1">{ru.ui.status.untrackedGroup}</p>
                <ul className="space-y-1">
                  {status.untracked.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <StatusBadge text={ru.ui.status.untrackedBadge} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stage === Stage.Clean && <p className="text-[var(--muted)]">{ru.ui.status.clean}</p>}
          </>
        )}
      </div>
    </section>
  )
}

// ---------- Три области Git ----------

function AreaColumn({
  label,
  files,
  empty,
  note,
}: {
  label: string
  files: string[]
  empty: string
  note: (file: string) => string | null
}) {
  return (
    <div className="px-4 py-3">
      <p className="label mb-2">{label}</p>
      {files.length === 0 ? (
        <p className="text-[var(--muted)]">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => {
            const n = note(f)
            return (
              <li key={f}>
                <p className="text-white">{f}</p>
                {n && <p className="text-[11px] text-[var(--muted)]">{n}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function AreasDiagram({ state }: { state: SectionState }) {
  const status = getStatus(state)
  const headTree = getHeadTree(state)
  const workingFiles = Object.keys(state.working).sort()
  const indexFiles = Object.keys(state.index).sort()
  const headFiles = Object.keys(headTree).sort()

  const untrackedSet = new Set(status.untracked)
  const modifiedNotStagedSet = new Set(status.notStaged.filter((e) => e.type === 'modified').map((e) => e.file))
  const stagedTypeByFile = new Map(status.staged.map((e) => [e.file, e.type]))

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ru.ui.areas.title}</div>
      <div className="grid grid-cols-1 divide-y divide-[var(--border)] md:grid-cols-3 md:divide-x md:divide-y-0">
        <AreaColumn
          label={ru.ui.areas.workingLabel}
          files={workingFiles}
          empty={ru.ui.areas.empty}
          note={(f) => (untrackedSet.has(f) ? ru.ui.areas.newUntracked : modifiedNotStagedSet.has(f) ? ru.ui.areas.modifiedAfterAdd : null)}
        />
        <AreaColumn
          label={ru.ui.areas.indexLabel}
          files={indexFiles}
          empty={ru.ui.areas.empty}
          note={(f) => {
            const type = stagedTypeByFile.get(f)
            return type === 'new file' ? ru.ui.areas.willCommitNew : type === 'modified' ? ru.ui.areas.willCommitModified : null
          }}
        />
        <AreaColumn
          label={ru.ui.areas.headLabel}
          files={headFiles}
          empty={state.commits.length === 0 ? ru.ui.areas.noCommits : ru.ui.areas.empty}
          note={() => null}
        />
      </div>
      <div className="label flex justify-between border-t b px-4 py-2 text-[var(--muted)]">
        <span>{ru.ui.areas.addArrow}</span>
        <span>{ru.ui.areas.commitArrow}</span>
      </div>
      <p className="border-t b px-4 py-3 text-[var(--muted)]">{ru.ui.areas.caption(state.commits.length)}</p>
    </section>
  )
}

// ---------- Граф коммитов ----------

function CommitGraph({ state }: { state: SectionState }) {
  const commits = state.commits.slice().reverse()
  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ru.ui.commitGraph.title}</div>
      <div className="px-4 py-3">
        {commits.length === 0 ? (
          <p className="text-[var(--muted)]">{ru.ui.commitGraph.empty}</p>
        ) : (
          <ul className="space-y-3">
            {commits.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="accent">{c.id}</span>
                <span className="text-white">{c.message}</span>
                {i === 0 && state.branch && <span className="label">{ru.ui.commitGraph.headArrow(state.branch)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// ---------- Файлы в рабочем дереве ----------

function FilesPanel({
  state,
  onEdit,
  onDelete,
  onCreate,
}: {
  state: SectionState
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
      <div className="label px-4 py-2 border-b b">{ru.ui.files.title}</div>
      <div className="space-y-4 px-4 py-3">
        {files.length === 0 ? (
          <p className="text-[var(--muted)]">{ru.ui.files.empty}</p>
        ) : (
          <ul className="space-y-3">
            {files.map((f) => (
              <li key={f} className="border b p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white">{f}</span>
                  <div className="flex gap-3 text-[12px]">
                    <button type="button" onClick={() => onEdit(f)} className="nav-link">
                      {ru.ui.files.editButton}
                    </button>
                    <button type="button" onClick={() => onDelete(f)} className="nav-link">
                      {ru.ui.files.deleteButton}
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
            placeholder={ru.ui.files.newFileNamePlaceholder}
            className="flex-1 border b bg-transparent px-2 py-1 text-white outline-none placeholder:text-[var(--muted)]"
          />
          <button type="button" onClick={submitCreate} className="nav-link border b px-3 py-1">
            {ru.ui.files.createButton}
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------- Миссии ----------

function MissionsPanel({ missions }: { missions: MissionView[] }) {
  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ru.ui.missions.title}</div>
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

export default function GitTrainer() {
  const [state, setState] = useState<SectionState>(createSection)

  function handleRun(input: string) {
    const { state: next, result } = runCommand(state, input)
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
    setState(resetSection())
  }

  const missions = getMissions(state)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl uppercase tracking-tight text-white">{ru.ui.heading}</h1>
          <p className="label mt-1">{ru.ui.subheading}</p>
        </div>
        <button type="button" onClick={handleReset} className="nav-link label border b px-3 py-1">
          {ru.ui.resetButton}
        </button>
      </div>
      <p className="max-w-2xl text-[var(--muted)]">{ru.ui.intro}</p>

      {/* На телефоне терминал идёт перед панелями (сознательное решение исходного тренажёра) — здесь это
          естественный порядок в разметке: при grid-cols-1 колонки складываются друг под другом по DOM-порядку. */}
      <div className="grid gap-6 md:grid-cols-2">
        <Terminal state={state} onRun={handleRun} />
        <div className="min-w-0 space-y-6">
          <StatusPanel state={state} />
          <CommitGraph state={state} />
          <FilesPanel state={state} onEdit={handleEdit} onDelete={handleDelete} onCreate={handleCreate} />
        </div>
      </div>

      <AreasDiagram state={state} />
      <MissionsPanel missions={missions} />
    </div>
  )
}
