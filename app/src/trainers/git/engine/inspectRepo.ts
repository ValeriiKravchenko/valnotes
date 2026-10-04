// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): данные и чистые операции —
// цепочка коммитов, разбор ссылок (gitrevisions), git status. Разбора
// командной строки здесь нет (см. inspectCommands.ts) — только модель.
// Диффы (построчный unified diff) — отдельно, в inspectDiff.ts.
//
// Буквальные строки настоящего git ("fatal: ambiguous argument …",
// "On branch …" и т.п.) — сверены напрямую запуском git 2.53.0 во временном
// каталоге 26.09.2026 (см. отчёт о переносе раздела 3). Не переводятся и не
// идут в словарь (CLAUDE.md, «Вывод git-команд не переводится»).
// ============================================================
import type { FileTree, InspectCommit, InspectState } from './inspectTypes'
import { commitHashCore, has } from './util'

/**
 * Идентификатор коммита раздела 3 — та же формула, что и в разделах 1–2 (target.md, A5;
 * util.ts, commitHashCore). В отличие от раздела 2 здесь никогда не появляется новый коммит
 * во время работы движка (add/commit вне области раздела 3 — inspectScope.ts): вся цепочка
 * строится ОДИН РАЗ при создании раздела (inspectSection.ts, createInspectSection), поэтому
 * значение "часов" (clock) не нужно хранить в InspectState — вызывающая сторона просто передаёт
 * порядковый номер коммита в цепочке (0 для корневого и т.д.), как и в разделах 1–2 при
 * первом заполнении.
 */
export function inspectCommitHash(message: string, tree: FileTree, parentId: string | null, clock: number): string {
  return commitHashCore(message, tree, parentId === null ? [] : [parentId], clock)
}

export function branchTip(state: InspectState, name: string): string | null {
  return has(state.branches, name) ? state.branches[name] : null
}

export function currentTip(state: InspectState): string {
  const id = branchTip(state, state.head)
  if (id === null) throw new Error(`invariant: HEAD branch "${state.head}" not found`)
  return id
}

export function commitTree(state: InspectState, id: string): FileTree {
  return state.commits[id]?.tree ?? {}
}

export function headTree(state: InspectState): FileTree {
  return commitTree(state, currentTip(state))
}

export function getCommit(state: InspectState, id: string): InspectCommit | undefined {
  return state.commits[id]
}

/** Первый (и единственный) родитель — в разделе 3 коммитов слияния не бывает (нет ни branch, ни merge в области, inspectScope.ts). */
export function parentOf(state: InspectState, id: string): string | null {
  return state.commits[id]?.parentId ?? null
}

/**
 * Рабочее дерево, ОГРАНИЧЕННОЕ файлами, известными git (есть в индексе) — target.md, часть V,
 * «опасное место 2»: неотслеживаемый файл не виден ни в `git diff`, ни в `git diff HEAD`, потому
 * что настоящий `git diff` в принципе не сравнивает неотслеживаемые пути ни с чем (у них нет
 * версии в индексе, значит нет и «различия», которое diff мог бы показать). Это касается ТОЛЬКО
 * diff'а: `git status`/`git status -s` неотслеживаемые файлы показывают отдельным разделом
 * (inspectStatus ниже) — там это не diff, а перечисление.
 *
 * Используется везде, где ПРАВОЙ стороной сравнения выступает само рабочее дерево (`git diff`,
 * `git diff HEAD`, `git diff <коммит>`) — inspectCommands.ts. Диффы коммит↔коммит (не затрагивающие
 * state.working) в этой функции не нуждаются: у полноценных снимков дерева коммита понятия
 * «неотслеживаемый» не существует вовсе.
 */
export function trackedWorking(state: InspectState): FileTree {
  const result: FileTree = {}
  Object.keys(state.working).forEach((f) => {
    if (has(state.index, f)) result[f] = state.working[f]
  })
  return result
}

/** Цепочка id от `startId` назад по родителям (сам `startId` первым), до корня. Порядок — «новые сверху», как `git log`. */
export function commitChain(state: InspectState, startId: string): string[] {
  const chain: string[] = []
  let cur: string | null = startId
  while (cur !== null) {
    chain.push(cur)
    cur = parentOf(state, cur)
  }
  return chain
}

