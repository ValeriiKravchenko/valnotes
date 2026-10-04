// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): данные и чистые операции —
// граф коммитов, ветки, HEAD, revert/reset. Разбора командной строки здесь
// нет (см. undoCommands.ts) — только модель.
//
// Часть алгоритмов ПОРТИРОВАНА (переписана заново под UndoState), а не
// импортирована, из branchRepo.ts раздела 2 — тот же приём, что и у
// inspectDiff.ts (комментарий у lcsMatches: «тот же алгоритм, но для…»):
// checkSafety/applyTreeChange раздела 2 типизированы под BranchingState
// (требуют branchOrder/lastMerge/missionsDone раздела 2), и наименее
// затратный честный способ переиспользовать уже сверенный с git 2.53.0
// алгоритм — скопировать его логику под свой тип состояния, а не подгонять
// UndoState под чужой интерфейс фиктивными полями. Там, где алгоритм НЕ
// зависит от формы состояния вообще (mergeTrees/mergeFileContent — чистые
// функции над FileTree), он импортируется НАПРЯМУЮ из branchRepo.ts, без
// копии — раздел 2 (branch*.ts) при этом не редактируется ни строкой.
//
// Трёхстороннее слияние revert (target.md, часть VI, «Что НЕ входит»:
// конфликт — правило области) переиспользует mergeTrees с ролями base=дерево
// отменяемого коммита, ours=текущий HEAD, theirs=дерево родителя отменяемого
// коммита — это не предположение, а сверено напрямую (git 2.53.0,
// временный каталог, 26.09.2026): непересекающиеся правки после отменяемого
// коммита сливаются автоматически, соседние (или совпадающие с контекстом
// в 3 строки) — дают настоящий CONFLICT, тем же алгоритмом, что и у merge
// раздела 2 (см. отчёт о переносе).
//
// Строки-литералы настоящего git ("fatal: …", "HEAD is now at …",
// "Unstaged changes after reset: …" и т.п.) — буквальный вывод, сверенный
// напрямую запуском git 2.53.0 во временном каталоге 26.09.2026 (см. отчёт).
// ============================================================
import type { FileTree, UndoCommit, UndoState } from './undoTypes'
import { mergeTrees, sameTree } from './branchRepo'
import type { ConflictInfo, TreeMergeResult } from './branchRepo'
import { commitHashCore, has } from './util'

export type { ConflictInfo, TreeMergeResult }
export { sameTree }

export function undoCommitHash(message: string, tree: FileTree, parentId: string | null, clock: number): string {
  return commitHashCore(message, tree, parentId ? [parentId] : [], clock)
}

export function branchTip(state: UndoState, name: string): string | null {
  return has(state.branches, name) ? state.branches[name] : null
}

export function commitTree(state: UndoState, id: string): FileTree {
  return state.commits[id]?.tree ?? {}
}

export function currentTip(state: UndoState): string {
  const id = branchTip(state, state.head)
  if (id === null) throw new Error(`invariant: HEAD branch "${state.head}" not found`)
  return id
}

export function headTree(state: UndoState): FileTree {
  return commitTree(state, currentTip(state))
}

export function getCommit(state: UndoState, id: string): UndoCommit | undefined {
  return state.commits[id]
}

// ---------- предки, недостижимые («осиротевшие») коммиты ----------

/** Множество id всех предков коммита `id`, включая его самого (у коммита раздела 4 не больше одного родителя). */
function ancestorSet(state: UndoState, id: string): Set<string> {
  const seen = new Set<string>()
  let cur: string | null = id
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur)
    cur = state.commits[cur]?.parentId ?? null
  }
  return seen
}

export function isAncestor(state: UndoState, a: string, b: string): boolean {
  return ancestorSet(state, b).has(a)
}

/** Множество id коммитов, достижимых хотя бы из одной ветки — «живая» часть графа. */
function reachableCommits(state: UndoState): Set<string> {
  const reachable = new Set<string>()
  Object.values(state.branches).forEach((tip) => {
    ancestorSet(state, tip).forEach((id) => reachable.add(id))
  })
  return reachable
}

