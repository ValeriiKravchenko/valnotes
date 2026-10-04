// ============================================================
// Раздел 2 git-тренажёра («Ветвление кода»), шаг A: интерфейс. Состояние
// живёт в движке (engine/branchSection.ts) — этот файл только показывает
// BranchingState и передаёт действия игрока в runBranchingCommand/editFile/
// deleteFile/createFile. Никакого поведения git здесь не решается заново —
// см. отчёт интегратора про две сознательные упрощения интерфейса
// (детальная разбивка git status и полнотекстовый редактор файла), обе
// вызваны тем, чего движок не отдаёт наружу, а не решением UI подменить
// собой движок.
//
// Компоненты этого файла приватны разделу 2 и не переиспользуют компоненты
// GitTrainer.tsx (раздел 1) — состояния и функции движка у разделов разные
// (одна ветка против графа веток), общих компонентов между ними нет.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import {
  createBranchingSection,
  createFile,
  deleteFile,
  editFile,
  getAllCommits,
  getBranchMissions,
  getCurrentBranch,
  getHeadTree,
  runBranchingCommand,
} from './engine/branchSection'
import type { BranchCommit, BranchingState, BranchMissionView, FileTree, HistoryEntry } from './engine/branchSection'
import { ru } from './locales/ru'

const rb = ru.branching
const ui = rb.ui

function createInitialState(): BranchingState {
  return createBranchingSection(rb.seed.rootMessage, { [rb.seed.file]: rb.seed.content })
}

function isCommandEntry(h: HistoryEntry): h is Extract<HistoryEntry, { kind: 'command' }> {
  return h.kind === 'command'
}

/** Равенство двух снимков файлового дерева — обычное сравнение записей, без интерпретации
 * git-правил (что считается staged/unstaged/untracked — это остаётся внутри движка,
 * branchRepo.ts; здесь только «совпадают ли два набора файл→содержимое как данные»). */
function sameFileTree(a: FileTree, b: FileTree): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k])
}

// ---------- Терминал ----------