/**
 * `A..B` (target.md, часть V, «История части»): коммиты, достижимые из B, но не из A — сам A не
 * входит. Общая формула (через множество предков A), а не «отсечь по общему предку в линейной
 * цепочке» — раздел 3 никогда не создаёт веток (inspectScope.ts), поэтому в текущих данных A и B
 * всегда на одной прямой линии, но формула остаётся верной и для не связанных между собой ссылок
 * (тогда исключать из результата нечего, и `A..B` совпадает с полной историей B) — тот же общий
 * приём, что и `isAncestor`/цепочки в branchRepo.ts (раздел 2), просто под линейную модель.
 */
export function rangeCommits(state: InspectState, fromId: string, toId: string): string[] {
  const excluded = new Set(commitChain(state, fromId))
  return commitChain(state, toId).filter((id) => !excluded.has(id))
}

/** Изменил ли коммит `id` файл `file` относительно своего родителя (для `git log <файл>`, target.md, «История файла»). Для корневого коммита «родитель» — пустое дерево, поэтому появление файла тоже считается изменением. */
export function commitTouchesFile(state: InspectState, id: string, file: string): boolean {
  const commit = state.commits[id]
  if (!commit) return false
  const parentTree = commit.parentId ? commitTree(state, commit.parentId) : {}
  const beforeVal = has(parentTree, file) ? parentTree[file] : undefined
  const afterVal = has(commit.tree, file) ? commit.tree[file] : undefined
  return beforeVal !== afterVal
}

// ---------- разбор ссылок на коммиты (gitrevisions, target.md часть V, «Ссылки на коммиты») ----------

/**
 * `X@{N}` — обычно запись рефлога (gitrevisions(7)) — вне области раздела 3 (target.md,
 * «Что НЕ входит»: «HEAD@{N} (reflog)» → раздел 8). Единственное исключение, прямо
 * востребованное spec.md (S3-43): `X@{0}` — не настоящая запись рефлога, а тривиальный частный
 * случай синтаксиса ("значение X само по себе", gitrevisions(7), раздел про "@{n}") — он
 * поддержан явно, отдельно от общего механизма рефлога, которого в этом разделе вообще нет.
 * Любая другая форма `@{...}` (в т.ч. `@{1}`, `@{99}`) — не найдено (см. resolveRef).
 */
function stripTrivialAtZero(ref: string): string | null {
  const m = ref.match(/^(.+)@\{0\}$/)
  return m ? m[1] : null
}

/** База ссылки — то, что стоит до первого "^"/"~" (target.md, «Ссылки на коммиты»): HEAD, имя ветки или начало хэша (от 4 символов). Неоднозначный (совпал с несколькими коммитами) короткий хэш — сознательное упрощение: считается ненайденным, как и полностью отсутствующий (см. отчёт о переносе — при трёх коммитах и 7-значном хэше коллизия практически недостижима). */
function resolveBase(state: InspectState, base: string): string | null {
  if (base === 'HEAD') return currentTip(state)
  const branch = branchTip(state, base)
  if (branch !== null) return branch
  if (/^[0-9a-f]{4,40}$/i.test(base)) {
    const lower = base.toLowerCase()
    const matches = Object.keys(state.commits).filter((id) => id.startsWith(lower))
    if (matches.length === 1) return matches[0]
  }
  return null
}

/**
 * Разбирает ОДНУ ссылку на коммит (без "..", это разбирается на уровень выше, в
 * inspectCommands.ts) — HEAD/имя ветки/хэш с необязательной цепочкой "^"/"~N" (target.md, часть V,
 * «Ссылки на коммиты», и «опасное место 5»: `HEAD^` = `HEAD~1`, `HEAD^^` = `HEAD~2` в линейной
 * истории). Возвращает id коммита или `null`, если ссылка ничему не соответствует (в т.ч. `HEAD^2` —
 * второй родитель слияния, которого в этом разделе не бывает, и уход за пределы корня, например
 * `HEAD~3` при трёх коммитах, — target.md, «опасное место 5»: настоящая ошибка git
 * `ambiguous argument`, которую здесь строит вызывающий код commands.ts, а не эта функция).
 */
