// ============================================================
// Раздел 1 git-тренажёра: состояние репозитория, git status, git init/add/commit
// на уровне данных (без разбора командной строки — см. commands.ts).
//
// Все строки в этом файле, которые выводятся как есть, — буквальный вывод
// настоящего git (Initialized/Reinitialized, On branch, fatal:/error: …).
// Это не UI-текст, поэтому он не идёт в словарь (см. locales/ru.ts,
// пояснение в шапке файла, и требование 4 в задаче на перенос).
// ============================================================
import type { Commit, FileStatusEntry, FileTree, SectionState, StatusSnapshot } from './types'
import { Stage } from './types'
import { commitHashCore, has } from './util'

/** Имя репозитория раздела 1 — совпадает с source.html (`new GitRepo('site')`), используется в путях .git/. */
export const REPO_NAME = 'site'
/** Имя единственной ветки раздела 1 — детач HEAD и другие ветки он не поддерживает. */
export const DEFAULT_BRANCH = 'master'
/** Имя файла, с которым раздел 1 всегда начинается (см. spec 2.2). Единственное место объявления —
 * missions.ts импортирует эту константу (см. missions.ts, addIndexHtml), а не дублирует строку. */
export const SEED_FILE = 'index.html'

/** Сравнение двух снимков файлов на полное совпадение (ключи и значения). */
export function sameTree(a: FileTree, b: FileTree): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => has(b, k) && a[k] === b[k])
}

/** Дерево последнего коммита (HEAD) или пустой объект, если коммитов ещё нет. */
export function headTree(state: SectionState): FileTree {
  const last = state.commits[state.commits.length - 1]
  return last ? last.tree : {}
}

function lastCommitId(state: SectionState): string | null {
  const last = state.commits[state.commits.length - 1]
  return last ? last.id : null
}

/**
 * Идентификатор коммита — хэш от его содержимого (сообщения, состава файлов, родителя) и
 * момента коммита (target.md, A5; util.ts, commitHashCore — общая функция для разделов 1 и 2).
 * `clock` передаёт вызывающая сторона (commitFromIndex/commitPathspec ниже) — её же значение
 * нужно увеличить в возвращаемом состоянии. Одинаковая последовательность действий с начала
 * раздела (в т.ч. после «начать заново») детерминированно даёт один и тот же id.
 */
export function commitHash(message: string, tree: FileTree, parentId: string | null, clock: number): string {
  return commitHashCore(message, tree, parentId === null ? [] : [parentId], clock)
}

/** Ш0–Ш4: производное состояние репозитория, вычисляется из данных, нигде не хранится отдельно. */
export function getStage(state: SectionState): Stage {
  if (!state.initialized) return Stage.NoRepo
  if (state.commits.length === 0) {
    return Object.keys(state.index).length === 0 ? Stage.Empty : Stage.Staged
  }
  const head = headTree(state)
  const clean = sameTree(head, state.index) && sameTree(state.index, state.working)
  return clean ? Stage.Clean : Stage.Dirty
}

/**
 * target.md, п.3 + часть III, правила 1–2: Ш1 (Stage.Empty) сам по себе смешивает
 * два разных случая — «в репозитории вообще нет файлов» и «есть неотслеживаемый файл, но
 * индекс/коммитов ещё нет» (например сразу после `git init`, пока index.html лежит в рабочем
 * дереве, но `git add` ещё не выполнен). Подпись «пусто» относится строго к первому случаю
 * (п.3: «Пустой репозиторий (нет ни одного файла) показывается как «пусто»»), поэтому этот
 * булев признак — отдельная, проверяемая точка данных для будущего UI, а не переопределение
 * самого Stage: расширять пятизначный Ш0–Ш4 шестым значением означало бы разойтись с
 * нумерацией spec.md/target.md, которая используется по всему набору тестов.
 */
export function repoHasNoFiles(state: SectionState): boolean {
  return Object.keys(state.working).length === 0 && Object.keys(state.index).length === 0 && state.commits.length === 0
}