/**
 * Коммиты, не достижимые ни из одной ветки (target.md, часть VI, «Недостижимые коммиты на
 * графе» — после `reset` отброшенный коммит остаётся в `state.commits` целиком, как и у
 * настоящего git, но ни одна ветка на него больше не указывает). Список отдельно от «живых»
 * коммитов — интерфейс решает, как показать их бледными; движок только называет, какие это
 * коммиты (задача, п.4).
 */
export function getOrphanCommits(state: UndoState): UndoCommit[] {
  const reachable = reachableCommits(state)
  return Object.values(state.commits)
    .filter((c) => !reachable.has(c.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// ---------- разбор ссылок: HEAD, HEAD~N, имя ветки, хэш (префикс) ----------

/**
 * `HEAD`/`HEAD~N`/имя ветки/хэш (полный или префикс от 4 символов, как у настоящего git —
 * core.abbrev по умолчанию 7, но короче тоже разрешает, если однозначно). Ищет по ВСЕМ
 * коммитам (`state.commits`), а не только достижимым — реальный git тоже находит объект по
 * хэшу независимо от того, указывает ли на него ветка (это и есть смысл `git branch rescue
 * <хэш>`, target.md, часть VI). `null`, если ссылка не разобрана вовсе — дальше решает
 * вызывающий код (undoCommands.ts): это либо настоящая ошибка git («bad revision»/«ambiguous
 * argument»), либо (для reset) повод попробовать разобрать токен как имя файла.
 *
 * Упрощение (см. отчёт, «список упрощений»): `HEAD^`, `@`, `HEAD@{n}` и прочие выражения
 * ревизий (gitrevisions(7)) не разбираются — как и в разделе 2 (target.md, часть IV, «Что НЕ
 * входит»), это отдельная возможность вне области раздела 4 (undoScope.ts решает, что это
 * настоящая, но не реализованная форма, а не выдуманная ошибка).
 */
export function resolveRef(state: UndoState, raw: string): string | null {
  if (raw === 'HEAD') return currentTip(state)
  const tildeMatch = /^HEAD~(\d+)$/.exec(raw)
  if (tildeMatch) {
    let id: string | null = currentTip(state)
    let n = parseInt(tildeMatch[1], 10)
    while (n > 0 && id !== null) {
      id = state.commits[id]?.parentId ?? null
      n--
    }
    return id
  }
  if (has(state.branches, raw)) return state.branches[raw]
  if (/^[0-9a-f]{4,7}$/i.test(raw)) {
    const lower = raw.toLowerCase()
    const matches = Object.keys(state.commits).filter((id) => id.startsWith(lower))
    return matches.length === 1 ? matches[0] : null
  }
  return null
}

/** `HEAD^`/`@`/`HEAD@{n}` и т.п. — настоящие выражения ревизий git, которых `resolveRef` не разбирает (см. её комментарий) — используется undoCommands.ts, чтобы отличить это от genuinely неизвестной ссылки (правило области, а не выдуманная ошибка). */
export function looksLikeUnimplementedRevisionExpression(raw: string): boolean {
  return raw === '@' || /\^/.test(raw) || raw.includes('@{')
}

// ---------- «было бы затёрто»: перенесено из branchRepo.ts (checkSafety/applyTreeChange) ----------

function localChangeFiles(state: UndoState): Set<string> {
  const head = headTree(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(state.index), ...Object.keys(state.working)])
  const dirty = new Set<string>()
  files.forEach((f) => {
    const h = has(head, f) ? head[f] : undefined
    const idx = has(state.index, f) ? state.index[f] : undefined
    const w = has(state.working, f) ? state.working[f] : undefined
    if (idx !== h || w !== idx) dirty.add(f)
  })
  return dirty
}

export interface SafetyBlock {
  modified: string[]
  untracked: string[]
}

/**
 * Индекс отличается от HEAD хоть где-нибудь (не обязательно там, где revert реально что-то
 * меняет) — та самая широкая проверка, из-за которой `git revert` отказывает КОРОТКИМ
 * сообщением ("your local changes would be overwritten by revert") даже при staged-правке в
 * СОВСЕМ другом файле (сверено напрямую, git 2.53.0, 26.09.2026 — см. отчёт: staged-правка в
 * b.txt блокирует revert коммита, трогающего только a.txt).
 */
export function indexDiffersFromHead(state: UndoState): string[] {
  const head = headTree(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(state.index)])
  const diff: string[] = []
  files.forEach((f) => {
    const h = has(head, f) ? head[f] : undefined
    const idx = has(state.index, f) ? state.index[f] : undefined
    if (h !== idx) diff.push(f)
  })
  return diff.sort()
}

/**
 * Проверка «было бы затёрто» для ПУТЕЙ, которые операция реально трогает (portировано из
 * branchRepo.ts, checkSafety — см. её подробный комментарий про две разные проверки
 * unpack-trees.c; тот же алгоритм, тот же результат на тех же входах). Вызывается только ПОСЛЕ
 * indexDiffersFromHead (revert проверяет широкую блокировку раньше — см. undoCommands.ts).
 */
export function checkSafety(state: UndoState, resultTree: FileTree): SafetyBlock {
  const head = headTree(state)
  const dirty = localChangeFiles(state)
  const modified: string[] = []
  const untracked: string[] = []
  dirty.forEach((f) => {
    const oldVal = has(head, f) ? head[f] : undefined
    const newVal = has(resultTree, f) ? resultTree[f] : undefined
    const knownToGit = has(head, f) || has(state.index, f)
    if (!knownToGit) {
      if (newVal !== undefined) untracked.push(f)
      return
    }
    const idxVal = has(state.index, f) ? state.index[f] : undefined
    const notStaged = idxVal === oldVal
    const missingOnDisk = !has(state.working, f)
    if (notStaged && missingOnDisk) return
    if (oldVal !== newVal && idxVal !== newVal) modified.push(f)
  })
  return { modified: modified.sort(), untracked: untracked.sort() }
}

/**
 * Применяет результат revert к index/working: трогает только пути, которые реально отличаются
 * от старого HEAD, для остальных (в т.ч. незакоммиченные правки в НЕзатронутых файлах) переносит
 * их как есть — portировано из branchRepo.ts, applyTreeChange (см. её комментарий; вызывается
 * только когда checkSafety выше уже не заблокировала операцию — untracked-коллизии здесь
 * поэтому не встречаются на практике, но код общий с исходным алгоритмом).
 */
export function applyTreeChange(state: UndoState, resultTree: FileTree): { index: FileTree; working: FileTree } {
  const head = headTree(state)
  const dirty = localChangeFiles(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(resultTree), ...Object.keys(state.working), ...Object.keys(state.index)])
  const nextIndex: FileTree = {}
  const nextWorking: FileTree = {}

  files.forEach((f) => {
    if (dirty.has(f)) {
      if (has(state.index, f)) nextIndex[f] = state.index[f]
      if (has(state.working, f)) nextWorking[f] = state.working[f]
      return
    }
    if (has(resultTree, f)) {
      nextIndex[f] = resultTree[f]
      nextWorking[f] = resultTree[f]
    }
  })

  return { index: nextIndex, working: nextWorking }
}