function Terminal({ state, onRun }: { state: BranchingState; onRun: (input: string) => void }) {
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

  const prompt = ui.terminal.prompt(getCurrentBranch(state))

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
// Разбивку staged/not staged/untracked (как в StatusPanel раздела 1) эта панель сознательно НЕ
// воспроизводит: та классификация — правило git (target.md, A1/A3) — живёт в branchingStatus
// (engine/branchRepo.ts), а branchRepo.ts — внутренний модуль раздела 2, не предназначенный для
// прямого импорта интегратором (см. шапку branchTypes.ts/branchSection.ts) и не переэкспортированный
// через branchSection.ts. Повторить эту классификацию здесь значило бы завести второй, не
// связанный с движком, источник правды о том, что такое staged/untracked — именно то, чего просит
// избегать памятка интегратора. Поэтому панель показывает только сырые списки файлов трёх областей
// (working/index/HEAD — публичные поля BranchingState) и факт «совпадают ли они», а подробный
// разбор оставляет команде git status в терминале, где он честно посчитан движком.

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

function StatusPanel({ state }: { state: BranchingState }) {
  const head = getHeadTree(state)
  const workingFiles = Object.keys(state.working).sort()
  const indexFiles = Object.keys(state.index).sort()
  const headFiles = Object.keys(head).sort()
  const clean = sameFileTree(state.working, state.index) && sameFileTree(state.index, head)

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ui.status.title}</div>
      <div className="px-4 py-3">
        <p className="text-[var(--muted)]">{ui.status.branchLabel(getCurrentBranch(state))}</p>
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

// ---------- Граф коммитов ----------

/** Топологический порядок (родители раньше потомков) — «сортировка/раскладка — дело
 * интерфейса», см. комментарий над getAllCommits в branchSection.ts. Уровень коммита —
 * 1 + максимум уровня его родителей (0 у корневого); тай-брейк по id — только для устойчивого
 * порядка отрисовки, ни на что в модели не влияет. */
function topologicalOrder(commits: BranchCommit[]): BranchCommit[] {
  const byId = new Map(commits.map((c) => [c.id, c]))
  const level = new Map<string, number>()
  function levelOf(id: string): number {
    const cached = level.get(id)
    if (cached !== undefined) return cached
    const c = byId.get(id)
    const l = c && c.parents.length ? 1 + Math.max(...c.parents.map(levelOf)) : 0
    level.set(id, l)
    return l
  }
  commits.forEach((c) => levelOf(c.id))
  return commits.slice().sort((a, b) => {
    const diff = levelOf(a.id) - levelOf(b.id)
    if (diff !== 0) return diff
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

function CommitGraph({ state }: { state: BranchingState }) {
  const currentBranch = getCurrentBranch(state)
  const branchesAtCommit = new Map<string, string[]>()
  Object.keys(state.branches)
    .sort()
    .forEach((name) => {
      const tip = state.branches[name]
      const list = branchesAtCommit.get(tip) ?? []
      list.push(name)
      branchesAtCommit.set(tip, list)
    })

  const commits = topologicalOrder(getAllCommits(state)).reverse()

  return (
    <section className="border b">
      <div className="label px-4 py-2 border-b b">{ui.commitGraph.title}</div>
      <div className="px-4 py-3">
        <ul className="space-y-3">
          {commits.map((c) => {
            const names = branchesAtCommit.get(c.id) ?? []
            // Текущая ветка — первой и с меткой HEAD (как «HEAD -> имя» у настоящего git), остальные — следом.
            const tags = [
              ...(names.includes(currentBranch) ? [ui.commitGraph.headTag(currentBranch)] : []),
              ...names.filter((n) => n !== currentBranch),
            ]
            return (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="accent">{c.id}</span>
                <span className="text-white">{c.message}</span>
                {c.parents.length === 2 && <span className="label">{ui.commitGraph.mergeParents(c.parents[0].slice(0, 7), c.parents[1].slice(0, 7))}</span>}
                {tags.map((t) => (
                  <span key={t} className="label border b px-1.5 py-0.5">
                    {t}
                  </span>
                ))}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

// ---------- Файлы в рабочем дереве ----------
//
// «✎ изменить» здесь — та же кнопка без модального редактора, что и в разделе 1
// (GitTrainer.tsx, FilesPanel): она вызывает editFile движка, который дописывает фиксированный
// суффикс к текущему содержимому (engine/branchFileOps.ts, editFile — нет параметра content).
// Полноценный редактор «показать весь текст, сохранить произвольную правку целиком» этому шагу
// не по чем строить: движок не принимает содержимое файла целиком ни в одной публичной функции
// (createBranchingSection тоже не годится — она создаёт только НАЧАЛЬНЫЙ, корневой коммит).
// Обойти это в компоненте — например, самому вычислять новое содержимое и подсовывать его в
// working через собственную сборку BranchingState — значило бы решать, как правильно редактировать
// файл, в интерфейсе, а не в движке; отчёт интегратора называет это прямо, без такой подмены.

function FilesPanel({
  state,
  onEdit,
  onDelete,
  onCreate,
}: {
  state: BranchingState
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

function MissionsPanel({ missions }: { missions: BranchMissionView[] }) {
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

export default function BranchingTrainer() {
  const [state, setState] = useState<BranchingState>(createInitialState)

  function handleRun(input: string) {
    const { state: next, result } = runBranchingCommand(state, input)
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

  const missions = getBranchMissions(state)

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
        <div className="min-w-0 space-y-6">
          <StatusPanel state={state} />
          <CommitGraph state={state} />
          <FilesPanel state={state} onEdit={handleEdit} onDelete={handleDelete} onCreate={handleCreate} />
        </div>
      </div>

      <MissionsPanel missions={missions} />
    </div>
  )
}