export function resolveRef(state: InspectState, raw: string): string | null {
  const stripped = stripTrivialAtZero(raw)
  let ref: string
  if (stripped !== null) {
    ref = stripped
  } else if (raw.includes('@{')) {
    return null
  } else {
    ref = raw
  }

  // База — всё до первого "^"/"~"; дальше — цепочка операторов "^" / "~N" (каждый — либо "^",
  // либо "~", с необязательным числом сразу после). "[^~^]" читается как «не "~" и не "^»
  // (внутри класса символов ведущий "^" — отрицание, второй "^" — обычный литерал: экранировать
  // его не нужно, он не первый символ класса). "[~^]" ниже — то же самое множество символов, но
  // как ПОЗИТИВНЫЙ класс («любой из "~"/"^"») — тут "^" тоже не первый, поэтому не отрицание.
  const parsed = ref.match(/^([^~^]+)((?:[~^]\d*)*)$/)
  if (!parsed) return null
  const [, base, opsRaw] = parsed
  let id = resolveBase(state, base)
  if (id === null) return null

  const ops = opsRaw.match(/[~^]\d*/g) ?? []
  for (const op of ops) {
    const kind = op[0]
    const numStr = op.slice(1)
    if (kind === '^') {
      if (numStr === '' || numStr === '1') {
        const p = parentOf(state, id)
        if (p === null) return null
        id = p
      } else if (numStr === '0') {
        continue // X^0 — сам коммит (в терминах тегов «развернуть до коммита»; для коммита это тождество)
      } else {
        return null // ^2 и далее — второй/третий родитель слияния; в разделе 3 таких коммитов нет
      }
    } else {
      const n = numStr === '' ? 1 : parseInt(numStr, 10)
      for (let i = 0; i < n; i++) {
        const p = parentOf(state, id)
        if (p === null) return null
        id = p
      }
    }
  }
  return id
}

// ---------- git status для раздела 3 ----------

export interface InspectFileStatusEntry {
  file: string
  type: 'new file' | 'modified' | 'deleted'
}

export interface InspectStatusSnapshot {
  staged: InspectFileStatusEntry[]
  notStaged: InspectFileStatusEntry[]
  untracked: string[]
}

/** Тот же принцип, что и getStatus (раздел 1, repo.ts) / branchingStatus (раздел 2, branchRepo.ts):
 * staged = индекс vs HEAD, notStaged = рабочее дерево vs индекс, untracked = есть в рабочем
 * дереве, но не в индексе (target.md, A1/A3) — независимая реализация под InspectState. */
export function inspectStatus(state: InspectState): InspectStatusSnapshot {
  const head = headTree(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(state.index), ...Object.keys(state.working)])
  const staged: InspectFileStatusEntry[] = []
  const notStaged: InspectFileStatusEntry[] = []
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

/**
 * `git status -s`/`--short` (target.md, часть V, «Короткий статус»: две колонки — левая индекс,
 * правая рабочее дерево, " M"/"M "/"MM"/"??"). Тот же формат, что и formatStatusShort (раздел 1,
 * repo.ts, уже сверен там с git 2.53.0) — независимая реализация под InspectState.
 */
export function formatInspectStatusShort(state: InspectState): string {
  const s = inspectStatus(state)
  const code: Record<InspectFileStatusEntry['type'], string> = { 'new file': 'A', modified: 'M', deleted: 'D' }
  const rows: Record<string, { x: string; y: string }> = {}
  s.staged.forEach((x) => {
    rows[x.file] = rows[x.file] || { x: ' ', y: ' ' }
    rows[x.file].x = code[x.type]
  })
  s.notStaged.forEach((x) => {
    rows[x.file] = rows[x.file] || { x: ' ', y: ' ' }
    rows[x.file].y = code[x.type]
  })
  const lines = Object.keys(rows)
    .sort()
    .map((f) => `${rows[f].x}${rows[f].y} ${f}`)
  s.untracked
    .slice()
    .sort()
    .forEach((f) => lines.push(`?? ${f}`))
  return lines.join('\n')
}

function byFileName(a: InspectFileStatusEntry, b: InspectFileStatusEntry): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
}

/**
 * `git status` (полный формат, без флагов) — тот же принцип, что и formatBranchingStatus
 * (раздел 2, branchRepo.ts, уже сверено там с git 2.53.0), независимая реализация под
 * InspectState. Раздел 3 не создаёт новых коммитов и не умеет `git add`/`git commit`
 * (inspectScope.ts), поэтому "No commits yet" здесь невозможен — в отличие от раздела 1 всегда
 * есть хотя бы корневой коммит.
 */
export function formatInspectStatus(state: InspectState): string {
  const s = inspectStatus(state)
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

  let output = `On branch ${state.head}`
  blocks.forEach((block, i) => {
    output += (i === 0 ? '\n' : '\n\n') + block.join('\n')
  })
  if (s.staged.length) output += '\n'
  return output
}