// ---------- git status для раздела 4 (общий с handleCommit/handleStatus, undoCommands.ts) ----------

export interface UndoFileStatusEntry {
  file: string
  type: 'new file' | 'modified' | 'deleted'
}

export interface UndoStatusSnapshot {
  staged: UndoFileStatusEntry[]
  notStaged: UndoFileStatusEntry[]
  untracked: string[]
}

/** Тот же принцип, что и branchingStatus (раздел 2)/inspectStatus (раздел 3) — независимая реализация под UndoState. */
export function undoStatus(state: UndoState): UndoStatusSnapshot {
  const head = headTree(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(state.index), ...Object.keys(state.working)])
  const staged: UndoFileStatusEntry[] = []
  const notStaged: UndoFileStatusEntry[] = []
  const untracked: string[] = []

  files.forEach((f) => {
    const inHead = has(head, f)
    const inIndex = has(state.index, f)
    const inWorking = has(state.working, f)

    if (inIndex && !inHead) staged.push({ file: f, type: 'new file' })
    else if (inIndex && inHead && state.index[f] !== head[f]) staged.push({ file: f, type: 'modified' })
    else if (!inIndex && inHead) staged.push({ file: f, type: 'deleted' })

    if (!inIndex && inWorking) {
      untracked.push(f)
      return
    }
    if (inIndex && inWorking && state.index[f] !== state.working[f]) notStaged.push({ file: f, type: 'modified' })
    else if (inIndex && !inWorking) notStaged.push({ file: f, type: 'deleted' })
  })

  return { staged, notStaged, untracked }
}

