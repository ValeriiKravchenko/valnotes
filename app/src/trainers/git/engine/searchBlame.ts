// ============================================================
// Раздел 6 git-тренажёра, шаг A: вычисление `git blame` — для каждой строки
// файла ищет ПОСЛЕДНИЙ коммит, который её изменил (target.md, часть VIII,
// опасное место 9: «Неверно: blame показывает, кто написал строку. Верно:
// blame показывает коммит… ПОСЛЕДНЕГО изменения строки»), не первый и не
// «автора файла».
//
// Алгоритм — стандартный «blame через последовательные диффы»: идём от HEAD
// к корню; на каждом шаге сравниваем версию файла в текущем коммите с
// версией в его родителе (LCS, тот же принцип, что и diffBetween,
// inspectDiff.ts, но здесь нужны сами пары совпадений, а не готовый текст
// диффа, поэтому — независимая копия). Строка, для которой в родителе
// нашлась совпадающая, «передаётся» на уровень ниже (могла быть изменена ещё
// раньше); строка без совпадения — детище ЭТОГО коммита, дальше не спускается.
// ============================================================
import type { FileTree, SearchState } from './searchTypes'
import { commitChain, formatBlameDate, getCommit, parentOf } from './searchRepo'
import { has } from './util'

/** Совпадения строк "старое → новое" через классический LCS (та же идея, что и lcsMatches, inspectDiff.ts — независимая копия под линии blame, не diff-текст). Возвращает пары [индекс в `a`, индекс в `b`]. */
function lcsMatches(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const matches: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
      matches.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  return matches
}

function linesOf(tree: FileTree, file: string): string[] {
  return has(tree, file) ? tree[file].split('\n') : []
}

export interface BlameLine {
  commitId: string
  /** Родительский коммит найден? Нужно только, чтобы отметить строку `^` (граничный/корневой коммит, target.md, опасное место 9). */
  isRoot: boolean
  /** Номер строки, считая с 1. */
  line: number
  content: string
}

/**
 * Полный blame файла `file` на HEAD — БЕЗ учёта `-L`/`-s` (это дело форматирования, см. ниже).
 * Пустой массив, если файла нет ни в одном коммите цепочки (вызывающий код, searchCommands.ts,
 * должен был проверить существование раньше и не звать эту функцию в этом случае — оставлено как
 * безопасный, не бросающий исключение результат).
 */
export function computeBlame(state: SearchState, headId: string, file: string): BlameLine[] {
  const chain = commitChain(state, headId)
  const tipLines = linesOf(getCommit(state, headId)?.tree ?? {}, file)
  const n = tipLines.length
  if (n === 0) return []

  const attributedTo: Array<string | null> = new Array(n).fill(null)
  const positions: number[] = Array.from({ length: n }, (_, i) => i)

  for (const commitId of chain) {
    const parentId = parentOf(state, commitId)
    const curTree = getCommit(state, commitId)?.tree ?? {}
    const curLines = linesOf(curTree, file)
    const parentTree = parentId ? getCommit(state, parentId)?.tree ?? {} : {}
    const parentLines = linesOf(parentTree, file)

    const matches = lcsMatches(parentLines, curLines)
    const curToParent = new Map<number, number>()
    matches.forEach(([pIdx, cIdx]) => curToParent.set(cIdx, pIdx))

    let stillUnattributed = false
    for (let r = 0; r < n; r++) {
      if (attributedTo[r] !== null) continue
      const curIdx = positions[r]
      const parentIdx = curToParent.get(curIdx)
      if (parentIdx !== undefined) {
        positions[r] = parentIdx
        stillUnattributed = true
      } else {
        attributedTo[r] = commitId
      }
    }
    if (!stillUnattributed) break
  }

  return tipLines.map((content, idx) => {
    const commitId = attributedTo[idx] as string
    return { commitId, isRoot: parentOf(state, commitId) === null, line: idx + 1, content }
  })
}

export interface BlameFormatOptions {
  /** `-s` — без автора/даты (target.md, «Форматы»). */
  suppressAuthor: boolean
}

/** Столбец хэша — 8 символов всегда: `^` + 7 знаков у граничного (корневого) коммита, иначе 8 знаков хэша (target.md, опасное место 9). */
function hashColumn(commitId: string, isRoot: boolean): string {
  return isRoot ? '^' + commitId.slice(0, 7) : commitId.slice(0, 8)
}

/**
 * Форматирует срез blame-строк (уже отфильтрованный по `-L`, если был) в текст git. Ширина номера
 * строки — по количеству цифр САМОГО БОЛЬШОГО номера В ЭТОМ ВЫВОДЕ (target.md, «Форматы»: «У
 * `-L 9,11` — ` 9`, `10`, `11`»), не по всему файлу. Имя автора — дополняется пробелами до самого
 * длинного имени В ЭТОМ ВЫВОДЕ (заметно только при разных по длине именах — у обоих авторов
 * раздела 6 ровно по 6 букв, target.md, «Форматы»).
 */
export function formatBlame(state: SearchState, lines: readonly BlameLine[], opts: BlameFormatOptions): string {
  if (!lines.length) return ''
  const maxLineNum = Math.max(...lines.map((l) => l.line))
  const numWidth = String(maxLineNum).length
  const maxNameLen = opts.suppressAuthor ? 0 : Math.max(...lines.map((l) => getCommit(state, l.commitId)?.author.length ?? 0))

  return lines
    .map((l) => {
      const hashCol = hashColumn(l.commitId, l.isRoot)
      const numStr = String(l.line).padStart(numWidth)
      if (opts.suppressAuthor) return `${hashCol} ${numStr}) ${l.content}`
      const commit = getCommit(state, l.commitId)
      const author = (commit?.author ?? '').padEnd(maxNameLen)
      const date = formatBlameDate(commit?.date ?? { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0, tzOffsetMinutes: 0 })
      return `${hashCol} (${author} ${date} ${numStr}) ${l.content}`
    })
    .join('\n')
}
