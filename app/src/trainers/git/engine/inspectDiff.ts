// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): построчный unified diff —
// настоящий формат git (target.md, часть V, «опасное место 3»: заголовки,
// "new file mode", "/dev/null", "@@ … @@", а не придуманный текст вроде
// «(файла не было)»). Чистые функции над двумя FileTree — ничего не знает о
// командах терминала (см. inspectCommands.ts) и о состоянии раздела
// (InspectState) — принимает "старое"/"новое" дерево как есть, поэтому
// одинаково обслуживает все формы diff (target.md: рабочее ↔ индекс,
// индекс ↔ HEAD, коммит ↔ коммит, коммит ↔ рабочее дерево у `git show`).
//
// Формат построчно сверен напрямую запуском git 2.53.0 во временном
// каталоге 26.09.2026 (заголовки "diff --git", "index …", "--- a/…",
// "+++ b/…", "@@ -старт,счёт +старт,счёт @@", омитирование ",1" у счётчика,
// когда он равен 1, порядок мод-строк у новых/удалённых файлов, формат
// --stat и --name-only) — см. отчёт о переносе раздела 3.
//
// Сознательные упрощения (см. отчёт, «список упрощений»):
// 1) Хэш блоба на строке "index a..b" — не настоящий SHA1 (для этого нужен
//    полноценный объектный формат git, которого здесь нет), а тот же
//    приём, что и для id коммита (target.md, A5): детерминированный
//    хэш от содержимого, 7 hex-символов. Формат строки настоящий,
//    конкретное значение — нет.
// 2) Режим файла всегда "100644" — исполняемый бит (100755) не моделируется
//    (в this section нет способа его установить).
// 3) Маркер "\ No newline at end of file" не печатается никогда — контент
//    файлов тренажёра хранится как обычная JS-строка без явного соглашения
//    о завершающем "\n", и настоящий признак «файл на диске не заканчивается
//    переводом строки» тут просто не существует как отдельное данное.
// 4) "Контекст функции" в заголовке "@@ … @@ <контекст>" (эвристика xdiff,
//    ищущая последную подходящую строку перед хунком, есть у git даже для
//    обычного текста) не воспроизводится — настоящий git показывает её,
//    только когда хунк начинается не с первой строки файла И перед ним есть
//    подходящая строка; у зафиксированного сценария раздела 3 файлы короткие
//    и все проверенные диффы дают единственный хунк с первой строки, поэтому
//    эвристика напрямую не проверялась и не понадобилась (сверено на всех
//    сценариях исходных данных раздела).
// ============================================================
import type { FileTree } from './inspectTypes'
import { has, hashString } from './util'

function splitContentLines(content: string): string[] {
  return content.split('\n')
}

/** Фейковый (но детерминированный и по формату настоящий) короткий хэш блоба — см. упрощение 1 в шапке файла. */
function blobHash(content: string): string {
  return hashString(`blob\0${content}`)
}

type DiffOp = { type: 'equal' | 'del' | 'add'; aIndex?: number; bIndex?: number; text: string }

/** Совпадения строк база→сторона через классический LCS (см. branchRepo.ts, computeHunks — тот же
 * алгоритм, но для ДВУХ последовательностей вместо трёх сторон трёхстороннего слияния). */
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

/** Полный список построчных операций (equal/del/add) старое→новое, в порядке файла. */
function buildOps(a: string[], b: string[]): DiffOp[] {
  const matches = lcsMatches(a, b)
  const ops: DiffOp[] = []
  let ai = 0
  let bi = 0
  for (const [mi, mj] of matches) {
    while (ai < mi) {
      ops.push({ type: 'del', aIndex: ai, text: a[ai] })
      ai++
    }
    while (bi < mj) {
      ops.push({ type: 'add', bIndex: bi, text: b[bi] })
      bi++
    }
    ops.push({ type: 'equal', aIndex: mi, bIndex: mj, text: a[mi] })
    ai = mi + 1
    bi = mj + 1
  }
  while (ai < a.length) {
    ops.push({ type: 'del', aIndex: ai, text: a[ai] })
    ai++
  }
  while (bi < b.length) {
    ops.push({ type: 'add', bIndex: bi, text: b[bi] })
    bi++
  }
  return ops
}