function byFileName(a: UndoFileStatusEntry, b: UndoFileStatusEntry): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
}

/**
 * `git status` полного формата — тот же текст/структура, что formatBranchingStatus (раздел 2)/
 * formatInspectStatus (раздел 3), независимая реализация под UndoState. Раздел 4 всегда начинает
 * с готовой историей (target.md, часть VI, «Исходное состояние»), поэтому "No commits yet"
 * здесь не встречается.
 *
 * Этот же текст — буквальный ответ настоящего git на `git revert`, когда отменять нечего (target/
 * source.html ожидали свой текст «нечего отменять», но реальный git 2.53.0 в этом случае просто
 * печатает обычный git status и завершается отказом — сверено напрямую, см. отчёт и
 * undoCommands.ts, handleRevert).
 */
export function formatUndoStatus(state: UndoState): string {
  const s = undoStatus(state)
  const blocks: string[][] = []

  if (s.staged.length) {
    const block = ['Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)']
    s.staged
      .slice()
      .sort(byFileName)
      .forEach((x) => block.push(`\t${(x.type + ':').padEnd(12)}${x.file}`))
    blocks.push(block)
  }
  if (s.notStaged.length) {
    const addOrRm = s.notStaged.some((x) => x.type === 'deleted') ? 'git add/rm' : 'git add'
    const block = [
      'Changes not staged for commit:',
      `  (use "${addOrRm} <file>..." to update what will be committed)`,
      '  (use "git restore <file>..." to discard changes in working directory)',
    ]
    s.notStaged
      .slice()
      .sort(byFileName)
      .forEach((x) => block.push(`\t${(x.type + ':').padEnd(12)}${x.file}`))
    blocks.push(block)
  }
  if (s.untracked.length) {
    const block = ['Untracked files:', '  (use "git add <file>..." to include in what will be committed)']
    s.untracked
      .slice()
      .sort()
      .forEach((f) => block.push(`\t${f}`))
    blocks.push(block)
  }
  if (!s.staged.length) {
    if (s.notStaged.length) blocks.push(['no changes added to commit (use "git add" and/or "git commit -a")'])
    else if (s.untracked.length) blocks.push(['nothing added to commit but untracked files present (use "git add" to track)'])
    else blocks.push(['nothing to commit, working tree clean'])
  }

  // Блоки — каждый как единая многострочная секция; между секциями пустая строка, но НЕ между
  // "On branch <head>" и первой секцией (сверено напрямую, git 2.53.0, 26.09.2026, изолированный
  // HOME без пользовательских настроек — см. отчёт: "On branch master" и "Changes to be
  // committed:"/"Changes not staged…"/"Untracked files:"/"nothing to commit…" — соседние строки
  // без пустой строки между ними). Когда `staged` не пуст, вывод настоящего git заканчивается
  // ПУСТОЙ СТРОКОЙ (два "\n" подряд после последней содержательной строки) — это верно независимо
  // от того, какой блок идёт последним (staged в одиночку, staged+notStaged, staged+untracked):
  // трейлерная строка ("no changes added…"/"nothing added…") в этом случае не печатается вовсе,
  // и её место как раз занимает эта пустая строка.
  let output = `On branch ${state.head}`
  blocks.forEach((block, i) => {
    output += (i === 0 ? '\n' : '\n\n') + block.join('\n')
  })
  if (s.staged.length) output += '\n\n'
  return output
}