/**
 * Структурированный git status (staged/notStaged/untracked) — порт `GitRepo.status()`. Без tracking/detached:
 * вне границ раздела 1.
 *
 * Модель данных (target.md, A1/A3): три независимые области — HEAD, индекс, рабочее дерево.
 * - «staged» — сравнение индекса с HEAD (отслеживаемость тут ни при чём: сравниваются только эти два места).
 * - «untracked» — файл неотслеживаемый ⟺ его нет в индексе, а он есть в рабочем дереве. Не важно, есть
 *   ли он в HEAD: реальный git показывает «??» и для файла, которого никогда не было в истории, и для
 *   файла, который был закоммичен, но выведен из индекса (например git add после удаления, либо
 *   git rm --cached) — тогда одновременно показываются staged-deleted и untracked для одного и того же имени.
 * - «notStaged» — сравнение индекса с рабочим деревом; имеет смысл только для файлов, которые в индексе
 *   ЕСТЬ (иначе это не «неподготовленное изменение», а либо untracked, либо полное отсутствие файла).
 */
export function getStatus(state: SectionState): StatusSnapshot {
  const head = headTree(state)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(state.index), ...Object.keys(state.working)])
  const staged: FileStatusEntry[] = []
  const notStaged: FileStatusEntry[] = []
  const untracked: string[] = []

  for (const f of files) {
    const inHead = has(head, f)
    const inIndex = has(state.index, f)
    const inWorking = has(state.working, f)

    if (inIndex && !inHead) staged.push({ file: f, type: 'new file' })
    else if (inIndex && inHead && state.index[f] !== head[f]) staged.push({ file: f, type: 'modified' })
    else if (!inIndex && inHead) staged.push({ file: f, type: 'deleted' })

    if (!inIndex && inWorking) {
      untracked.push(f)
      continue
    }

    if (inIndex && inWorking && state.index[f] !== state.working[f]) notStaged.push({ file: f, type: 'modified' })
    else if (inIndex && !inWorking) notStaged.push({ file: f, type: 'deleted' })
  }

  return { branch: state.branch, hasCommits: state.commits.length > 0, staged, notStaged, untracked }
}

/**
 * Итоговая строка `git status` (см. spec 2.4, пункт 6) зависит от того, какие блоки
 * непустые. Используется и для форматирования текста, и для выбора пояснения 💡
 * к неудачному commit (spec 2.6) — без повторного разбора итогового текста регулярками.
 */
export type StatusTailKind = 'needsAddNotStaged' | 'needsAddUntracked' | 'needsAddEmpty' | 'clean' | null

export function statusTailKind(s: StatusSnapshot): StatusTailKind {
  if (s.staged.length) return null
  if (s.notStaged.length) return 'needsAddNotStaged'
  if (s.untracked.length) return 'needsAddUntracked'
  if (!s.hasCommits) return 'needsAddEmpty'
  return 'clean'
}

/** Файл, который стоит упомянуть в пояснении «сначала добавь файл: git add …» (target.md, п.5). */
export function representativeFileFor(s: StatusSnapshot, kind: StatusTailKind): string | null {
  if (kind === 'needsAddNotStaged') return s.notStaged[0]?.file ?? null
  if (kind === 'needsAddUntracked') return s.untracked[0] ?? null
  return null
}

/**
 * `git status` в «настоящем» формате (как в реальном Git) — см. spec 2.4. Буквальный вывод git,
 * не переводится.
 *
 * target.md, часть III, правило 2: реальный git печатает больше
 * "  (use ...)" подсказок, чем здесь (у блока "Changes to be committed" тоже есть своя —
 * "git rm --cached"/"git restore --staged" в зависимости от того, есть ли уже коммиты; у
 * "Changes not staged" вторая строка про "git restore <file>...", и первая меняется на
 * "git add/rm" при удалениях) и добавляет "1 file changed, N insertion(+)/deletion(-)" после
 * успешного коммита (нужен посимвольный/построчный diff содержимого, которого эта модель не
 * считает). Раздел 1 сознательно НЕ пытается частично их имитировать (ровно то, чего требует
 * правило 2: либо дословно, либо явно не разбирать) — показанные здесь строки настоящие и
 * неполные, а не наполовину придуманные.
 */
function byFileName(a: FileStatusEntry, b: FileStatusEntry): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
}