/** Диапазоны [start,end) внутри `ops`, где подряд идут неравные (не 'equal') операции. */
function changeGroups(ops: DiffOp[]): Array<[number, number]> {
  const groups: Array<[number, number]> = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].type === 'equal') {
      i++
      continue
    }
    const start = i
    while (i < ops.length && ops[i].type !== 'equal') i++
    groups.push([start, i])
  }
  return groups
}

/** Соседние группы правок сливаются в один хунк, если между ними осталось меньше `2*context` строк контекста — стандартный алгоритм unified diff (тот же, что у `diff -u`/GNU diff). */
function mergeGroups(groups: Array<[number, number]>, context: number): Array<[number, number]> {
  if (!groups.length) return []
  const merged: Array<[number, number]> = [groups[0]]
  for (let k = 1; k < groups.length; k++) {
    const prev = merged[merged.length - 1]
    const cur = groups[k]
    if (cur[0] - prev[1] <= 2 * context) merged[merged.length - 1] = [prev[0], cur[1]]
    else merged.push(cur)
  }
  return merged
}

/** Разбивает полный список операций на хунки (каждый — с `context` строками контекста по краям, где они есть). */
function hunksFromOps(ops: DiffOp[], context: number): DiffOp[][] {
  const groups = mergeGroups(changeGroups(ops), context)
  return groups.map(([s, e]) => ops.slice(Math.max(0, s - context), Math.min(ops.length, e + context)))
}