// ---------- git revert: трёхстороннее слияние ----------

export interface RevertComputation {
  targetId: string
  parentTree: FileTree
  currentTree: FileTree
  merged: TreeMergeResult
}

/** Вычисляет результат `git revert <targetId>` без побочных эффектов — undoCommands.ts решает, что с ним делать (конфликт/нечего отменять/применить). */
export function computeRevert(state: UndoState, targetId: string): RevertComputation {
  const target = state.commits[targetId]
  const parentTree = target.parentId ? commitTree(state, target.parentId) : {}
  const currentTree = headTree(state)
  // база=дерево отменяемого коммита, ours=текущий HEAD, theirs=дерево родителя — см. шапку файла.
  const merged = mergeTrees(target.tree, currentTree, parentTree)
  return { targetId, parentTree, currentTree, merged }
}

// ---------- git reset ----------

export type ResetMode = 'soft' | 'mixed' | 'hard'

export interface ResetOutcome {
  state: UndoState
  moved: boolean
  targetId: string
}

/**
 * `git reset [--soft|--mixed|--hard] <ref>` (target.md, часть VI, «Три режима reset»; source.html,
 * `reset()`, поведение сверено напрямую, git 2.53.0, 26.09.2026). Ветка переезжает всегда; индекс
 * и рабочее дерево — в зависимости от режима. Недостижимые после переезда коммиты НЕ удаляются
 * из `state.commits` (getOrphanCommits их найдёт) — как и у настоящего git (target.md, опасное
 * место 3).
 */
export function resetToCommit(state: UndoState, mode: ResetMode, targetId: string): ResetOutcome {
  const tree = commitTree(state, targetId)
  const oldTree = headTree(state)
  // Неотслеживаемые файлы (нет ни в индексе, ни в HEAD) reset --hard не трогает.
  const untracked: FileTree = {}
  Object.keys(state.working).forEach((f) => {
    if (!has(state.index, f) && !has(oldTree, f)) untracked[f] = state.working[f]
  })
  const moved = currentTip(state) !== targetId
  const nextBranches = { ...state.branches, [state.head]: targetId }
  let index = state.index
  let working = state.working
  if (mode === 'hard') {
    index = { ...tree }
    working = { ...untracked, ...tree }
  } else if (mode === 'mixed') {
    index = { ...tree }
  }
  return { state: { ...state, branches: nextBranches, index, working }, moved, targetId }
}

/** `Unstaged changes after reset:` + `M`/`D` для путей из `only`, у которых рабочее дерево отличается от (уже обновлённого) индекса — сверено напрямую, git 2.53.0. */
export function unstagedReport(state: UndoState, tree: FileTree, only?: readonly string[]): string {
  const rows: string[] = []
  const names = new Set<string>([...Object.keys(state.index), ...Object.keys(tree)])
  ;[...names]
    .sort()
    .forEach((f) => {
      if (only && !only.includes(f)) return
      if (!has(state.index, f) && !has(tree, f)) return
      if (has(state.index, f) && has(state.working, f) && state.index[f] === state.working[f]) return
      if (has(state.index, f) || has(state.working, f)) rows.push(`${has(state.working, f) ? 'M' : 'D'}\t${f}`)
    })
  return rows.length ? 'Unstaged changes after reset:\n' + rows.join('\n') : ''
}

/** `git reset [<ref>] [--] <файлы>` — обратная операция к `git add`: убирает файлы из индекса, приводя их к версии из `ref` (по умолчанию HEAD). Рабочее дерево не трогается. */
export function unstagePaths(state: UndoState, paths: readonly string[], refTree: FileTree): { index: FileTree } {
  const nextIndex = { ...state.index }
  paths.forEach((f) => {
    if (has(refTree, f)) nextIndex[f] = refTree[f]
    else delete nextIndex[f]
  })
  return { index: nextIndex }
}