export function formatStatusFriendly(state: SectionState): string {
  const s = getStatus(state)
  const lines: string[] = []
  lines.push(`On branch ${s.branch ?? '(нет)'}`)
  if (!s.hasCommits) lines.push('', 'No commits yet')
  // Реальный git выравнивает "тип:" до столбца 12 пробелами (не табом) перед именем файла —
  // например "modified:   file", "new file:   file", "deleted:    file" (проверено на git 2.53).
  // Порядок внутри каждого блока — по имени файла (target.md, часть III, правила 1–2):
  // getStatus строит списки из Set (порядок обхода HEAD/индекс/рабочее дерево), настоящий git
  // печатает пути отсортированными, поэтому список сортируется явно (byFileName).
  if (s.staged.length) {
    lines.push('', 'Changes to be committed:')
    s.staged
      .slice()
      .sort(byFileName)
      .forEach((x) => lines.push(`\t${(x.type + ':').padEnd(12)}${x.file}`))
  }
  if (s.notStaged.length) {
    lines.push('', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)')
    s.notStaged
      .slice()
      .sort(byFileName)
      .forEach((x) => lines.push(`\t${(x.type + ':').padEnd(12)}${x.file}`))
  }
  if (s.untracked.length) {
    lines.push('', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)')
    s.untracked
      .slice()
      .sort()
      .forEach((f) => lines.push(`\t${f}`))
  }
  // Реальный git (проверено на git 2.53.0, дважды, 20.09.2026) вставляет пустую строку перед
  // финальной строкой статуса ровно тогда, когда ей предшествует хотя бы один блок ("No commits
  // yet" / "Changes to be committed" / "Changes not staged" / "Untracked files"). Единственное
  // исключение — полностью чистый репозиторий с историей (ничего не застейджено, не изменено,
  // не появилось неотслеживаемого): там "On branch X" и "nothing to commit, working tree clean"
  // идут двумя соседними строками без пустой строки между ними, поэтому `lines.push('')` здесь
  // условный, а не безусловный перед любым из четырёх хвостов (ниже пустая строка не нужна,
  // потому что до неё уже не push'нут ни один блок с "No commits yet"/"Changes .../"Untracked").
  if (!s.staged.length) {
    if (s.notStaged.length) lines.push('', 'no changes added to commit (use "git add" and/or "git commit -a")')
    else if (s.untracked.length) lines.push('', 'nothing added to commit but untracked files present (use "git add" to track)')
    else if (!s.hasCommits) lines.push('', 'nothing to commit (create/copy files and use "git add" to track)')
    else lines.push('nothing to commit, working tree clean')
  }
  return lines.join('\n').replace(/\n+$/, '')
}

