// ============================================================
// Раздел 2 git-тренажёра, шаг A: данные и чистые операции — граф коммитов,
// ветки, HEAD, трёхстороннее слияние без конфликтов. Разбора командной
// строки здесь нет (см. branchCommands.ts) — только модель.
//
// Строки-литералы настоящего git ("Deleted branch …", "Already up to date.",
// "error: …") здесь и в branchCommands.ts — буквальный вывод, сверенный
// напрямую запуском git 2.53.0 во временном каталоге 23.09.2026 (см. отчёт
// о переносе раздела 2, шаг A). Как и в разделе 1, они не идут в словарь и
// не переводятся (CLAUDE.md, «Вывод git-команд не переводится»).
// ============================================================
import type { BranchingState, FileTree } from './branchTypes'
import { commitHashCore, has } from './util'

/**
 * Идентификатор коммита раздела 2 — хэш от сообщения, состава файлов, СПИСКА родителей (для
 * слияния — двух) и момента коммита (target.md, A5; util.ts, commitHashCore — общая функция с
 * разделом 1, repo.ts, где родитель не список, а один
 * необязательный id). `clock` передаёт вызывающая сторона (handleCommit/handleMerge,
 * branchCommands.ts) — её же значение нужно увеличить в возвращаемом состоянии
 * (BranchingState.clock, branchTypes.ts).
 */
export function branchCommitHash(message: string, tree: FileTree, parents: string[], clock: number): string {
  return commitHashCore(message, tree, parents, clock)
}

export function sameTree(a: FileTree, b: FileTree): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => has(b, k) && a[k] === b[k])
}

export function branchTip(state: BranchingState, name: string): string | null {
  return has(state.branches, name) ? state.branches[name] : null
}

export function commitTree(state: BranchingState, id: string): FileTree {
  return state.commits[id]?.tree ?? {}
}

export function currentTip(state: BranchingState): string {
  const id = branchTip(state, state.head)
  if (id === null) throw new Error(`invariant: HEAD branch "${state.head}" not found`)
  return id
}

export function headTree(state: BranchingState): FileTree {
  return commitTree(state, currentTip(state))
}

// ---------- граф коммитов: предки, общий предок (merge-base) ----------

/** Множество id всех предков коммита `id`, включая его самого. */
function ancestorSet(state: BranchingState, id: string): Set<string> {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    const c = state.commits[cur]
    if (c) c.parents.forEach((p) => stack.push(p))
  }
  return seen
}

/** Является ли коммит `a` предком (или тем же коммитом, что и) `b`. */
export function isAncestor(state: BranchingState, a: string, b: string): boolean {
  return ancestorSet(state, b).has(a)
}

/**
 * Результат mergeBase: обычно ровно одна лучшая база (`ambiguous: false`). Для крест-накрест
 * историй (двойное слияние двух веток друг в друга, см. mergeBase ниже) лучших общих предков
 * может быть НЕСКОЛЬКО сразу — `ambiguous: true` с полным списком, без попытки выбрать один
 * «наугад» (branchCommands.ts решает по правилу области, что делать дальше).
 */
export type MergeBaseResult = { ambiguous: false; base: string } | { ambiguous: true; bases: string[] }

