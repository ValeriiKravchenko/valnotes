// ============================================================
// Раздел 6 git-тренажёра, шаг A («Проект»): данные и чистые операции над
// цепочкой коммитов — id, форматирование автора/даты, разбор ссылок
// (gitrevisions), поиск файла по дереву. Разбора командной строки здесь нет
// (см. searchCommands.ts). По устройству — аналог inspectRepo.ts (раздел 3),
// независимая копия под свою модель (searchTypes.ts) — раздел 3 не трогается.
// ============================================================
import type { CommitDate, FileTree, SearchCommit, SearchState } from './searchTypes'
import { has } from './util'

// ---------- id коммита: 40 шестнадцатеричных знаков ----------
//
// target.md, «Движок»: «40 шестнадцатеричных знаков… Только в движке раздела 6: разделы 3–5 и
// util.ts не трогаются». commitHashCore/hashString (util.ts) отдают ровно 7 hex-знаков — этого
// не хватает, а расширять общую функцию для одного раздела означало бы менять поведение,
// которым пользуются разделы 1–2. Поэтому здесь — независимая функция того же общего вида (FNV-1a,
// не криптографическая, только детерминированная), собирающая 40 знаков из пяти 32-битных раундов
// с разной "солью" (5 × 8 hex = 40).

function fnv1a32(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function hex8(n: number): string {
  return n.toString(16).padStart(8, '0')
}

/** Ключ даты для хэша — сама дата коммита участвует в содержимом (данные сценария, а не "момент действия игрока", в отличие от clock разделов 1–5, см. searchTypes.ts, CommitDate). */
function dateKey(d: CommitDate): string {
  return `${d.year}-${d.month}-${d.day} ${d.hour}:${d.minute}:${d.second} ${d.tzOffsetMinutes}`
}

/**
 * Идентификатор коммита раздела 6 — детерминированный хэш от ВСЕХ данных коммита (сообщение,
 * состав файлов, родитель, автор, почта, дата): в этом разделе коммиты заданы сценарием целиком
 * заранее (не рождаются по ходу игры), поэтому не нужны отдельные "логические часы" (util.ts,
 * commitHashCore) — вместо счётчика шагов сама дата коммита и так гарантированно различна у всех
 * коммитов сценария и играет её роль.
 */
export function searchCommitId(
  message: string,
  tree: FileTree,
  parentId: string | null,
  author: string,
  email: string,
  date: CommitDate,
): string {
  const filesPart = Object.keys(tree)
    .sort()
    .map((f) => `${f}\0${tree[f]}`)
    .join('\n')
  const base = `${parentId ?? ''}\n${message}\n${filesPart}\n${author}\n${email}\n${dateKey(date)}`
  let out = ''
  for (let round = 0; round < 5; round++) {
    out += hex8(fnv1a32(`${round}:${base}`))
  }
  return out
}

// ---------- форматирование автора/даты ----------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Название дня недели по календарной дате — считается через `Date.UTC` по самим полям года/месяца/дня (не зависит от `tzOffsetMinutes`: день недели — свойство календарной даты, а не момента времени, а часы коммитов раздела не пересекают полночь). */
function weekdayOf(d: CommitDate): string {
  const idx = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
  return WEEKDAYS[idx]
}

/** `+ЧЧММ`/`-ЧЧММ` из смещения в минутах (в разделе всегда `+0300`, см. target.md, «Данные коммитов»). */
function tzString(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  return `${sign}${pad2(Math.floor(abs / 60))}${pad2(abs % 60)}`
}

/**
 * Формат `git show`/`git log` (target.md, «Форматы»): `Thu Mar 12 10:00:00 2026 +0300`. День —
 * БЕЗ ведущего нуля/пробела (сверено прогоном: `Fri May 1 10:00:00 2026 +0300` — ровно один
 * пробел перед однозначным днём, docs/git-trainer/reports/section6-git-runs.txt, Д14).
 */
export function formatGitLongDate(d: CommitDate): string {
  return `${weekdayOf(d)} ${MONTHS[d.month - 1]} ${d.day} ${pad2(d.hour)}:${pad2(d.minute)}:${pad2(d.second)} ${d.year} ${tzString(d.tzOffsetMinutes)}`
}

/** Формат `git blame` (target.md, «Форматы»): `ГГГГ-ММ-ДД ЧЧ:ММ:СС +ЗЗЗЗ`, все поля с ведущими нулями. */
export function formatBlameDate(d: CommitDate): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)} ${pad2(d.hour)}:${pad2(d.minute)}:${pad2(d.second)} ${tzString(d.tzOffsetMinutes)}`
}

// ---------- доступ к цепочке коммитов ----------

export function branchTip(state: SearchState, name: string): string | null {
  return has(state.branches, name) ? state.branches[name] : null
}

export function currentTip(state: SearchState): string {
  const id = branchTip(state, state.head)
  if (id === null) throw new Error(`invariant: HEAD branch "${state.head}" not found`)
  return id
}

export function getCommit(state: SearchState, id: string): SearchCommit | undefined {
  return state.commits[id]
}

export function commitTree(state: SearchState, id: string): FileTree {
  return state.commits[id]?.tree ?? {}
}

export function headTree(state: SearchState): FileTree {
  return commitTree(state, currentTip(state))
}

export function parentOf(state: SearchState, id: string): string | null {
  return state.commits[id]?.parentId ?? null
}

/** Цепочка id от `startId` назад по родителям (сам `startId` первым) — «новые сверху», как `git log`. */
export function commitChain(state: SearchState, startId: string): string[] {
  const chain: string[] = []
  let cur: string | null = startId
  while (cur !== null) {
    chain.push(cur)
    cur = parentOf(state, cur)
  }
  return chain
}

/** Изменил ли коммит `id` файл `file` относительно родителя (для `git log <файл>`, target.md, «История файла»). У корневого коммита «родитель» — пустое дерево. */
export function commitTouchesFile(state: SearchState, id: string, file: string): boolean {
  const commit = state.commits[id]
  if (!commit) return false
  const parentTree = commit.parentId ? commitTree(state, commit.parentId) : {}
  const before = has(parentTree, file) ? parentTree[file] : undefined
  const after = has(commit.tree, file) ? commit.tree[file] : undefined
  return before !== after
}

// ---------- разбор ссылок на коммит (gitrevisions) ----------
//
// Тот же принцип, что и resolveRef раздела 3 (inspectRepo.ts) — независимая копия под 40-значный
// id (короткие формы — от 4 знаков, как и там; blame печатает 8, короткие формы в примерах прогона
// — 7). Раздел 3 не трогается (это НЕ импорт из inspectRepo.ts).

function resolveBase(state: SearchState, base: string): string | null {
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

/** Разбирает одну ссылку (HEAD/master/хэш, с необязательной цепочкой `^`/`~N`) — `null`, если ничему не соответствует (в т.ч. уход за пределы корня). Диапазонов `A..B` в разделе 6 нет в области (grep поддерживает только ОДНУ ссылку, target.md — «Поиск в коммите»), поэтому, в отличие от inspectRepo.ts, здесь нет отдельного разбора `..`. */
export function resolveSearchRef(state: SearchState, raw: string): string | null {
  const parsed = raw.match(/^([^~^]+)((?:[~^]\d*)*)$/)
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
        continue
      } else {
        return null
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

/** Есть ли файл `file` в дереве `tree` (для решения «это путь или ссылка не нашлась» — target.md, опасное место 7). */
export function isTrackedIn(tree: FileTree, file: string): boolean {
  return has(tree, file)
}