/** `git status -s`/`--short` — см. spec 2.4 (S1-38). Буквальный формат git, не переводится. */
export function formatStatusShort(state: SectionState): string {
  const s = getStatus(state)
  const code: Record<FileStatusEntry['type'], string> = { 'new file': 'A', modified: 'M', deleted: 'D' }
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

/**
 * `git init` — см. spec 2.3 (S1-10, S1-15). Повторный init — успех и в разделе 1, и (per
 * target.md п.1) во всех разделах.
 *
 * target.md, часть III, правило 2: реальный git на новом репозитории без `init.defaultBranch`
 * в конфиге допечатывает "hint: Using 'master' as the name for the initial branch…" — раздел 1
 * его не воспроизводит (git config тут вообще не моделируется, см. scope.ts — «config» вне
 * области), поэтому это честно опущено целиком, а не имитировано наполовину.
 */
export function initRepo(state: SectionState): { state: SectionState; ok: true; output: string; reinitialized: boolean } {
  if (state.initialized) {
    return { state, ok: true, output: `Reinitialized existing Git repository in ${REPO_NAME}/.git/`, reinitialized: true }
  }
  const next: SectionState = { ...state, initialized: true, branch: DEFAULT_BRANCH }
  return { state: next, ok: true, output: `Initialized empty Git repository in ${REPO_NAME}/.git/`, reinitialized: false }
}

/** `git add <файл>` для одного пути (не `.`/`*`/`-A`) — см. spec 2.5. Вызывающая сторона уже проверила, что файл существует. */
export function addSingleFile(state: SectionState, file: string): SectionState {
  const nextIndex: FileTree = { ...state.index }
  if (has(state.working, file)) nextIndex[file] = state.working[file]
  else delete nextIndex[file]
  return { ...state, index: nextIndex }
}

/**
 * `git add .` / `-A` / `--all` — индекс приводится к текущему состоянию рабочего дерева,
 * удалённые файлы снимаются с учёта. `*` сюда не входит (target.md, A4): это раскрывает
 * шелл ДО вызова git — см. shell.ts и commands.ts, handleAdd — поэтому у git своей
 * обработки для "*" нет вообще.
 */
export function addAllFiles(state: SectionState): SectionState {
  const head = headTree(state)
  const files = new Set<string>([...Object.keys(state.working), ...Object.keys(state.index), ...Object.keys(head)])
  const nextIndex: FileTree = { ...state.index }
  files.forEach((f) => {
    if (has(state.working, f)) nextIndex[f] = state.working[f]
    else delete nextIndex[f]
  })
  return { ...state, index: nextIndex }
}

/**
 * Что фактически сделал `git add` с индексом — нужно, чтобы выбрать правильное пояснение 💡
 * (target.md, A2): для удалённого файла копировать нечего, а `git add` разом может и скопировать
 * содержимое одних файлов, и зафиксировать удаление других (например `git add .` после того, как
 * один файл поправили, а другой стёрли).
 * - 'content'  — только копирование содержимого в индекс (новые/изменённые файлы).
 * - 'removal'  — только фиксация удаления (файла нет в рабочем дереве, запись уходит из индекса).
 * - 'mixed'    — и то, и другое одновременно.
 */
export type AddOutcomeKind = 'content' | 'removal' | 'mixed'

/** Сравнивает индекс до и после `git add`, чтобы определить, что именно произошло (см. AddOutcomeKind). */
export function describeAddOutcome(prevIndex: FileTree, nextIndex: FileTree): AddOutcomeKind {
  let copiedContent = false
  let recordedRemoval = false
  const keys = new Set<string>([...Object.keys(prevIndex), ...Object.keys(nextIndex)])
  keys.forEach((f) => {
    const inPrev = has(prevIndex, f)
    const inNext = has(nextIndex, f)
    if (inNext && (!inPrev || prevIndex[f] !== nextIndex[f])) copiedContent = true
    if (inPrev && !inNext) recordedRemoval = true
  })
  if (copiedContent && recordedRemoval) return 'mixed'
  return recordedRemoval ? 'removal' : 'content'
}

/**
 * Сколько файлов реально получили в индексе новое (скопированное) содержимое между prevIndex
 * и nextIndex — нужно только для склонения текста пояснения (ru.explain.addContent
 * согласуется по числу с количеством файлов, а не остаётся фразой в единственном числе для
 * `git add .` с несколькими новыми/изменёнными файлами сразу). Считает то же самое подмножество,
 * что и "copiedContent" внутри describeAddOutcome, но по количеству, а не по одному булеву флагу.
 */
export function countCopiedContent(prevIndex: FileTree, nextIndex: FileTree): number {
  let n = 0
  const keys = new Set<string>([...Object.keys(prevIndex), ...Object.keys(nextIndex)])
  keys.forEach((f) => {
    const inPrev = has(prevIndex, f)
    const inNext = has(nextIndex, f)
    if (inNext && (!inPrev || prevIndex[f] !== nextIndex[f])) n++
  })
  return n
}

// ---------- pathspec-глоббинг (target.md, часть III, правило 1) ----------
//
// Настоящий git САМ раскрывает "*", "?", "[...]" (и "\x" как литеральный "x") в pathspec —
// это не работа шелла (git-add(1) прямо документирует это на примере
// `git add Documentation/\*.txt`). Такую строку, дошедшую до git буквально (например в
// кавычках — `git add "*.html"`), движок сопоставляет как glob, а не дословно с именами
// файлов — иначе это была бы придуманная ошибка "не найдено" там, где git на самом деле
// умеет найти файлы. Сверено напрямую (git 2.53.0, 20.09.2026): `git add "*.html"` матчит и
// точки-файлы (в отличие от "*" в самом шелле — see shell.ts, visibleFiles — у git своего
// исключения точечных файлов нет), `git add "\*.txt"` матчит файл, буквально названный
// "*.txt", `git add "?.txt"` матчит односимвольные имена, `git add "[ab].txt"` — класс
// символов, незакрытая "[" матчится буквально (проверено: `git add "[x.txt"` находит файл
// с таким именем целиком, если он существует).

/** Экранирует символ для обычного (не-glob) JS RegExp. */
function escapeRegExpChar(c: string): string {
  return /[.*+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c
}

/** Ищет закрывающую "]" класса символов, начиная с индекса открывающей "[" (см. pathspecPatternToRegExp). Возвращает -1, если класс не закрыт. */
function findClassEnd(pattern: string, openIdx: number): number {
  let j = openIdx + 1
  if (pattern[j] === '!' || pattern[j] === '^') j++
  if (pattern[j] === ']') j++ // "]" сразу после "[" / "[!" — обычный символ класса, не закрывающая скобка
  while (j < pattern.length && pattern[j] !== ']') j++
  return j < pattern.length ? j : -1
}

/** Переводит внутренность "[...]" (без самих скобок) в тело JS-класса символов "[...]". */
function classBodyToRegExp(inner: string): string {
  let body = inner
  let negate = false
  if (body.startsWith('!') || body.startsWith('^')) {
    negate = true
    body = body.slice(1)
  }
  const escaped = body.replace(/\\/g, '\\\\').replace(/]/g, '\\]')
  return `[${negate ? '^' : ''}${escaped}]`
}

/**
 * Один pathspec-паттерн → RegExp по правилам git-glob: "*" — любая последовательность символов
 * (в т.ч. пустая), "?" — ровно один символ, "[...]"/"[!...]"/"[^...]" — класс символов,
 * "\x" — буквальный "x" (в т.ч. когда x сам по себе метасимвол — "\*" матчит букву "*").
 * Паттерн без единого метасимвола — вырожденный случай того же алгоритма: ведёт себя как
 * точное совпадение имени (это не отдельная ветка, просто "*"/"?"/"[" в нём не встретились).
 *
 * Раздел 1 работает с плоским списком файлов без подкаталогов (types.ts, FileTree) — поэтому
 * поведение git на "/" внутри паттерна (рекурсия в подкаталоги, магия "**") здесь физически
 * не наблюдаемо и не реализовано: сам факт "звёздочка — это глоб git, а не шелла" воспроизведён
 * верно, а многоуровневые пути — вне этой модели данных, не только вне этой функции.
 */
function pathspecPatternToRegExp(pattern: string): RegExp {
  let src = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) {
      src += escapeRegExpChar(pattern[i + 1])
      i++
    } else if (c === '*') {
      src += '.*'
    } else if (c === '?') {
      src += '.'
    } else if (c === '[') {
      const end = findClassEnd(pattern, i)
      if (end === -1) {
        src += escapeRegExpChar('[') // незакрытая "[" — обычный символ (проверено на git 2.53)
      } else {
        src += classBodyToRegExp(pattern.slice(i + 1, end))
        i = end
      }
    } else {
      src += escapeRegExpChar(c)
    }
  }
  return new RegExp(`^${src}$`)
}