/** "N" если N===1, иначе "start,N" — так настоящий git опускает счётчик из одной строки в заголовке хунка (сверено напрямую, git 2.53.0). */
function formatRange(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`
}

function hunkHeader(hunkOps: DiffOp[]): string {
  const oldOps = hunkOps.filter((o) => o.type !== 'add')
  const newOps = hunkOps.filter((o) => o.type !== 'del')
  const oldStart = oldOps.length ? (oldOps[0].aIndex as number) + 1 : 0
  const newStart = newOps.length ? (newOps[0].bIndex as number) + 1 : 0
  return `@@ -${formatRange(oldStart, oldOps.length)} +${formatRange(newStart, newOps.length)} @@`
}

function renderOp(op: DiffOp): string {
  const prefix = op.type === 'equal' ? ' ' : op.type === 'del' ? '-' : '+'
  return prefix + op.text
}

/**
 * Полный блок `diff --git …` для ОДНОГО файла — три случая (новый/удалённый/изменённый), все три
 * сверены напрямую построчно (git 2.53.0): пустой массив означает «файла нет в обоих деревьях»
 * или «содержимое совпадает» (вызывающему коду нечего печатать для этого файла).
 */
function diffFileBlock(file: string, oldContent: string | undefined, newContent: string | undefined): string[] {
  if (oldContent === newContent) return []
  const lines: string[] = [`diff --git a/${file} b/${file}`]

  if (oldContent === undefined) {
    const newLines = splitContentLines(newContent as string)
    lines.push('new file mode 100644')
    lines.push(`index 0000000..${blobHash(newContent as string)}`)
    lines.push('--- /dev/null', `+++ b/${file}`)
    lines.push(`@@ -${formatRange(0, 0)} +${formatRange(1, newLines.length)} @@`)
    newLines.forEach((l) => lines.push('+' + l))
    return lines
  }

  if (newContent === undefined) {
    const oldLines = splitContentLines(oldContent)
    lines.push('deleted file mode 100644')
    lines.push(`index ${blobHash(oldContent)}..0000000`)
    lines.push(`--- a/${file}`, '+++ /dev/null')
    lines.push(`@@ -${formatRange(1, oldLines.length)} +${formatRange(0, 0)} @@`)
    oldLines.forEach((l) => lines.push('-' + l))
    return lines
  }

  const oldLines = splitContentLines(oldContent)
  const newLines = splitContentLines(newContent)
  lines.push(`index ${blobHash(oldContent)}..${blobHash(newContent)} 100644`)
  lines.push(`--- a/${file}`, `+++ b/${file}`)
  const ops = buildOps(oldLines, newLines)
  hunksFromOps(ops, 3).forEach((hunkOps) => {
    lines.push(hunkHeader(hunkOps))
    hunkOps.forEach((op) => lines.push(renderOp(op)))
  })
  return lines
}

function valueOf(tree: FileTree, file: string): string | undefined {
  return has(tree, file) ? tree[file] : undefined
}

/** Имена файлов, различающихся между `left` и `right` (объединение ключей обоих деревьев), по алфавиту — порядок, в котором настоящий git печатает блоки. */
export function changedFileNames(left: FileTree, right: FileTree): string[] {
  const names = new Set<string>([...Object.keys(left), ...Object.keys(right)])
  return [...names].filter((f) => valueOf(left, f) !== valueOf(right, f)).sort()
}

/**
 * Полный `diff --git …` вывод между двумя деревьями (target.md, часть V — общая функция для ВСЕХ
 * форм diff: рабочее дерево/индекс/HEAD/коммит — конкретный выбор `left`/`right` делает вызывающий
 * код, inspectCommands.ts). `files`, если передан, ограничивает вывод этими именами (target.md,
 * «Что входит», pathspec `<файл>`/`-- <файл>`) — печатается блок только для тех из них, что
 * реально отличаются (для неизменного файла в списке — блока нет, как и у настоящего git).
 */
export function diffBetween(left: FileTree, right: FileTree, files?: string[]): string {
  const names = files ?? changedFileNames(left, right)
  const blocks = names
    .filter((f) => valueOf(left, f) !== valueOf(right, f))
    .map((f) => diffFileBlock(f, valueOf(left, f), valueOf(right, f)))
    .filter((b) => b.length > 0)
  return blocks.map((b) => b.join('\n')).join('\n')
}

interface FileLineStat {
  file: string
  added: number
  removed: number
}

function fileLineStat(file: string, oldContent: string | undefined, newContent: string | undefined): FileLineStat {
  if (oldContent === newContent) return { file, added: 0, removed: 0 }
  if (oldContent === undefined) return { file, added: splitContentLines(newContent as string).length, removed: 0 }
  if (newContent === undefined) return { file, added: 0, removed: splitContentLines(oldContent).length }
  const ops = buildOps(splitContentLines(oldContent), splitContentLines(newContent))
  return {
    file,
    added: ops.filter((o) => o.type === 'add').length,
    removed: ops.filter((o) => o.type === 'del').length,
  }
}

/**
 * `git diff --stat` (target.md, «Кратко») — столбец имён выровнен по самому длинному, полоса
 * "+"/"-" без масштабирования по ширине терминала (упрощение: настоящий git у больших диффов
 * ужимает полосу, чтобы вписаться в 80 столбцов — файлы тренажёра короткие, порог не достигается
 * ни в одном сценарии раздела, поэтому масштабирование не реализовано, см. отчёт).
 */
export function diffStat(left: FileTree, right: FileTree, files?: string[]): string {
  const names = (files ?? changedFileNames(left, right)).filter((f) => valueOf(left, f) !== valueOf(right, f))
  if (!names.length) return ''
  const stats = names.map((f) => fileLineStat(f, valueOf(left, f), valueOf(right, f)))
  const maxLen = Math.max(...names.map((f) => f.length))
  const lines = stats.map((s) => ` ${s.file.padEnd(maxLen)} | ${s.added + s.removed} ${'+'.repeat(s.added)}${'-'.repeat(s.removed)}`)
  const totalAdded = stats.reduce((sum, s) => sum + s.added, 0)
  const totalRemoved = stats.reduce((sum, s) => sum + s.removed, 0)
  const parts = [`${stats.length} file${stats.length === 1 ? '' : 's'} changed`]
  if (totalAdded) parts.push(`${totalAdded} insertion${totalAdded === 1 ? '' : 's'}(+)`)
  if (totalRemoved) parts.push(`${totalRemoved} deletion${totalRemoved === 1 ? '' : 's'}(-)`)
  lines.push(` ${parts.join(', ')}`)
  return lines.join('\n')
}

/** `git diff --name-only` (target.md, «Кратко») — только изменившиеся имена, по алфавиту. */
export function diffNameOnly(left: FileTree, right: FileTree, files?: string[]): string {
  const names = (files ?? changedFileNames(left, right)).filter((f) => valueOf(left, f) !== valueOf(right, f))
  return names.join('\n')
}