/**
 * Общий предок (merge-base) двух коммитов — берётся ЛУЧШИЙ общий предок: тот из общих
 * предков, который сам не является предком никакого другого общего предка (то есть самый
 * поздний из них). Это важно, когда один из аргументов сам оказывается коммитом слияния:
 * например, после коммита слияния, влившего в ветку `z` постороннюю ветку `y` (общий предок
 * с `master` только через `y` — корневой коммит `R`), настоящий merge-base(master, z) — это
 * более поздний коммит `C1` (предок R), а не сам R (сверено напрямую, git 2.53.0, временный
 * каталог) — обход по первому встреченному общему предку без сравнения «поздний/ранний» мог бы
 * ошибочно вернуть R и показать ложный конфликт там, где настоящий git делает Fast-forward.
 *
 * Для несложных, НЕ крест-накрест историй шага A лучший общий предок всегда один. Крест-накрест
 * история (обе ветки сливали друг друга дважды подряд, см. branchRepo.test.ts,
 * makeCrissCrossGraph) реально даёт НЕСКОЛЬКО лучших общих предков сразу (сверено напрямую, git
 * 2.53.0: `git merge-base --all master b` печатает два коммита) — настоящий git в этом случае
 * использует более полный алгоритм (виртуальный общий предок, "recursive"/"ort" merge base) и
 * реально сливает такую историю сам, без конфликта. Этот шаг тренажёра такой алгоритм не
 * реализует: при нескольких лучших общих предках сразу неоднозначность возвращается наружу как
 * есть (`ambiguous: true`), а не подменяется произвольным выбором одного из них (`best[0]`) —
 * решение честно отказать по правилу области принимает branchCommands.ts (handleMerge), а не
 * эта функция.
 */
export function mergeBase(state: BranchingState, a: string, b: string): MergeBaseResult {
  const ancestorsOfA = ancestorSet(state, a)
  const ancestorsOfB = ancestorSet(state, b)
  const common: string[] = []
  ancestorsOfA.forEach((id) => {
    if (ancestorsOfB.has(id)) common.push(id)
  })
  if (!common.length) throw new Error('invariant: no common ancestor (история должна иметь общий корень)')
  const best = common.filter((c) => !common.some((d) => d !== c && isAncestor(state, c, d)))
  if (best.length > 1) return { ambiguous: true, bases: best }
  return { ambiguous: false, base: best[0] }
}

// ---------- трёхстороннее построчное слияние одного файла (target.md, часть IV, «опасное место 5») ----------

interface Hunk {
  /** Полуоткрытый диапазон строк БАЗЫ, который эта правка заменяет. */
  bStart: number
  bEnd: number
  /** Диапазон строк СТОРОНЫ (ours/theirs), которым заменяется bStart..bEnd. */
  start: number
  end: number
}

/**
 * Построчный diff база→сторона через классический LCS (O(n·m), файлы
 * тренажёра короткие — производительность не важна). Возвращает список
 * непересекающихся замен: base[bStart:bEnd] → other[start:end].
 */