/**
 * Раскрывает один pathspec-паттерн в список подходящих имён среди кандидатов (порядок —
 * порядок `candidates`, без сортировки: сортирует, если нужно, вызывающая сторона).
 *
 * Один и тот же алгоритм используется и `git add`, и `git commit <pathspec>` (commands.ts,
 * handleAdd/handleCommit) — настоящий git разбирает pathspec одним и тем же механизмом
 * в обеих командах (проверено на git 2.53.0). Разница между ними — не в алгоритме, а в
 * наборе `candidates`, который передаёт вызывающая сторона: `add` сопоставляет с объединением
 * рабочего дерева и индекса (имеет дело и с новыми файлами), `commit` — с объединением индекса
 * и HEAD (имеет дело только с уже известными git файлами; working tree в кандидаты commit
 * не входит — см. commitPathspec и handleCommit, A12).
 */
export function matchPathspec(pattern: string, candidates: readonly string[]): string[] {
  const re = pathspecPatternToRegExp(pattern)
  return candidates.filter((c) => re.test(c))
}

export interface CommitOutcome {
  state: SectionState
  ok: boolean
  output: string
}

/**
 * Создаёт коммит из ТЕКУЩЕГО индекса состояния (index уже должен быть подготовлен вызывающей
 * стороной — см. handleCommit в commands.ts, где -a/-am сначала считают «будущий» индекс;
 * `friendlyCommit` — имя соответствующей функции в docs/git-trainer/source.html, в этом модуле
 * она называется `handleCommit`). Буквальный вывод git, не переводится.
 */