function computeHunks(base: string[], other: string[]): Hunk[] {
  const n = base.length
  const m = other.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = base[i] === other[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const matches: Array<[number, number]> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (base[i] === other[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
      matches.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  const hunks: Hunk[] = []
  let prevB = 0
  let prevO = 0
  for (const [bi, oi] of matches) {
    if (bi > prevB || oi > prevO) hunks.push({ bStart: prevB, bEnd: bi, start: prevO, end: oi })
    prevB = bi + 1
    prevO = oi + 1
  }
  if (prevB < n || prevO < m) hunks.push({ bStart: prevB, bEnd: n, start: prevO, end: m })
  return hunks
}

/**
 * Ханки НЕ независимы (нужна дальнейшая проверка — совпадают ли они содержимым или это
 * настоящий конфликт), если между ними не осталось ни одной неизменённой строки базы —
 * это включает не только настоящее пересечение диапазонов, но и СОПРИКОСНОВЕНИЕ
 * (h1.bEnd === h2.bStart), а также точное совпадение точки вставки при пустых диапазонах
 * (bStart === bEnd — чистая вставка) — сравнение "<=", а не строгое "<" (сверено запуском git
 * 2.53.0 во временном каталоге):
 * 1) база "a\nb\nc", ours "a\nX\nc", theirs "a\nb\nY" — соприкасающиеся ханки без общей
 *    строки базы между ними; настоящий git даёт CONFLICT (content).
 * 2) база "a", ours "a\nours", theirs "a\ntheirs" — обе стороны вставляют РАЗНОЕ в одну и
 *    ту же точку (конец файла); настоящий git даёт CONFLICT (content).
 * То же "<=" даёт и правильное схлопывание одинаковой вставки с обеих сторон в одну (база
 * "a\nb", ours "a\nX\nb\nO", theirs "a\nX\nb"): для пары чистых вставок (bStart === bEnd с
 * обеих сторон) сравнение sameRange/arraysEqual ниже должно выполниться и совпадающая точка
 * вставки — схлопнуться в одну (сверено: git 2.53.0 merge даёт "a\nX\nb\nO" одной вставкой X,
 * без дубля).
 */
function hunksOverlap(h1: Hunk, h2: Hunk): boolean {
  return h1.bStart <= h2.bEnd && h2.bStart <= h1.bEnd
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, idx) => v === b[idx])
}

/**
 * Дискриминированное объединение по `conflict` намеренно не даёт коду прочитать `content` как
 * string, не проверив сперва `conflict === false` (TypeScript сузит тип только после проверки) —
 * при конфликте валидного результата слияния нет, а `content: <одна из сторон>` было бы
 * правдоподобной с виду строкой, которую легко случайно принять за настоящий результат.
 */
export type FileMergeResult =
  | {
      conflict: false
      content: string
      /** Слияние потребовало настоящего построчного объединения (обе стороны отличаются от базы и друг от друга),
       * а не тривиального «одна сторона не менялась» — используется, чтобы решить, печатать ли "Auto-merging <файл>". */
      autoMerged: boolean
    }
  | {
      conflict: true
      content: null
      autoMerged: boolean
    }

/**
 * Трёхстороннее слияние содержимого ОДНОГО файла (target.md, часть IV,
 * «опасное место 5»: правки в разных строках сливаются сами, без конфликта).
 *
 * Упрощение: используется собственный построчный
 * diff3-подобный алгоритм, а не алгоритм настоящего git (xdiff/ort с его
 * эвристиками похожести и контекста). Он корректно даёт бесконфликтное
 * слияние для двух проверенных настоящим git сценариев — непересекающиеся
 * правки и одинаковая правка с обеих сторон — и честно сообщает о конфликте
 * (via conflict: true), когда правки пересекаются в одних и тех же строках;
 * дальше конфликт обрабатывается ПО ПРАВИЛУ ОБЛАСТИ (branchCommands.ts) —
 * в шаг A конфликты не входят вовсе (target.md, часть IV, «опасное место 6»).
 */
export function mergeFileContent(base: string, ours: string, theirs: string): FileMergeResult {
  if (ours === theirs) return { content: ours, autoMerged: false, conflict: false }
  if (ours === base) return { content: theirs, autoMerged: false, conflict: false }
  if (theirs === base) return { content: ours, autoMerged: false, conflict: false }

  const baseLines = base.split('\n')
  const oursLines = ours.split('\n')
  const theirsLines = theirs.split('\n')
  const oursHunks = computeHunks(baseLines, oursLines)
  const theirsHunks = computeHunks(baseLines, theirsLines)

  const usedTheirs = new Set<number>()
  const applied: Array<Hunk & { lines: string[] }> = []

  for (const oh of oursHunks) {
    let conflict = false
    let mergedWithTheirsIdx: number | null = null
    for (let ti = 0; ti < theirsHunks.length; ti++) {
      const th = theirsHunks[ti]
      if (!hunksOverlap(oh, th)) continue
      const sameRange = oh.bStart === th.bStart && oh.bEnd === th.bEnd
      const oursContent = oursLines.slice(oh.start, oh.end)
      const theirsContent = theirsLines.slice(th.start, th.end)
      if (sameRange && arraysEqual(oursContent, theirsContent)) {
        mergedWithTheirsIdx = ti
      } else {
        conflict = true
      }
    }
    if (conflict) return { content: null, autoMerged: true, conflict: true }
    applied.push({ ...oh, lines: oursLines.slice(oh.start, oh.end) })
    if (mergedWithTheirsIdx !== null) usedTheirs.add(mergedWithTheirsIdx)
  }
  theirsHunks.forEach((th, ti) => {
    if (usedTheirs.has(ti)) return
    applied.push({ ...th, lines: theirsLines.slice(th.start, th.end) })
  })

  applied.sort((a, b) => a.bStart - b.bStart)
  const resultLines: string[] = []
  let cursor = 0
  for (const h of applied) {
    resultLines.push(...baseLines.slice(cursor, h.bStart))
    resultLines.push(...h.lines)
    cursor = h.bEnd
  }
  resultLines.push(...baseLines.slice(cursor))
  return { content: resultLines.join('\n'), autoMerged: true, conflict: false }
}

/**
 * Категория конфликта — три разные вещи у настоящего git (git-merge(1)/merge-ort), с разными
 * сообщениями ("CONFLICT (content)"/"CONFLICT (modify/delete)"/"CONFLICT (add/add)") — сверено
 * напрямую (git 2.53.0, все три сценария). Категория передаётся дальше отдельно от факта
 * конфликта, чтобы текст отказа в branchCommands.ts (через locales/ru.ts) не описывал ЛЮБОЙ
 * конфликт как «правки задели одни и те же строки» — это верно только для одного из трёх
 * случаев (см. classifyConflict ниже).
 */
export type ConflictKind = 'content' | 'modify-delete' | 'add-add'

export interface ConflictInfo {
  file: string
  kind: ConflictKind
}

export interface TreeMergeResult {
  tree: FileTree
  /** Файлы, для которых понадобилось настоящее построчное слияние — для строк "Auto-merging <файл>". */
  autoMerged: string[]
  /** Файлы с настоящим конфликтом — решение о том, что с этим делать, принимает branchCommands.ts. */
  conflicts: ConflictInfo[]
}

/**
 * Определяет категорию конфликта по значениям базы/ours/theirs — вызывается ТОЛЬКО в точке,
 * куда mergeTrees уже дошёл, не разрешив путь ни одним из бесконфликтных случаев (o===t/o===b/
 * t===b) и не сумев (или не пытавшись) построчно слить. При таких условиях возможны ровно три
 * комбинации (сверено напрямую, git 2.53.0, все три):
 * - все три определены, но mergeFileContent(b, o, t) вернул conflict:true → 'content'
 *   (правки пересеклись в одних и тех же строках).
 * - базы нет (b === undefined), а ours и theirs определены и различны → 'add-add' (файл
 *   создан в обеих ветках с разным содержимым — общего предка у файла нет вообще).
 * - база есть, но ровно одна из сторон удалила файл (o или t === undefined), а другая его
 *   изменила (иначе путь был бы решён случаем t===b/o===b выше) → 'modify-delete'.
 */
function classifyConflict(b: string | undefined, o: string | undefined, t: string | undefined): ConflictKind {
  if (b !== undefined && o !== undefined && t !== undefined) return 'content'
  if (b === undefined) return 'add-add'
  return 'modify-delete'
}

/**
 * Трёхстороннее слияние ДЕРЕВЬЕВ файлов: база (общий предок), «наша» и
 * «их» версии. Стандартное правило git для каждого пути — совпадают ли
 * стороны друг с другом/с базой; если обе стороны отличаются от базы И друг
 * от друга — только тогда включается построчное слияние (mergeFileContent),
 * а не при любом различии (см. CLAUDE.md/target.md — запрещённое упрощение
 * «любая правка в обеих ветках = конфликт»).
 */
export function mergeTrees(base: FileTree, ours: FileTree, theirs: FileTree): TreeMergeResult {
  const files = new Set<string>([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  const tree: FileTree = {}
  const autoMerged: string[] = []
  const conflicts: ConflictInfo[] = []

  files.forEach((f) => {
    const b = has(base, f) ? base[f] : undefined
    const o = has(ours, f) ? ours[f] : undefined
    const t = has(theirs, f) ? theirs[f] : undefined

    if (o === t) {
      if (o !== undefined) tree[f] = o
      return
    }
    if (o === b) {
      if (t !== undefined) tree[f] = t
      return
    }
    if (t === b) {
      if (o !== undefined) tree[f] = o
      return
    }
    if (b !== undefined && o !== undefined && t !== undefined) {
      const merged = mergeFileContent(b, o, t)
      if (!merged.conflict) {
        tree[f] = merged.content
        if (merged.autoMerged) autoMerged.push(f)
        return
      }
    }
    conflicts.push({ file: f, kind: classifyConflict(b, o, t) })
  })

  conflicts.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  return { tree, autoMerged: autoMerged.sort(), conflicts }
}

// ---------- «грязное» рабочее дерево: общая часть checkout/merge ----------

/**
 * Файлы, у которых индекс или рабочее дерево отличаются от HEAD (staged
 * ИЛИ unstaged локальная правка — настоящий git при проверке безопасности
 * checkout/merge учитывает и то, и другое вместе, сверено напрямую, git 2.53.0).
 */
function localChangeFiles(state: BranchingState): Set<string> {
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
 * Файлы, по которым ИНДЕКС отличается от HEAD — независимо от того, участвует ли путь в
 * предстоящем слиянии. Нужна только для предмерджевой проверки НЕ-перемоточного
 * `git merge` (branchCommands.ts, handleMerge):
 * git-merge(1), PRE-MERGE CHECKS — «git merge will also abort if there are any changes
 * registered in the index relative to the HEAD commit»; сверено напрямую (git 2.53.0,
 * временный каталог): для fast-forward это разрешено (см. checkSafety ниже — её поведение
 * для fast-forward уже совпадает с git), а для настоящего трёхстороннего слияния — нет,
 * даже по файлу, которого слияние не касается.
 */
export function indexDiffersFromHead(state: BranchingState): string[] {
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
 * Проверка безопасности "было бы затёрто" — общая для checkout и merge
 * (target.md, часть IV, «опасное место 1»). `resultTree` — дерево, к
 * которому приводит операция (для checkout — дерево целевой ветки; для
 * merge — дерево после fast-forward ИЛИ уже посчитанное дерево слияния).
 *
 * Правило — ДВЕ разные проверки git (unpack-trees.c, twoway_merge()), а не одна общая:
 *
 * 1) Нужно ли вообще трогать путь — да, только если операция реально меняет его содержимое
 *    относительно текущего HEAD (head !== target). Если путь у цели не отличается от HEAD,
 *    git его не трогает вовсе и никогда не блокирует, какая бы локальная правка ни была.
 * 2) Если путь трогать НАДО (head !== target), дальше НЕ один общий тест, а два разных:
 *    а) ЗАСТЕЙДЖЕННАЯ правка (index !== head) — git сравнивает ИНДЕКС с ЦЕЛЬЮ (case 18/19,
 *       twoway_merge → keep_entry): если индекс УЖЕ совпадает с целевым содержимым (index ===
 *       target), git отказа не делает — оставляет путь как есть, ДАЖЕ если рабочее дерево
 *       после этого ещё отличается от индекса (та лишняя незастейджённая правка поверх не
 *       проверяется вообще, verify_uptodate для нее не вызывается, потому что git не должен
 *       ничего записывать в этот путь). Если же индекс НЕ совпадает с целью — отказ, независимо
 *       от того, есть ли ещё и незастейджённая правка сверху.
 *    б) НЕЗАСТЕЙДЖЕННАЯ правка (working !== index, индекс не менялся) — здесь работает
 *       verify_uptodate(), сравнивающий РАБОЧЕЕ ДЕРЕВО С ИНДЕКСОМ (не с целью): раз индекс не
 *       менялся (index === head !== target), git обязан переписать путь и отказывает, если
 *       рабочее дерево при этом отличается от индекса, — НЕ проверяя, совпало бы итоговое
 *       содержимое случайно с целью или нет.
 *    Обе половины сведены к одной формуле ниже: путь блокируется, если head !== target
 *    (операция путь трогает) И index !== target (индекс ещё не на месте цели) — это одновременно
 *    даёт правильный ответ и для случая (а) (когда index уже == target — не блокирует), и для
 *    случая (б) (когда index не менялся, index === head !== target — блокирует, если working
 *    отличается от index, что и обеспечивает членство файла в `dirty`, см. localChangeFiles).
 *
 * Сверено напрямую (git 2.53.0, оба случая — застейджённая правка = цели проходит без отказа
 * даже с дополнительной незастейджённой правкой поверх; незастейджённая правка, случайно
 * совпавшая с целью, но с неизменным индексом, — всё равно отказ).
 *
 * Ещё один частный случай (б) — файл удалён из рабочего дерева НАПРЯМУЮ (`rm`, а не `git rm`),
 * без затрагивания индекса: verify_uptodate() у настоящего git делает lstat() пути и, если файла
 * на диске вообще нет, считает путь «up to date» безусловно — перезаписывать нечего, поэтому
 * отказа нет НИКОГДА, каким бы ни было содержимое цели (в отличие от обычной незастейджённой
 * ПРАВКИ файла, которая отказ даёт). Сверено напрямую (git 2.53.0): `rm f.txt` без `git add`/
 * `git rm`, затем `git checkout <ветка>` с другим содержимым f.txt — переключение проходит с
 * кодом 0, файл создаётся заново с содержимым цели; то же для fast-forward и для настоящего
 * трёхстороннего merge. Если же удаление ЗАСТЕЙДЖЕНО (`git rm`, index !== head) — это уже
 * случай (а), и там отказ остаётся (сверено напрямую: `git rm` + `git checkout` на другую
 * версию файла даёт "would be overwritten by checkout").
 */
export function checkSafety(state: BranchingState, resultTree: FileTree): SafetyBlock {
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

export interface CarriedFile {
  file: string
  /** Буква как в коротком статусе (repo.ts, раздел 1) — 'M'/'A'/'D'. 'M' и 'D' сверены
   * напрямую запуском git 2.53.0 во временном каталоге (см. applyTreeChange); 'A' (файл есть
   * в рабочем дереве, но результирующего дерева операции не касается) — симметричный случай
   * по той же формуле, отдельным прогоном не выделялся. */
  type: 'M' | 'A' | 'D'
}

/**
 * Применяет результат checkout/merge к index/working: для «чистых» файлов —
 * приводит к новому дереву; для локально изменённых, но не заблокированных
 * checkSafety (не тронутых операцией), переносит правку как есть — то самое
 * поведение, которого требует target.md, «опасное место 1» («переносит
 * незакоммиченные правки, если это не затирает работу»).
 *
 * Возвращает также список «увезённых» файлов для строки-отчёта ("M\t<файл>",
 * см. checkout в branchCommands.ts) — только те, что были локально изменены
 * и результат их не тронул.
 */
export function applyTreeChange(state: BranchingState, resultTree: FileTree): { index: FileTree; working: FileTree; carried: CarriedFile[] } {
  const head = headTree(state)
  const dirty = localChangeFiles(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(resultTree), ...Object.keys(state.working), ...Object.keys(state.index)])
  const nextIndex: FileTree = {}
  const nextWorking: FileTree = {}
  const carried: CarriedFile[] = []

  files.forEach((f) => {
    // Тот же самый обход исключения, что и в checkSafety (см. её комментарий): файл удалён из
    // рабочего дерева напрямую (`rm`, индекс не менялся) и путь при этом ЗАТРАГИВАЕТСЯ операцией
    // (head отличается от цели) — checkSafety такой путь не блокирует, а настоящий git полностью
    // перезаписывает его версией цели И в индексе, И в рабочем дереве (сверено напрямую, git
    // 2.53.0: `git status` после такого checkout/merge — "nothing to commit, working tree
    // clean", то есть путь обновлён полностью, а не «перенесён как локальная правка»). Если
    // путь операцией НЕ затрагивается (head === цель), это уже другой случай — обычный перенос
    // локального удаления (см. carried ниже, тип 'D').
    const oldVal = has(head, f) ? head[f] : undefined
    const resVal = has(resultTree, f) ? resultTree[f] : undefined
    const idxVal = has(state.index, f) ? state.index[f] : undefined
    const missingUnstagedOnTouchedPath = dirty.has(f) && oldVal !== resVal && idxVal === oldVal && !has(state.working, f)

    if (dirty.has(f) && !missingUnstagedOnTouchedPath) {
      if (has(state.index, f)) nextIndex[f] = state.index[f]
      if (has(state.working, f)) nextWorking[f] = state.working[f]

      // Отчёт checkout (show_local_changes() → run_diff_index()) у настоящего git строится ПО
      // ИНДЕКСУ — неотслеживаемого файла (нет ни в HEAD, ни в индексе) там нет в принципе,
      // checkout никогда не печатает про него строку в этом отчёте (сверено напрямую, git
      // 2.53.0: untracked-файл в рабочем дереве при checkout на другую ветку не даёт вообще
      // никакой строки про себя — только заголовок "Switched to branch"). Сам файл при этом
      // остаётся в рабочем дереве как есть (это не меняется), меняется только то, попадает ли
      // он в текстовый отчёт. knownToGit — тот же принцип, что и в checkSafety
      // (has(head, f) || has(state.index, f)).
      const knownToGit = has(head, f) || has(state.index, f)
      if (!knownToGit) return

      // Дополнительно: если после переноса содержимое индекса И рабочего дерева уже СОВПАДАЕТ
      // с результирующим деревом операции (застейджённая правка, случайно совпавшая с целью, —
      // такой путь пропускается checkSafety, см. её комментарий ниже), печатать нечего — путь
      // фактически чист относительно нового HEAD (сверено напрямую, git 2.53.0: в этом случае
      // `git checkout` не печатает ни строки отчёта, ни последующего "M" в git status).
      const workVal = has(state.working, f) ? state.working[f] : undefined
      if (idxVal === resVal && workVal === resVal) return

      // Буква — как в show_local_changes()/run_diff_index() настоящего git: сравнение идёт
      // с РЕЗУЛЬТИРУЮЩИМ деревом операции (новой целью — той веткой/коммитом, на которую
      // переключаемся или сливаем), а не со СТАРЫМ HEAD, и по факту присутствия в РАБОЧЕМ
      // дереве, а не в индексе — иначе файл, отслеживаемый и в HEAD, и у цели, но удалённый
      // локально из рабочего дерева без add, получил бы 'M' вместо 'D'. Сверено напрямую
      // (git 2.53.0, 23.09.2026): такой файл при checkout на ветку, где он тоже есть,
      // печатается как "D\t<файл>".
      const inResult = has(resultTree, f)
      const inNextWorking = has(state.working, f)
      const type: CarriedFile['type'] = !inResult && inNextWorking ? 'A' : inResult && !inNextWorking ? 'D' : 'M'
      carried.push({ file: f, type })
      return
    }
    if (has(resultTree, f)) {
      nextIndex[f] = resultTree[f]
      nextWorking[f] = resultTree[f]
    }
  })

  carried.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  return { index: nextIndex, working: nextWorking, carried }
}

// ---------- git status для раздела 2 (нужен только handleCommit) ----------

export interface BranchingFileStatusEntry {
  file: string
  type: 'new file' | 'modified' | 'deleted'
}

export interface BranchingStatusSnapshot {
  staged: BranchingFileStatusEntry[]
  notStaged: BranchingFileStatusEntry[]
  untracked: string[]
}

/**
 * Структурированный git status для модели раздела 2 — тот же принцип, что и getStatus в
 * repo.ts раздела 1 (staged = индекс vs HEAD, notStaged = рабочее дерево vs индекс,
 * untracked = есть в рабочем дереве, но не в индексе), независимая реализация (раздел 1
 * не импортируется, см. шапку файла и hashString выше — та же причина: типы данных разные).
 * В отличие от раздела 1 здесь HEAD и хотя бы один коммит есть всегда — состояний
 * «нет репозитория»/«нет коммитов» у BranchingState не бывает (branchTypes.ts).
 */
export function branchingStatus(state: BranchingState): BranchingStatusSnapshot {
  const head = headTree(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(state.index), ...Object.keys(state.working)])
  const staged: BranchingFileStatusEntry[] = []
  const notStaged: BranchingFileStatusEntry[] = []
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

function byFileName(a: BranchingFileStatusEntry, b: BranchingFileStatusEntry): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
}