export function commitFromIndex(state: SectionState, message: string | null): CommitOutcome {
  if (!message) return { state, ok: false, output: 'Aborting commit due to empty commit message.' }
  const parentTree = headTree(state)
  if (sameTree(parentTree, state.index)) {
    return { state, ok: false, output: 'nothing to commit, working tree clean' }
  }
  const parentId = lastCommitId(state)
  const tree: FileTree = { ...state.index }
  const id = commitHash(message, tree, parentId, state.clock)
  const commit: Commit = { id, parentId, message, tree }
  const nextState: SectionState = {
    ...state,
    commits: [...state.commits, commit],
    clock: state.clock + 1,
  }
  const prefix = commit.parentId === null ? ' (root-commit)' : ''
  // Строка коммита показывает только ПЕРВЫЙ абзац сообщения — commands.ts (parseCommitArgs,
  // buildCommitMessage в commitFlags.ts) склеивает несколько "-m" через "\n\n"; настоящий git
  // в этой строке печатает только первую строку сообщения (сверено напрямую, git 2.53.0:
  // `git commit -m a -m b` -> "[master xxx] a"). Абзацы здесь никогда не содержат встроенного
  // "\n" (однострочный терминал песочницы), поэтому первая строка совпадает с первым абзацем.
  const output = `[${state.branch ?? 'HEAD'}${prefix} ${id.slice(0, 7)}] ${message.split('\n')[0]}`
  return { state: nextState, ok: true, output }
}

/**
 * `git commit -m <сообщение> <pathspec>...` — коммитит содержимое РАБОЧЕГО ДЕРЕВА только
 * для перечисленных путей; см. target.md, A8, «самый опасный случай» (например
 * `git commit -m Первый index.html`, где `index.html` — незакавыченный хвост сообщения,
 * случайно совпавший с именем файла, известного git — см. A12/has-в-вызывающей стороне,
 * engine/commands.ts, handleCommit).
 *
 * `paths` сюда приходит уже РАСКРЫТЫМ до конкретных имён файлов — glob-сопоставление
 * (`*`/`?`/`[...]`) pathspec с известными git путями (объединение индекса и HEAD) делает
 * вызывающая сторона через `matchPathspec` до вызова этой функции (commands.ts, handleCommit),
 * этой функции остаётся только применить уже готовый список имён.
 *
 * Проверено на настоящем git 2.43+: прочие файлы попадают в новый
 * коммит ровно в том виде, в каком они были в HEAD, независимо от того, что для них лежит
 * в индексе (несвязанные staged-изменения остаются в индексе, не закоммиченными).
 *
 * target.md, A11: для ПЕРЕЧИСЛЕННЫХ путей git ОБЯЗАН застейджить закоммиченное содержимое
 * (git-commit(1): «The contents of these files are also staged for the next commit on top of
 * what have been staged before» — проверено напрямую: после `git commit -m x <pathspec>`
 * `git status` для этого пути пишет «working tree clean», то есть index == HEAD для него).
 */
export function commitPathspec(state: SectionState, message: string, paths: string[]): CommitOutcome {
  const head = headTree(state)
  const tree: FileTree = { ...head }
  paths.forEach((p) => {
    if (has(state.working, p)) tree[p] = state.working[p]
    else delete tree[p]
  })
  if (sameTree(head, tree)) {
    // Настоящий git в этом крайнем случае (путь указан, но для него нечего коммитить)
    // печатает обычный git status, а не отдельное сообщение — проверено напрямую
    // (git 2.53.0, 20.09.2026): в чистом репозитории `git commit -m "x" f.txt`, где f.txt
    // с последнего коммита не менялся, выводит буквально
    //   On branch main
    //   nothing to commit, working tree clean
    // и завершается кодом 1 — без пустой строки между этими двумя строками. formatStatusFriendly
    // воспроизводит это без пустой строки (см. её финальный блок выше).
    return { state, ok: false, output: formatStatusFriendly(state) }
  }
  const parentId = lastCommitId(state)
  const id = commitHash(message, tree, parentId, state.clock)
  const commit: Commit = { id, parentId, message, tree }
  // A11: индекс для ПЕРЕЧИСЛЕННЫХ путей приводится к тому, что реально попало в коммит —
  // остальной индекс (несвязанные staged-изменения) не трогается.
  const nextIndex: FileTree = { ...state.index }
  paths.forEach((p) => {
    if (has(tree, p)) nextIndex[p] = tree[p]
    else delete nextIndex[p]
  })
  const nextState: SectionState = { ...state, commits: [...state.commits, commit], index: nextIndex, clock: state.clock + 1 }
  const prefix = commit.parentId === null ? ' (root-commit)' : ''
  // Тот же принцип, что и в commitFromIndex выше: строка коммита показывает только первый абзац.
  const output = `[${state.branch ?? 'HEAD'}${prefix} ${id.slice(0, 7)}] ${message.split('\n')[0]}`
  return { state: nextState, ok: true, output }
}