/**
 * `On branch <head>` + актуальный статус. Когда индекс == HEAD, но рабочее дерево отличается
 * от индекса (незастейджённая правка), настоящий git печатает обычный статус с блоком
 * "Changes not staged" и завершается неуспешно, а не голой строкой про "clean" — 'nothing to
 * commit, working tree clean' верно только тогда, когда чисто и то, и другое (сверено напрямую,
 * git 2.53.0, оба случая — чистое дерево и грязное незастейджённое).
 *
 * Формат — по образцу repo.ts (formatStatusFriendly, раздел 1), НЕ импортируя из repo.ts
 * (раздел 1 не трогаем, см. CLAUDE.md) — независимая реализация под модель BranchingState.
 * Отличие от repo.ts: здесь у блока "Changes not staged" две подсказки ("git add" и
 * "git restore"), а не одна — это сверено напрямую (git 2.53.0); repo.ts сознательно
 * оставляет только первую подсказку как задокументированное упрощение раздела 1 (см.
 * repo.ts, комментарий над formatStatusFriendly, target.md часть III, правило 2) — раздел 1 эта
 * задача не трогает, поэтому расхождение между разделами здесь осознанное, а не недосмотр.
 */
export function formatBranchingStatus(state: BranchingState): string {
  const s = branchingStatus(state)
  // Блоки — каждый как единая многострочная секция; между секциями пустая строка, но НЕ между
  // "On branch <head>" и первой секцией (сверено напрямую git 2.53.0, 23.09.2026: "On branch
  // master" и "Changes not staged for commit:" — соседние строки без пустой строки между ними;
  // пустая строка появляется только МЕЖДУ блоками и перед финальной строкой статуса).
  const blocks: string[][] = []

  if (s.staged.length) {
    // Подсказка "(use ... to unstage)" под заголовком блока — сверено напрямую (git 2.53.0,
    // 24.09.2026): у настоящего git она есть здесь так же, как и у блока "Changes not staged"
    // ниже.
    const block = ['Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)']
    s.staged
      .slice()
      .sort(byFileName)
      .forEach((x) => block.push(`\t${(x.type + ':').padEnd(12)}${x.file}`))
    blocks.push(block)
  }
  if (s.notStaged.length) {
    // Первая подсказка меняется на "git add/rm <file>..." (вместо голого "git add <file>..."),
    // если среди незастейджённых правок есть хоть одно удаление файла — сверено напрямую (git
    // 2.53.0, mktemp-каталог, 26.09.2026): подсказка одна на весь блок, а не по файлу, поэтому
    // достаточно ОДНОГО "deleted" в списке notStaged, чтобы вся строка сменилась — даже когда
    // рядом есть и "modified"-записи. Блок "Changes to be committed" (staged, выше) на это не
    // реагирует ни при каком составе: там подсказка всегда "git restore --staged <file>..." —
    // тем же прогоном отдельно проверено для застейдженного удаления (и в одиночку, и вперемешку
    // с другим застейдженным файлом), поэтому этот блок здесь не трогается.
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
  // Сверено напрямую (git 2.53.0, mktemp-каталог, 25.09.2026, все четыре комбинации: только
  // staged, только not-staged, только untracked, staged+untracked): настоящий
  // git завершает КАЖДЫЙ блок пустой строкой — если после последнего блока идёт финальная строка
  // статуса ("no changes added…"/"nothing added…"), она уже добавлена как свой блок и разделена
  // пустой строкой циклом выше; но когда staged НЕ пуст, финальной строки нет вообще (блок
  // "Changes to be committed" — последний), и эта пустая строка остаётся в самом конце вывода —
  // без неё сравнение с git даёт [DIFF]. Когда staged пуст, эта строка не нужна: либо есть другая
  // финальная строка (уже отделена пустой строкой в цикле выше), либо блоков нет вовсе
  // ("On branch X\nnothing to commit, working tree clean" — без единой пустой строки).
  if (s.staged.length) output += '\n'
  return output
}
