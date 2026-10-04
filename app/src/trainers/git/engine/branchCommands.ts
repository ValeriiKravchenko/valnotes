// ============================================================
// Раздел 2 git-тренажёра, шаг A: git-сторона разбора командной строки
// (branch/checkout/merge/add/commit). По архитектуре — прямой аналог
// commands.ts раздела 1 (та же граница «шелл/git», см. shell.ts), но для
// новой модели данных (branchTypes.ts/branchRepo.ts) и своего набора
// команд (branchScope.ts). Раздел 1 (commands.ts) этот файл не трогает
// и не импортирует из него ничего, кроме уже экспортированных данных
// scope.ts (переиспользованы через branchScope.ts).
//
// Строки вида "error: …", "fatal: …", "Deleted branch …", "Already up to
// date." — буквальный вывод настоящего git, сверенный запуском git 2.53.0
// во временном каталоге 23.09.2026 — не переводятся и не идут в словарь
// (как и в разделе 1).
//
// То же сознательное упрощение, что и в repo.ts (раздел 1, комментарий над byFileName,
// target.md часть III, правило 2) — после
// успешного commit/fast-forward/merge настоящий git печатает ещё и диффстат (" file | N ±",
// "N file(s) changed, ...", а для merge иногда и "1 file changed, 0 insertions(+), 0
// deletions(-)" даже без реальных изменений строк), которого здесь нет: он требует
// посимвольного/построчного diff содержимого файлов, которого эта модель не считает (только
// само итоговое содержимое). Как и в разделе 1, здесь НЕТ попытки частично сымитировать
// диффстат (например выдумать правдоподобные числа) — правило 2 требует «либо дословно, либо
// явно не разбирать», а не наполовину придуманный вывод. См. места после commit (handleCommit),
// fast-forward и коммита слияния (handleMerge) ниже.
// ============================================================
import type { BranchCommit, BranchingState, CommandResult, FileTree } from './branchTypes'
import {
  applyTreeChange,
  branchCommitHash,
  checkSafety,
  commitTree,
  currentTip,
  formatBranchingStatus,
  headTree,
  indexDiffersFromHead,
  isAncestor,
  mergeBase,
  mergeTrees,
  sameTree,
} from './branchRepo'
import type { SafetyBlock } from './branchRepo'
import { classifySection2Option, gitNotACommand, isGlobalGitOption, isSection2Command, REAL_GIT_COMMANDS } from './branchScope'
import type { ShellToken } from './shell'
import { shellTokenize } from './shell'
import { applyStageAll, buildCommitMessage, classifyCommitFlagToken, type CommitMessagePart } from './commitFlags'
import { has } from './util'
import { ru } from '../locales/ru'

function ok(state: BranchingState, output: string, explanation: string | null = null): { state: BranchingState; result: CommandResult } {
  return { state, result: { ok: true, output, explanation } }
}
function fail(state: BranchingState, output: string, explanation: string | null = null): { state: BranchingState; result: CommandResult } {
  return { state, result: { ok: false, output, explanation } }
}

const be = ru.branching.errors

// ---------- git branch ----------

/**
 * Проверка имени ветки при СОЗДАНИИ (`git branch <имя>`, `git checkout -b <имя>`) — не полный
 * набор правил check-ref-format(1), а только случаи, чей дословный текст сверен напрямую
 * (git 2.53.0, временный каталог, и для `git branch <имя>`, и для `git checkout -b <имя>`):
 * пустая строка, пробел где-либо в имени, ".." где-либо в имени, точное совпадение с "HEAD"
 * (только этот регистр буквально — "head"/"HeAd"/голый "@" настоящий git пропускает без
 * вопросов), имя, начинающееся с "-" (включая голое "-" целиком — см. handleBranch, где этот
 * случай доходит сюда, а не перехватывается как флаг), "~"/"^"/"?"/"["/"\" где-либо, ":"
 * где-либо, "//" где-либо (двойной слэш — не любой одиночный "/": имена вроде "feature/x"
 * остаются валидны, сверено отдельно), "@{" где-либо, сегмент пути (между "/"), начинающийся с
 * "." или заканчивающийся на ".lock" — это включает и весь путь целиком (сегмент без "/" вокруг),
 * "/" на конце, "/" в начале. Остальные правила check-ref-format (управляющие символы и т.д.) —
 * отдельная большая тема, здесь не воспроизводится (см. правило области, branchScope.ts) —
 * специально не добавлены сверх того, что проверено прогоном.
 *
 * "*" — отдельно добавленный случай (сверено напрямую, git 2.53.0, 24.09.2026: `git branch
 * 'a*b'` → тот же формат ref-format отказа, что и для остальных перечисленных символов); сам "*"
 * непроверенным символом дальше эту функцию обычно не достигает — голое "*" отдельным словом
 * раскрывает шелл (shell.ts, A4), а "*" внутри слова с текстом вокруг помечается
 * unsupportedGlob и отсекается ДО git-стороны разбора (executeBranchingCommand) — сюда "*"
 * попадает только закавыченным (`git branch 'a*b'`), когда шелл его не трогает.
 */
function isInvalidBranchName(name: string): boolean {
  return (
    name === '' ||
    name.includes(' ') ||
    name.includes('..') ||
    name === 'HEAD' ||
    name.startsWith('-') ||
    name.includes('~') ||
    name.includes('^') ||
    name.includes('?') ||
    name.includes('*') ||
    name.includes('[') ||
    name.includes('\\') ||
    name.includes(':') ||
    name.includes('//') ||
    name.includes('@{') ||
    name.includes('.lock/') ||
    name.endsWith('.lock') ||
    name.endsWith('/') ||
    name.startsWith('/') ||
    name.endsWith('.') ||
    name.startsWith('.') ||
    name.includes('/.')
  )
}

/**
 * target.md-подобное правило хранения ссылок git (refs/heads/* — файлы внутри дерева каталогов
 * по "/"): ветка "X" (файл) и ветка "X/Y" (требует, чтобы "X" было каталогом) не могут
 * существовать одновременно — какую бы из них ни создавали второй, git отказывает с "cannot
 * lock ref". Проверяется в обе стороны: создаваемое имя может упереться и в уже существующий
 * КОРОЧЕ (какой-то из его "/"-префиксов уже существует как обычная ветка), и в уже существующий
 * ДЛИННЕЕ (существующая ветка начинается с "<имя>/"). Возвращает имя ветки, из-за которой создание
 * `name` было бы заблокировано, или null, если конфликта нет. Сверено напрямую (git 2.53.0,
 * 24.09.2026, обе стороны, и для `git branch <имя>`, и для `git checkout -b <имя>`).
 *
 * Когда конфликтующих веток НЕСКОЛЬКО (сторона "ДЛИННЕЕ" — под "<имя>/" может существовать сразу
 * несколько), git называет виновником ту, что ПЕРВАЯ ПО АЛФАВИТУ (сравнение байт в байт всей
 * строки имени целиком, не по глубине вложенности и не по порядку создания) — сверено напрямую,
 * git 2.53.0, 25.09.2026, несколькими прогонами: разный порядок создания (в т.ч. обратный) даёт
 * один и тот же результат; более глубоко вложенное имя может оказаться "раньше" менее вложенного,
 * если оно раньше по алфавиту всей строкой ("feature/b/x" называется раньше "feature/c", хотя
 * вложено глубже); сравнение именно байтовое, не «человеческое» — цифра меньше заглавной буквы,
 * заглавная меньше строчной ("feature/1-first" раньше "feature/B" раньше "feature/Zebra"/
 * "feature/apple"). Сторона "КОРОЧЕ" второго кандидата иметь не может: раз `name` создаётся,
 * среди его "/"-префиксов уже существующим может быть только один — два префикса одного имени не
 * могут оба существовать как обычные ветки одновременно (ветка-файл и ветка-каталог по тому же
 * пути несовместимы), поэтому там сортировка не нужна.
 */
function conflictingRefPath(state: BranchingState, name: string): string | null {
  const existing = Object.keys(state.branches)
  const longerConflicts = existing.filter((b) => b.startsWith(name + '/')).sort()
  if (longerConflicts.length) return longerConflicts[0]
  const segments = name.split('/')
  for (let i = 1; i < segments.length; i++) {
    const prefix = segments.slice(0, i).join('/')
    if (has(state.branches, prefix)) return prefix
  }
  return null
}

/** Буквальный текст git 2.53.0 для конфликта путей ссылок (conflictingRefPath) — сверено напрямую. */
function refLockError(name: string, conflictingRef: string): string {
  return `fatal: cannot lock ref 'refs/heads/${name}': 'refs/heads/${conflictingRef}' exists; cannot create 'refs/heads/${name}'`
}

/** Буквальный вывод git 2.53.0 для всех четырёх случаев isInvalidBranchName — сверено напрямую. */
function refFormatInvalidError(name: string): string {
  return `fatal: '${name}' is not a valid branch name\nhint: See 'git help check-ref-format'\nhint: Disable this message with "git config set advice.refSyntax false"`
}

function formatBranchList(state: BranchingState): string {
  return Object.keys(state.branches)
    .sort()
    .map((n) => (n === state.head ? `* ${n}` : `  ${n}`))
    .join('\n')
}

/**
 * target.md, часть IV, «опасное место 4»: -d отказывается удалять неслитую
 * ветку (подсказывает -D), текущую ветку не удаляет никто из них.
 * "Merged" считается относительно ТЕКУЩЕГО HEAD (не какой-то заранее заданной
 * ветки вроде master) — сверено напрямую: `git branch -d` отказывает даже
 * для ветки, слитой в master, если сейчас стоишь на третьей ветке без этого
 * слияния (git 2.53.0, 23.09.2026).
 */
function handleBranchDelete(state: BranchingState, name: string, forced: boolean): { state: BranchingState; result: CommandResult } {
  const id = state.branches[name]
  if (id === undefined) return fail(state, `error: branch '${name}' not found`, null)
  if (name === state.head) {
    // Настоящий git называет здесь абсолютный путь worktree на диске
    // ("used by worktree at '/абсолютный/путь'") — у песочницы нет
    // настоящей файловой системы, путь заменён плейсхолдером: это
    // единственная переменная часть сообщения, которую нельзя
    // воспроизвести дословно без выдумывания. Сама строка (output) —
    // буквальный английский текст git и не переводится (CLAUDE.md), но «/site» в ней —
    // выдумка тренажёра, а не то, что напечатал бы настоящий git, — это должно быть видно
    // игроку (target.md, часть III, правило 2), поэтому рядом идёт explanation из словаря
    // (тот же приём, что и explanation у других отказов: output — как у git, explanation —
    // то, что придумал тренажёр, TRAINER_MARKER ему не нужен, см. шапку ru.ts).
    return fail(state, `error: cannot delete branch '${name}' used by worktree at '/site'`, ru.branching.explain.worktreePathIsPlaceholder)
  }
  if (!forced && !isAncestor(state, id, currentTip(state))) {
    return fail(
      state,
      `error: the branch '${name}' is not fully merged\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'\nhint: Disable this message with "git config set advice.forceDeleteBranch false"`,
      null,
    )
  }
  const nextBranches = { ...state.branches }
  delete nextBranches[name]
  const nextOrder = state.branchOrder.filter((n) => n !== name)
  return ok({ ...state, branches: nextBranches, branchOrder: nextOrder }, `Deleted branch ${name} (was ${id.slice(0, 7)}).`, null)
}

/**
 * `args`, о которых точно известно, что они не должны разбираться как флаги — ни один токен
 * здесь не проверяется на "начинается с -": так ведёт себя настоящий git и для формы БЕЗ "--"
 * (позиция уже прошла мимо ветки `first.startsWith('-')` в handleBranch), и для всего, что идёт
 * ПОСЛЕ "--" ("--" отключает разбор опций до конца строки, сверено напрямую: `git
 * branch -- -d` создаёт ветку с буквальным (невалидным) именем "-d", а не удаляет ветку "d").
 */
function handleBranchPositional(state: BranchingState, args: string[]): { state: BranchingState; result: CommandResult } {
  if (!args.length) return ok(state, formatBranchList(state), null)
  if (args.length > 1) {
    // Лишний аргумент после имени — настоящая возможность git (обычно начальная точка, `git
    // branch <имя> <начальная точка>`), но ей может оказаться и флаг, оказавшийся не в начале
    // строки (см. комментарий над handleBranch — известное упрощение, шаг A флаги ищет только
    // до первого позиционного аргумента). Формулировка отказа поэтому нейтральная — не называет
    // второй аргумент именно «начальной точкой», когда мы не знаем, чем он был на самом деле.
    return fail(state, be.optionOutOfScope('git branch <имя> <доп. аргументы>', 'git branch <имя> — создаёт ветку от текущего коммита'), null)
  }
  const name = args[0]
  if (isInvalidBranchName(name)) return fail(state, refFormatInvalidError(name), null)
  if (has(state.branches, name)) return fail(state, `fatal: a branch named '${name}' already exists`, null)
  const refConflict = conflictingRefPath(state, name)
  if (refConflict) return fail(state, refLockError(name, refConflict), null)
  const nextBranches = { ...state.branches, [name]: currentTip(state) }
  return ok({ ...state, branches: nextBranches, branchOrder: [...state.branchOrder, name] }, '', null)
}

/**
 * Настоящий git переставляет местами опции и позиционные аргументы: он ищет флаги по ВСЕЙ
 * командной строке, а не только в её начале, поэтому `git branch x -d` удаляет ветку "x" (флаг
 * "-d" пришёл ПОСЛЕ имени), а `git branch -d --bogus`/`git branch -d -x w` всё равно замечают
 * неизвестную опцию ПОСЛЕ уже опознанного "-d" (сверено напрямую, git 2.53.0, 24.09.2026:
 * `` error: unknown option `bogus' ``/`` error: unknown switch `x' ``, ровно как если бы её
 * ввели первой). Шаг A этого не делает — он разбирает опции только ДО первого позиционного
 * аргумента: `args[0]` решает, флаг это или уже имя/путь, а всё, что идёт после позиционного
 * аргумента, классификации не проходит вовсе (см. `args.length > 1` ниже и в остальных
 * обработчиках команд — checkout/merge/add/commit устроены так же). Значит такие формы (опция
 * после имени, лишняя опция после уже распознанного флага) шаг A разбирает НЕВЕРНО — это
 * названное упрощение, а не незамеченный случай.
 */
function handleBranch(state: BranchingState, args: string[]): { state: BranchingState; result: CommandResult } {
  // "--" первым аргументом — разделитель git, сам по себе ничего не значит, а всё
  // после него — уже не флаги (см. handleBranchPositional выше). Сверено напрямую: `git branch
  // --` без имени ведёт себя как голый `git branch` (список), `git branch -- <имя>` — как
  // `git branch <имя>`.
  if (args[0] === '--') return handleBranchPositional(state, args.slice(1))
  if (!args.length) return ok(state, formatBranchList(state), null)

  const first = args[0]
  // Голый "-" (без ничего после) — НЕ флаг-кластер: у настоящего git пустой остаток после "-"
  // не запускает разбор опций, "-" доходит до ref-format как обычный кандидат в имя ветки
  // (сверено напрямую, git 2.53.0: `git branch -` → "fatal: '-' is not a valid branch name", а не
  // "unknown switch"). Любое другое слово, начинающееся с "-" (даже "--"-длинное), — флаг.
  if (first.startsWith('-') && first !== '-') {
    // target.md, часть III, правило 1 — три ответа, не два: флаг, которого у настоящего git
    // вообще нет ("git branch -foo" → буквально "unknown switch `o'", см. classifySection2Option),
    // получает буквальную ошибку git, а не выдуманный "реальная возможность, здесь не
    // разбирается" — это верно только для флагов, которые у git ДЕЙСТВИТЕЛЬНО есть.
    const allowed = 'git branch, git branch <имя>, git branch -d/-D <имя>'
    const classified = classifySection2Option('branch', first)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null)
    if (classified.kind === 'ambiguous') return fail(state, be.ambiguousAbbreviationOutOfScope(`git branch ${first}`, allowed), null)
    if (classified.kind === 'help') return fail(state, be.helpOutOfScope(`git branch ${first}`, allowed), null)
    // Классификатор уже разрешил возможное сокращение до канонического имени (target.md, «При
    // сомнении…» — однозначное сокращение обязано вести себя как полная опция): "-d"/"--delete"
    // (в т.ч. пришедшие как "--del") реализованы буквально, дальше — обычный честный отказ.
    const resolved = classified.resolved
    if (resolved === '-d' || resolved === '--delete' || resolved === '-D') {
      const forced = resolved === '-D'
      const rawNames = args.slice(1)
      // Одиночный "--" сразу после "-d"/"-D" — обычный разделитель, а не имя ветки (сверено
      // напрямую, git 2.53.0: `git branch -d -- feat` удаляет ОДНУ ветку "feat", а не отказывает
      // как на «несколько веток» — "--" никак не влияет на разбор после уже опознанного "-d").
      const dashDash = rawNames[0] === '--'
      const names = dashDash ? rawNames.slice(1) : rawNames
      if (!names.length) return fail(state, 'fatal: branch name required', null)
      if (!dashDash) {
        // Настоящий git разбирает опции по ВСЕЙ командной строке (см. комментарий над
        // handleBranch выше про его собственное упрощение — здесь опции ищутся только ДО первого
        // позиционного аргумента), поэтому "-f"/"--force" ПОСЛЕ уже опознанного "-d"/"-D" — это
        // ещё одна опция (у настоящего git она форсирует удаление так же, как "-D": `git branch -d
        // -f feature` реально удаляет неслитую ветку, сверено напрямую, git 2.53.0), а не вторая
        // ветка на удаление. Тот же класс ошибки, что чинили у `git merge feature --no-ff`
        // (handleMerge, extraFlag выше) — переиспользуем то же правило области и те же строки
        // словаря, вместо того чтобы молча звать эту опцию именем ветки.
        const extraFlag = names.find((a) => a.startsWith('-') && a !== '-' && a !== '--')
        if (extraFlag !== undefined) {
          const deleteAllowed = 'git branch -d/-D <одна ветка>'
          const classifiedFlag = classifySection2Option('branch', extraFlag)
          if (classifiedFlag.kind === 'unknown' || classifiedFlag.kind === 'noValue') return fail(state, classifiedFlag.output, null)
          if (classifiedFlag.kind === 'ambiguous') return fail(state, be.ambiguousAbbreviationOutOfScope(`git branch ${extraFlag}`, deleteAllowed), null)
          if (classifiedFlag.kind === 'help') return fail(state, be.helpOutOfScope(`git branch ${extraFlag}`, deleteAllowed), null)
          return fail(state, be.optionOutOfScope(`git branch ${classifiedFlag.resolved}`, deleteAllowed), null)
        }
      }
      if (names.length > 1) {
        return fail(state, be.optionOutOfScope('git branch -d/-D <несколько веток за раз>', 'git branch -d/-D <одна ветка>'), null)
      }
      return handleBranchDelete(state, names[0], forced)
    }
    return fail(state, be.optionOutOfScope(`git branch ${resolved}`, allowed), null)
  }
  return handleBranchPositional(state, args)
}

// ---------- git checkout ----------

/**
 * Оба вида блокировки (modified и untracked) печатаются ОДНИМ отказом, если сработали
 * одновременно — не как две отдельные команды с двумя "Aborting", а один блок "modified" (если
 * есть), за ним один блок "untracked" (если есть), и только ОДИН общий "Aborting" в конце (для
 * fast-forward merge — после строки "Updating …" в начале; для настоящего merge — перед
 * "Merge with strategy ort failed." в конце). Сверено напрямую (git 2.53.0, временный каталог,
 * порядок потоков — принудительной построчной буферизацией `stdbuf -oL -eL … 2>&1 | cat`) для
 * всех трёх операций: checkout, fast-forward merge и настоящее (не FF) слияние.
 */
function formatOverwriteError(block: SafetyBlock, verb: 'checkout' | 'merge', suffix = ''): string {
  const action = verb === 'checkout' ? 'switch branches' : 'merge'
  const parts: string[] = []
  if (block.modified.length) {
    const list = block.modified.map((f) => `\t${f}`).join('\n')
    parts.push(`error: Your local changes to the following files would be overwritten by ${verb}:\n${list}\nPlease commit your changes or stash them before you ${action}.`)
  }
  if (block.untracked.length) {
    const list = block.untracked.map((f) => `\t${f}`).join('\n')
    parts.push(`error: The following untracked working tree files would be overwritten by ${verb}:\n${list}\nPlease move or remove them before you ${action}.`)
  }
  return `${parts.join('\n')}\nAborting${suffix}`
}

/**
 * `git checkout <pathspec>` (форма "git checkout -- <файл>" без явного "--") — восстанавливает
 * файл(ы) в рабочем дереве из индекса, ветку/HEAD не трогает вовсе (сверено напрямую, git
 * 2.53.0): "Updated N path(s) from the index" — N считает только пути, у которых рабочее дерево
 * ДЕЙСТВИТЕЛЬНО отличалось от индекса (не размер pathspec-матча).
 *
 * `names` всегда приходит как подмножество ключей `state.index` (см. вызывающий код в
 * handleCheckout) — идекс для каждого из этих путей определён всегда, поэтому здесь нет случая
 * «путь есть в рабочем дереве, но отсутствует в индексе».
 */
function restorePathsFromIndex(state: BranchingState, names: string[]): { working: FileTree; updated: number } {
  const nextWorking: FileTree = { ...state.working }
  let updated = 0
  names.forEach((f) => {
    const idxVal = state.index[f]
    const curVal = has(state.working, f) ? state.working[f] : undefined
    if (idxVal !== curVal) updated++
    nextWorking[f] = idxVal
  })
  return { working: nextWorking, updated }
}

/**
 * target.md, часть IV, «опасное место 1»: git переносит незакоммиченные
 * правки на другую ветку, если это не затирает работу; отказывает только
 * когда файл различается между текущим и целевым коммитом и правка была бы
 * потеряна. Это верно буквально для
 * НЕЗАСТЕЙДЖЕННОЙ правки (git сравнивает рабочее дерево с индексом, не с
 * целью, — совпадение с целью не спасает). Для ЗАСТЕЙДЖЕННОЙ правки это
 * неточно: если индекс уже совпадает с целевым содержимым, git отказа не
 * делает, даже когда HEAD и цель различаются, — см. подробный разбор в
 * checkSafety (branchRepo.ts).
 */
/**
 * HEAD и выражения ревизий (gitrevisions(7)) — по форме, а не по тому, разрешились бы они у
 * настоящего git в данном состоянии или нет (полный rev-parse эта модель не реализует, target.md,
 * часть IV, «Что НЕ входит»). "~"/"^"/"@{" уже входят в isInvalidBranchName (ни одна настоящая
 * ветка их не может содержать — https://git-scm.com/docs/git-check-ref-format), поэтому имя,
 * содержащее их, ВСЕГДА или невалидная ветка, или выражение ревизии — никогда существующую ветку,
 * которую можно было бы честно найти обычным поиском. ПУТИ (в отличие от имён веток) "~"/"^"
 * содержать МОГУТ — это не то же самое допущение: настоящий git реально восстанавливает файл с
 * таким именем, если он ему известен (сверено напрямую, git 2.53.0, 25.09.2026: `git checkout
 * 'notes~'`, без явного "--", при существовании отслеживаемого файла "notes~" печатает "Updated 1
 * path from the index" — путь, а не ошибку про ревизию). Здесь это упрощение осознанно: шаг A не
 * даёт игроку способа завести файл с именем, где встречаются эти символы (working tree шага A
 * заполняется только содержимым миссии — rootFiles в createBranchingSection, branchSection.ts, —
 * там нет пользовательского создания файлов, в отличие от раздела 1, fileOps.ts), поэтому имя с
 * "~"/"^"/"@{" в этом шаге ВСЕГДА можно честно трактовать как выражение ревизии, не проверяя,
 * не мог ли это быть путь. Голые "HEAD" и "@" — отдельно, это ЕДИНСТВЕННЫЕ два слова, которые git
 * всегда разрешает как ревизию раньше, чем как имя ветки/пути (сверено напрямую, git 2.53.0,
 * 24.09.2026: ветка, буквально названная "@", создаётся `git branch` без вопросов, но `git
 * checkout @`/`git merge @` её игнорируют и остаются на HEAD, даже когда такая ветка существует —
 * "HEAD" веткой стать не может вовсе, см. isInvalidBranchName).
 */
function looksLikeRevisionExpression(name: string): boolean {
  return name === 'HEAD' || name === '@' || name.includes('~') || name.includes('^') || name.includes('@{')
}

/**
 * `git checkout -b <имя>` (и глюетая форма "-b<имя>", см. вызов ниже) — без явной начальной точки,
 * всегда от текущего HEAD. `extras` — всё, что идёт в командной строке ПОСЛЕ имени (для двух форм
 * это разные позиции в исходном массиве args, см. вызывающий код); `glued` — какая из двух форм.
 */
function createAndSwitchBranch(state: BranchingState, name: string, extras: string[], glued: boolean): { state: BranchingState; result: CommandResult } {
  // В отличие от `git branch <имя>`, "-b" забирает значение БЕЗУСЛОВНО — даже начинающееся с
  // "-" — оно не разбирается как отдельный флаг (сверено напрямую git 2.53.0: `git checkout -b
  // -foo` даёт ref-format ошибку, а не "unknown switch").
  if (isInvalidBranchName(name)) return fail(state, refFormatInvalidError(name), null)
  // Одиночный "--" без ничего после — тоже не начальная точка (сверено напрямую, git 2.53.0,
  // 24.09.2026: `git checkout -b x --` и глюетая `git checkout -bx --` создают ветку от текущего
  // HEAD, как и без "--" вовсе; единственная разница — репорт по перенесённым файлам не
  // подавляется, см. ниже). Любой ДРУГОЙ лишний аргумент — уже настоящая начальная точка/pathspec,
  // которую шаг A не разбирает.
  const bareDashDash = extras.length === 1 && extras[0] === '--'
  if (extras.length > 0 && !bareDashDash) {
    return fail(state, be.optionOutOfScope('git checkout -b <имя> <доп. аргументы>', 'git checkout -b <имя> — от текущего коммита'), null)
  }
  if (has(state.branches, name)) return fail(state, `fatal: a branch named '${name}' already exists`, null)
  const refConflict = conflictingRefPath(state, name)
  if (refConflict) return fail(state, refLockError(name, refConflict), null)
  const tip = currentTip(state)
  const nextState: BranchingState = { ...state, branches: { ...state.branches, [name]: tip }, branchOrder: [...state.branchOrder, name], head: name }
  const header = `Switched to a new branch '${name}'`
  // Только буквальная двухсловная форма "-b <имя>" БЕЗ единого лишнего аргумента (cmd_checkout:
  // `argc == 3 && !strcmp(argv[1], "-b")`) включает only_merge_on_switching_branches, из-за чего
  // merge_working_tree() (а с ним и show_local_changes(), отчёт "M\t<файл>"/"A\t<файл>") вообще не
  // вызывается. Глюетая форма "-bимя" — другое число argv (один токен, не два) — под этот буквальный
  // чек не попадает, и голый "--" после имени (bareDashDash) — тоже: обе формы отчёт печатают как
  // обычно. Сверено и прогоном, и по исходнику (git 2.53.0, checkout.c, 24.09.2026): на грязном
  // дереве `git checkout -b feat` печатает ТОЛЬКО заголовок, а `git checkout -bfeat`/`git checkout -b
  // feat --` — сначала "M\t<файл>"/"A\t<файл>" (порядок — как у обычного checkout, см. checkoutByName
  // ниже), потом заголовок.
  if (!glued && extras.length === 0) return ok(nextState, header, null)
  const { index, working, carried } = applyTreeChange(state, commitTree(state, tip))
  const output = [...carried.map((c) => `${c.type}\t${c.file}`), header].join('\n')
  return ok({ ...nextState, index, working }, output, null)
}

/**
 * `name`, о котором известно, что это не флаг: имя ветки/коммита, выражение ревизии или pathspec
 * (см. handleCheckout). `pathOnly` — был ли перед `name` явный "--": тогда git ищет ТОЛЬКО путь
 * (сопоставление с индексом), даже когда `name` совпадает с именем существующей ветки или хэшем
 * коммита — ветка/коммит/ревизия в этом случае не разбираются вовсе (сверено напрямую, git 2.53.0,
 * 24.09.2026: `git branch feature; git checkout -- feature` → "error: pathspec 'feature' did not
 * match any file(s) known to git", а не переключение на ветку; то же для хэша коммита).
 */
function checkoutByName(state: BranchingState, name: string, pathOnly: boolean): { state: BranchingState; result: CommandResult } {
  if (!pathOnly && looksLikeRevisionExpression(name)) {
    return fail(state, be.revisionExpressionOutOfScope(`git checkout ${name}`), null)
  }

  if (!pathOnly && has(state.branches, name)) {
    const targetTip = state.branches[name]
    const targetTree = commitTree(state, targetTip)
    const block = checkSafety(state, targetTree)
    if (block.modified.length || block.untracked.length) return fail(state, formatOverwriteError(block, 'checkout'), null)

    const wasCurrent = name === state.head
    const { index, working, carried } = applyTreeChange(state, targetTree)
    const nextState: BranchingState = { ...state, head: name, index, working }
    const header = wasCurrent ? `Already on '${name}'` : `Switched to branch '${name}'`
    // У настоящего git отчёт по перенесённым файлам ("M\t<файл>", stdout, show_local_changes()
    // внутри merge_working_tree()) печатается РАНЬШЕ заголовка ("Switched to branch"/"Already on",
    // stderr, update_refs_for_switch() — вызывается уже после merge_working_tree(), см.
    // builtin/checkout.c). Сверено принудительным построчным буферингом обоих потоков (git 2.53.0,
    // `stdbuf -oL -eL git checkout … 2>&1 | cat`) — без принудительной построчной буферизации
    // порядок в объединённом выводе может казаться обратным, потому что stdout при отсутствии tty
    // буферизуется блоками, а stderr — нет; это артефакт буферизации, а не реальный порядок записи.
    const output = [...carried.map((c) => `${c.type}\t${c.file}`), header].join('\n')
    return ok(nextState, output, null)
  }

  if (!pathOnly && has(state.commits, name)) {
    // target.md, часть IV, «Что НЕ входит»: checkout по хэшу коммита (detached HEAD) — вне шага A.
    return fail(state, be.detachedCheckoutOutOfScope, null)
  }

  // "git checkout -- <pathspec>" сопоставляет путь с записями ИНДЕКСА, а не HEAD: файл, чьё
  // удаление уже застейджено (git rm --cached — путь остался в HEAD, но выведен из индекса),
  // pathspec НЕ находит (сверено напрямую, git 2.53.0): после `git rm --cached f.txt`
  // `git checkout -- f.txt` отвечает "error: pathspec 'f.txt' did not match any file(s) known to
  // git" — ровно тот же текст, что и для полностью неизвестного пути; наоборот, путь, который
  // есть в индексе, но ещё не в HEAD (свежий `git add` до первого коммита этого файла), успешно
  // восстанавливается — тоже сверено напрямую.
  const knownPaths = new Set<string>(Object.keys(state.index))
  const targets = name === '.' ? [...knownPaths].sort() : knownPaths.has(name) ? [name] : null
  if (targets) {
    const { working, updated } = restorePathsFromIndex(state, targets)
    const nextState: BranchingState = { ...state, working }
    // Явный "--" отключает печать "Updated N path(s) from the index" целиком (у настоящего git —
    // count_checkout_paths, включается только БЕЗ явного "--"), без "--" эта строка печатается
    // всегда, даже когда N==0 путей реально отличалось на диске (сверено напрямую, git 2.53.0,
    // 24.09.2026, оба случая: с "--" — вообще ничего, rc=0; без "--" — "Updated 0 paths…").
    if (pathOnly) return ok(nextState, '', null)
    return ok(nextState, `Updated ${updated} path${updated === 1 ? '' : 's'} from the index`, null)
  }
  return fail(state, `error: pathspec '${name}' did not match any file(s) known to git`, null)
}

function handleCheckout(state: BranchingState, args: string[]): { state: BranchingState; result: CommandResult } {
  // "--" первым аргументом отключает разбор опций для всего, что после него —
  // включая "-b" (сверено напрямую: `git checkout -- -b` ищет ФАЙЛ с именем "-b", а не создаёт
  // ветку). Голый "git checkout --" без имени ведёт себя как голый "git checkout" — тоже вне
  // области этого шага (см. ниже).
  if (args[0] === '--') {
    const rest = args.slice(1)
    if (!rest.length) {
      return fail(state, be.optionOutOfScope('git checkout (без аргументов)', 'git checkout <ветка>, git checkout -b <имя>'), null)
    }
    if (rest.length > 1) {
      return fail(state, be.optionOutOfScope('git checkout <ветка> <доп. аргументы>', 'git checkout <ветка>, git checkout -b <имя>'), null)
    }
    return checkoutByName(state, rest[0], true)
  }

  if (!args.length) {
    return fail(state, be.optionOutOfScope('git checkout (без аргументов)', 'git checkout <ветка>, git checkout -b <имя>'), null)
  }

  if (args[0] === '-b') {
    const name = args[1]
    // "error: switch `b' requires a value" — весь буквальный вывод git 2.53.0 для этого случая
    // (сверено напрямую): в отличие от голого "git" без подкоманды
    // (be.gitUsageNoArgs — там реально печатается длинный usage-блок), здесь parse-options
    // НИКАКОГО usage-блока не печатает вообще — это не обрезка, а полное совпадение с git.
    if (name === undefined) return fail(state, "error: switch `b' requires a value", null)
    return createAndSwitchBranch(state, name, args.slice(2), false)
  }

  // Глюетая форма "-b<имя>" (значение приклеено к короткому флагу, например
  // "-bfeature") — "-b" уже реализован буквально в двухсловной форме выше, глюетая форма
  // сводится к тому же самому (сверено напрямую git 2.53.0: `git checkout -bfeature` →
  // "Switched to a new branch 'feature'", то же самое, что и `git checkout -b feature`).
  // "-B<имя>" (заглавная) сюда намеренно не попадает — "-B" не реализован и в двухсловной форме,
  // остаётся честным отказом через общую классификацию ниже (classifySection2Option).
  if (args[0].startsWith('-b') && args[0] !== '-b' && !args[0].startsWith('--')) {
    const name = args[0].slice(2)
    return createAndSwitchBranch(state, name, args.slice(1), true)
  }

  if (args[0].startsWith('-')) {
    // Та же граница «unknown/real/ambiguous/help», что и у git branch выше (см. classifySection2Option).
    const checkoutAllowed = 'git checkout <ветка>, git checkout -b <имя>'
    const classified = classifySection2Option('checkout', args[0])
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null)
    if (classified.kind === 'ambiguous') return fail(state, be.ambiguousAbbreviationOutOfScope(`git checkout ${args[0]}`, checkoutAllowed), null)
    if (classified.kind === 'help') return fail(state, be.helpOutOfScope(`git checkout ${args[0]}`, checkoutAllowed), null)
    return fail(state, be.optionOutOfScope(`git checkout ${classified.resolved}`, checkoutAllowed), null)
  }
  if (args.length > 1) {
    return fail(state, be.optionOutOfScope('git checkout <ветка> <доп. аргументы>', 'git checkout <ветка>, git checkout -b <имя>'), null)
  }

  return checkoutByName(state, args[0], false)
}

// ---------- git merge ----------

/**
 * target.md, часть IV, «опасное место 2» и «опасное место 3»: перемотка,
 * коммит слияния, «Already up to date.» — три разных исхода одной команды.
 * «опасное место 6»: обнаруженный конфликт (пересекающиеся правки) в шаг A
 * не входит — честный отказ по правилу области, а не имитация разрешения.
 */
function handleMerge(state: BranchingState, args: string[]): { state: BranchingState; result: CommandResult } {
  // "--" первым аргументом отключает разбор опций — дальше всё, включая слова,
  // начинающиеся с "-", это имя ветки, а не флаг (сверено напрямую: `git merge -- -x` отвечает
  // "merge: -x - not something we can merge", буквально то же, что и без "--"). Бросаем
  // "--" и продолжаем с тем же кодом, что и без него, минуя классификацию флага ниже.
  const positional = args[0] === '--' ? args.slice(1) : args
  if (!positional.length) return fail(state, 'fatal: No remote for the current branch.', null)
  if (args[0] !== '--' && positional[0].startsWith('-')) {
    // Та же граница «unknown/real/ambiguous/help», что и у git branch/checkout выше (см. classifySection2Option).
    const mergeAllowed = 'git merge <ветка>'
    const classified = classifySection2Option('merge', positional[0])
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null)
    if (classified.kind === 'ambiguous') return fail(state, be.ambiguousAbbreviationOutOfScope(`git merge ${positional[0]}`, mergeAllowed), null)
    if (classified.kind === 'help') return fail(state, be.helpOutOfScope(`git merge ${positional[0]}`, mergeAllowed), null)
    return fail(state, be.optionOutOfScope(`git merge ${classified.resolved}`, mergeAllowed), null)
  }
  if (positional.length > 1) {
    // Лишний аргумент ПОСЛЕ имени ветки может быть опцией, оказавшейся не в
    // начале строки (`git merge feature --no-ff`), а не второй веткой — как и у остальных команд
    // этого файла (branch/checkout/add/commit), шаг A ищет флаги только до первого позиционного
    // аргумента (см. комментарий над handleBranch), поэтому опцию после имени ветки здесь нужно
    // распознать отдельно, а не молча называть её «второй веткой». После явного "--" (args[0] ===
    // '--') это правило не действует: там всё после "--" уже pathspec-подобные литералы, а не
    // флаги (см. комментарий в начале функции) — буквальный "--" сам по себе тоже не флаг.
    const extraFlag = args[0] !== '--' ? positional.slice(1).find((a) => a.startsWith('-') && a !== '--') : undefined
    if (extraFlag !== undefined) {
      const mergeAllowed = 'git merge <ветка>'
      const classified = classifySection2Option('merge', extraFlag)
      if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null)
      if (classified.kind === 'ambiguous') return fail(state, be.ambiguousAbbreviationOutOfScope(`git merge ${extraFlag}`, mergeAllowed), null)
      if (classified.kind === 'help') return fail(state, be.helpOutOfScope(`git merge ${extraFlag}`, mergeAllowed), null)
      return fail(state, be.optionOutOfScope(`git merge ${classified.resolved}`, mergeAllowed), null)
    }
    return fail(state, be.optionOutOfScope('git merge <несколько веток за раз>', 'git merge <одна ветка>'), null)
  }

  const name = positional[0]
  if (looksLikeRevisionExpression(name)) {
    return fail(state, be.revisionExpressionOutOfScope(`git merge ${name}`), null)
  }
  if (!has(state.branches, name)) {
    if (has(state.commits, name)) {
      // Настоящий git реально умеет сливать по хэшу коммита (сверено напрямую, git 2.53.0:
      // `git merge <хэш>` при перемотке реально даёт "Fast-forward") — слияние по хэшу вне
      // модели «HEAD всегда указывает на ветку» этого шага (branchTypes.ts), поэтому здесь
      // честный отказ по правилу области, а не имитация ошибки git.
      return fail(state, be.mergeByHashOutOfScope, null)
    }
    // Для имени, которое не является ни веткой, ни коммитом, этот текст — настоящий вывод git
    // (сверено напрямую), не выдумка.
    return fail(state, `merge: ${name} - not something we can merge`, null)
  }

  const target = state.branches[name]
  const current = currentTip(state)
  const baseResult = mergeBase(state, current, target)
  if (baseResult.ambiguous) {
    // Крест-накрест история — несколько лучших общих предков сразу (branchRepo.ts, mergeBase).
    // Настоящий git такую историю реально сливает сам (виртуальный общий предок) — этот шаг
    // тренажёра такого алгоритма не реализует; честный отказ по правилу области, а не выбор базы
    // наугад и не выдуманный конфликт. Состояние не меняется (fail, а не ok).
    return fail(state, be.multipleMergeBasesOutOfScope(name), null)
  }
  const base = baseResult.base

  // lastMerge (branchTypes.ts) записывает, какую ветку кода реально прошёл handleMerge — нужно
  // миссии 4 (branchMissions.ts), которая иначе не отличила бы перемотку от только что созданной
  // ветки, указывающей на тот же коммит (перемотка не создаёт нового коммита — в графе коммитов
  // этот исход сам по себе ничем не отличить).
  if (base === target) return ok({ ...state, lastMerge: 'up-to-date' }, 'Already up to date.', null)

  if (base === current) {
    // fast-forward
    const targetTree = commitTree(state, target)
    const block = checkSafety(state, targetTree)
    const updating = `Updating ${current.slice(0, 7)}..${target.slice(0, 7)}`
    if (block.modified.length || block.untracked.length) return fail(state, `${updating}\n${formatOverwriteError(block, 'merge')}`, null)
    const { index, working } = applyTreeChange(state, targetTree)
    const nextState: BranchingState = { ...state, branches: { ...state.branches, [state.head]: target }, index, working, lastMerge: 'fast-forward' }
    return ok(nextState, `${updating}\nFast-forward`, null)
  }

  // ветки разошлись — трёхстороннее слияние.
  // git-merge(1), PRE-MERGE CHECKS — «git merge will also abort if there are any changes
  // registered in the index relative to the HEAD commit». Проверка идёт ДО попытки слияния
  // (раньше, чем обнаружение конфликта — сверено напрямую, git 2.53.0: дана дирти-индекс по
  // НЕучаствующему в слиянии файлу — git отказывает этим же сообщением, даже не начиная считать
  // слияние) и ДО того, как известно, будет ли конфликт.
  // Формат — ДРУГОЙ, чем у formatOverwriteError (checkSafety ниже): два пробела и список путей
  // через пробел ОДНОЙ строкой, без "Please commit"/"Aborting" (сверено напрямую, дословный вывод):
  //   error: Your local changes to the following files would be overwritten by merge:
  //     <файл1> <файл2> ...
  //   Merge with strategy ort failed.
  // Для fast-forward это же самое разрешено (проверка выше, до этой ветки, использует checkSafety,
  // и её поведение для fast-forward уже совпадает с git — см. checkSafety, branchRepo.ts).
  const dirtyIndex = indexDiffersFromHead(state)
  if (dirtyIndex.length) {
    return fail(
      state,
      `error: Your local changes to the following files would be overwritten by merge:\n  ${dirtyIndex.join(' ')}\nMerge with strategy ort failed.`,
      null,
    )
  }

  const baseTree = commitTree(state, base)
  const currentTree = headTree(state)
  const targetTree = commitTree(state, target)
  const merged = mergeTrees(baseTree, currentTree, targetTree)

  // Проверка безопасности идёт РАНЬШЕ обнаружения конфликта, а не наоборот: git решает, можно ли
  // вообще трогать рабочее дерево, ДО того, как пытается слить содержимое — сверено напрямую (git
  // 2.53.0, временный каталог): грязный (незастейджённый) файл, который к тому же участвует в
  // конфликте между ветками, даёт "Your local changes … would be overwritten by merge" / "Merge
  // with strategy ort failed." с кодом выхода 2 — без единого упоминания конфликта, git до его
  // обнаружения не доходит вовсе. `merged.tree` годится как "результирующее дерево" и для путей с
  // конфликтом: mergeTrees никогда не кладёт конфликтующий путь в `tree`, поэтому checkSafety
  // видит его как отличающийся от HEAD (что верно — конфликтующий путь ВСЕГДА переписывается,
  // хотя бы конфликтными маркерами) и блокирует его наравне с обычным изменённым путём.
  const block = checkSafety(state, merged.tree)
  if (block.modified.length || block.untracked.length) return fail(state, formatOverwriteError(block, 'merge', '\nMerge with strategy ort failed.'), null)

  if (merged.conflicts.length) {
    // target.md, часть IV, «опасное место 6»: конфликт до шага B не должен ни молча сливаться,
    // ни выдавать придуманный результат — честный отказ по правилу области. Причина конфликта
    // передаётся дальше как есть (mergeTrees уже классифицировал её через classifyConflict,
    // branchRepo.ts) — текст не должен называть ЛЮБОЙ конфликт «правки задели одни и те же
    // строки», это верно только для одного из трёх случаев.
    return fail(state, be.mergeConflictOutOfScope(name, merged.conflicts), null)
  }

  // fmt-merge-msg.c (fmt_merge_msg_title) добавляет " into <ветка>", подавляя это только для
  // master/main (merge.suppressDest по умолчанию покрывает ровно эти два имени) — сверено
  // напрямую (git 2.53.0): слияние в "develop" даёт сообщение "Merge branch 'x' into develop",
  // слияние в "master"/"main" — без "into" вовсе.
  const message = state.head === 'master' || state.head === 'main' ? `Merge branch '${name}'` : `Merge branch '${name}' into ${state.head}`
  // Тот же шаг логических часов, что и у обычного коммита (handleCommit выше) — коммит слияния
  // одинаковых по содержимому веток получает свой отдельный id, а не совпадает с уже
  // существующим коммитом графа.
  const id = branchCommitHash(message, merged.tree, [current, target], state.clock)
  const commit: BranchCommit = { id, parents: [current, target], message, tree: merged.tree }
  const { index, working } = applyTreeChange(state, merged.tree)
  const nextState: BranchingState = {
    ...state,
    commits: { ...state.commits, [id]: commit },
    branches: { ...state.branches, [state.head]: id },
    index,
    working,
    lastMerge: 'merge-commit',
    clock: state.clock + 1,
  }
  const autoMergeLines = merged.autoMerged.map((f) => `Auto-merging ${f}`)
  const output = [...autoMergeLines, `Merge made by the 'ort' strategy.`].join('\n')
  return ok(nextState, output, null)
}

// ---------- git add (минимальный набор для миссий шага A) ----------

/**
 * Упрощённый `git add` для шага A: только явные имена файлов и "." —
 * без "*"/"-A"/pathspec-глоббинга раздела 1 (A4/matchPathspec, repo.ts).
 * Миссии раздела 2 называют файл буквально ("git add style.css"); более
 * широкий набор (как в разделе 1) сюда не переносился намеренно — это
 * тема раздела 1, а не шага A раздела 2.
 */
const ADD_NOTHING_SPECIFIED =
  "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\n" +
  'hint: Disable this message with "git config set advice.addEmptyPathspec false"'

/** `paths`, о которых известно, что они — не флаги (см. handleAdd: обычная позиция или всё, что после "--"). */
function addPaths(state: BranchingState, paths: string[]): { state: BranchingState; result: CommandResult } {
  if (!paths.length) return ok(state, ADD_NOTHING_SPECIFIED, null)

  if (paths.includes('.')) {
    const head = headTree(state)
    const files = new Set<string>([...Object.keys(state.working), ...Object.keys(state.index), ...Object.keys(head)])
    const nextIndex: FileTree = { ...state.index }
    files.forEach((f) => {
      if (has(state.working, f)) nextIndex[f] = state.working[f]
      else delete nextIndex[f]
    })
    return ok({ ...state, index: nextIndex }, '', null)
  }

  // Путь известен git, если он есть в рабочем дереве ИЛИ в индексе, ИЛИ в HEAD — не только в
  // рабочем дереве: `git add <удалённый файл>` (файл был в HEAD/индексе, но убран из рабочего
  // дерева) реально стейджит удаление, а не отказывает (сверено напрямую, git 2.53.0). Та же
  // логика, что и у "git add ." двумя строками выше.
  const head = headTree(state)
  const knownToGit = new Set<string>([...Object.keys(state.working), ...Object.keys(state.index), ...Object.keys(head)])
  const notFound = paths.find((f) => !knownToGit.has(f))
  if (notFound !== undefined) return fail(state, `fatal: pathspec '${notFound}' did not match any files`, null)

  const nextIndex: FileTree = { ...state.index }
  paths.forEach((f) => {
    if (has(state.working, f)) nextIndex[f] = state.working[f]
    else delete nextIndex[f]
  })
  return ok({ ...state, index: nextIndex }, '', null)
}

function handleAdd(state: BranchingState, args: string[]): { state: BranchingState; result: CommandResult } {
  // "--" первым аргументом отключает разбор опций — всё после него уже pathspec, даже
  // слово, начинающееся с "-" (сверено напрямую: `git add -- --bogus` ищет ФАЙЛ "--bogus", а не
  // отказывает как на неизвестную опцию). Голый "git add --" (без путей) ведёт себя как голый
  // "git add" — то же ADD_NOTHING_SPECIFIED.
  if (args[0] === '--') return addPaths(state, args.slice(1))

  if (!args.length) return ok(state, ADD_NOTHING_SPECIFIED, null)

  const flag = args.find((a) => a.startsWith('-'))
  if (flag) {
    // Та же граница «unknown/real/ambiguous/help», что и у остальных команд шага A (см. classifySection2Option).
    const addAllowed = 'git add <файл>, git add .'
    const classified = classifySection2Option('add', flag)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null)
    if (classified.kind === 'ambiguous') return fail(state, be.ambiguousAbbreviationOutOfScope(`git add ${flag}`, addAllowed), null)
    if (classified.kind === 'help') return fail(state, be.helpOutOfScope(`git add ${flag}`, addAllowed), null)
    return fail(state, be.optionOutOfScope(`git add ${classified.resolved}`, addAllowed), null)
  }

  return addPaths(state, args)
}

// ---------- git commit (-m, -a/-am, --all; выборочный коммит по путям вне области) ----------

/**
 * Настоящий git обрезает сообщение коммита перед сохранением (--cleanup, git-commit(1)) — режим
 * по умолчанию для `-m` БЕЗ редактора, сверено напрямую (git 2.53.0, 24.09.2026): "whitespace" —
 * НЕ "strip" (в `git help commit`: "default — same as strip if the message is to be edited,
 * otherwise whitespace"). Разница важна: "whitespace" обрезает у каждой строки только ХВОСТОВЫЕ
 * пробелы/табы (ведущие остаются как есть) и не трогает строки, начинающиеся с "#" (это отличает
 * его от "strip", который вырезал бы и такие строки-комментарии, — сверено отдельно прогоном
 * `--cleanup=strip` для контраста). Несколько `-m` не перезаписывают друг друга, а склеиваются в
 * абзацы через пустую строку — правило и его разбор общие с разделом 1, см. commitFlags.ts,
 * buildCommitMessage.
 */
const COMMIT2_ALLOWED = 'git commit -m "..."'

function commit2OptionError(flag: string): CommandResult {
  // Та же граница «unknown/real/ambiguous/help», что и у остальных команд шага A (см.
  // classifySection2Option) — вызывается только для флагов, которые общий разбор -a/-m/--all
  // (classifyCommitFlagToken, commitFlags.ts) не опознал сам.
  const classified = classifySection2Option('commit', flag)
  if (classified.kind === 'unknown' || classified.kind === 'noValue') return { ok: false, output: classified.output, explanation: null }
  if (classified.kind === 'ambiguous') return { ok: false, output: be.ambiguousAbbreviationOutOfScope(`git commit ${flag}`, COMMIT2_ALLOWED), explanation: null }
  if (classified.kind === 'help') return { ok: false, output: be.helpOutOfScope(`git commit ${flag}`, COMMIT2_ALLOWED), explanation: null }
  return { ok: false, output: be.optionOutOfScope(`git commit ${classified.resolved}`, COMMIT2_ALLOWED), explanation: null }
}

/**
 * Одна буква внутри кластера коротких опций `git commit`, которую этот шаг не реализует ни в
 * каком виде (не "a"/"m", см. classifyCommitFlagToken, commitFlags.ts), но которая тем не менее
 * РЕАЛЬНА у настоящего git ("-q"/"-v"/"-t" и т.п.) — используется, чтобы отличить «git продолжил
 * бы разбор кластера дальше» (буква реальна) от «git остановился бы прямо здесь» (буква
 * неизвестна вовсе), не дублируя список букв commit ещё раз в этом файле.
 */
function commitShortFlagIsReal(letter: string): boolean {
  return classifySection2Option('commit', '-' + letter).kind === 'real'
}

function handleCommit(state: BranchingState, tokens: ShellToken[]): { state: BranchingState; result: CommandResult } {
  let stageAll = false
  const messages: CommitMessagePart[] = []

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const classified = classifyCommitFlagToken(tok, commitShortFlagIsReal, commit2OptionError)
    if (classified.kind === 'error') return { state, result: classified.result }
    if (classified.kind === 'separator') {
      // "--" отключает разбор опций для всего, что после него — даже "-m" (сверено
      // напрямую: `git commit -- -m` ищет ПУТЬ "-m", а не флаг сообщения). Голый "--" без
      // ничего после ведёт себя так, будто его не было вовсе (сверено: `git commit -- ` и
      // `git commit -m "x" --` коммитят как обычно).
      const rest = tokens.slice(i + 1)
      if (!rest.length) break
      // "-a" вместе с ЛЮБЫМ pathspec (после "--" или без) — настоящий git отказывает буквально
      // так, независимо от того, сколько путей дано и что именно в них написано (сверено
      // напрямую, git 2.53.0, 24.09.2026: builtin/commit.c печатает первый путь и буквальный
      // текст " ..." после него, даже когда путь ровно один). Текст пути никогда не
      // подставляется в список "здесь поддерживается" — путь, буквально названный "-m",
      // не должен выглядеть как нереализованный флаг.
      if (stageAll) return fail(state, `fatal: paths '${rest[0].text} ...' with -a does not make sense`, null)
      // Раздел 2 не реализует выборочный коммит по путям — честный отказ, не привязанный к
      // конкретному тексту пути (чтобы путь, случайно совпавший с именем реализованного флага,
      // например "-m", не оказался в списке "здесь поддерживается" сам по себе).
      return fail(state, be.optionOutOfScope('git commit -- <файл> (выборочный коммит по путям)', COMMIT2_ALLOWED), null)
    }
    if (classified.kind === 'positional') {
      // Позиционный аргумент (например путь) — выборочный коммит по путям без -m вне области
      // шага A (эта функция разбирает только флаги); "-a" + pathspec — та же настоящая ошибка
      // git, что и после "--" выше (сверено напрямую то же самое, без "--": `git commit -a p1`).
      if (stageAll) return fail(state, `fatal: paths '${tok.text} ...' with -a does not make sense`, null)
      return fail(state, be.optionOutOfScope(`git commit ${tok.text}`, COMMIT2_ALLOWED), null)
    }
    const { outcome } = classified
    if (outcome.stageAll) stageAll = true
    if (outcome.message) {
      messages.push(outcome.message)
    } else if (outcome.needsMessageFromNextToken) {
      const next = tokens[i + 1]
      // "error: switch `m' requires a value" — весь буквальный вывод git 2.53.0 (та же проверка,
      // что и у "checkout -b" выше: здесь тоже нет usage-блока после этой строки, сверено
      // напрямую — это не обрезка).
      if (!next) return fail(state, "error: switch `m' requires a value", null)
      messages.push({ value: next.text, quoted: next.quoted })
      i++
    }
  }

  const { message, summary } = buildCommitMessage(messages)
  const sawM = messages.length > 0

  // target.md, часть IV, «Что входит в шаг A»: "-a" стейджит только уже отслеживаемые изменённые/
  // удалённые файлы — общее с разделом 1 правило, см. commitFlags.ts, applyStageAll.
  const head = headTree(state)
  const nextIndex: FileTree = stageAll ? applyStageAll(state.index, state.working) : state.index

  // "Нечего коммитить" проверяется РАНЬШЕ пустого сообщения, а не после — сверено напрямую (git
  // 2.53.0): `git commit -m ""` на чистом дереве отвечает "On branch master\nnothing to commit,
  // working tree clean" (rc=1), НЕ "Aborting commit due to empty commit message."; то же для
  // `GIT_EDITOR=true git commit` (без -m вовсе) на чистом дереве — редактор в этом случае вообще
  // не открывается, git успевает отказать раньше. Проверка идёт по УЖЕ застейдженному "-a"
  // индексу (nextIndex) — иначе "-a", которому есть что стейджить, ошибочно попал бы в эту ветку.
  //
  // "nothing to commit, working tree clean" верно только когда рабочее дерево ТОЖЕ совпадает с
  // индексом. Если индекс == HEAD, но рабочее дерево отличается от индекса (незастейджённая
  // правка), настоящий git печатает обычный git status с блоком "Changes not staged" и
  // отказывает — не голую строку про "clean" (сверено напрямую, git 2.53.0, оба случая, включая
  // `git commit -m ""` при одной лишь незастейджённой правке: полный статус с "no changes added
  // to commit ...", а не "Aborting commit due to empty commit message.").
  //
  // Сама строка "nothing to commit, working tree clean", без строки "On branch <ветка>" перед
  // ней, — не отдельное сообщение git, а последняя строка ПОЛНОГО статуса (builtin/commit.c,
  // prepare_to_commit() → run_status() → wt_longstatus_print()). Сверено напрямую (git 2.53.0):
  // `git commit` на чистом дереве печатает ровно
  //   On branch master
  //   nothing to commit, working tree clean
  // formatBranchingStatus — свой форматтер для этой модели данных (branchRepo.ts), НЕ импорт из
  // repo.ts (раздел 1 не трогаем); она уже добавляет "On branch" и корректно печатает
  // "nothing to commit, working tree clean" последней строкой, когда staged/notStaged/untracked
  // пусты (см. её реализацию, branchRepo.ts).
  //
  // Текст статуса строится по СЧИТАННОМУ индексу "-a" (nextIndex), а не по исходному state.index —
  // git считает "-a" во ВРЕМЕННЫЙ индекс для попытки коммита и печатает статус ПО НЕМУ (сверено
  // напрямую, git 2.53.0, 24.09.2026: сценарий a.txt=changed → git add a.txt → a.txt=base → git
  // commit -a -m x печатает буквально "On branch master\nnothing to commit, working tree clean",
  // а не полный статус со старой застейдженной правкой). Настоящий git при этом НЕ переносит "-a"
  // во взаправдашний индекс, если коммит не состоялся — тот временный индекс просто отбрасывается
  // (сверено: после отказа `git status` показывает СТАРОЕ состояние — "Changes to be
  // committed"/"Changes not staged" как до "-a"), поэтому возвращаемое состояние здесь — исходное
  // `state` (с state.index, не nextIndex), а не `{ ...state, index: nextIndex }`; nextIndex
  // используется только для ТЕКСТА этого одного сообщения.
  if (sameTree(head, nextIndex)) {
    return fail(state, formatBranchingStatus({ ...state, index: nextIndex }), null)
  }

  // Здесь ИНДЕКС (с учётом "-a") уже отличается от HEAD (есть что коммитить) — только теперь
  // проверяется сообщение. Без -m настоящий git открывает текстовый редактор, чтобы запросить
  // сообщение — открыть редактор здесь нечем, поэтому коммит без -m всегда прерывается с тем же
  // дословным текстом, что и явно пустое сообщение (сверено напрямую: GIT_EDITOR=true git commit
  // при застейдженных изменениях -> "Aborting commit due to empty commit message."). Пояснение
  // честно называет причину (нет редактора), а не молчит о ней — тот же приём, что и в разделе 1
  // (commands.ts, ru.explain.commitAborting).
  if (!sawM) return fail(state, 'Aborting commit due to empty commit message.', ru.explain.commitAborting)
  // Здесь -m БЫЛ дан явно (например `-m ""`), просто его значение пустое (или из одних
  // пробелов) — редактор ни при чём (git проверяет длину сообщения раньше, чем открыл бы
  // редактор), поэтому пояснение честно другое, а не commitAborting (который назвал бы
  // неправильную причину) — тот же приём и та же строка, что и в разделе 1
  // (commands.ts, ru.explain.commitAbortingEmptyMessage).
  if (!message) return fail(state, 'Aborting commit due to empty commit message.', ru.explain.commitAbortingEmptyMessage)

  const parent = currentTip(state)
  const tree: FileTree = { ...nextIndex }
  // Шаг логических часов (target.md, A5; util.ts, commitHashCore) — растёт на единицу при
  // каждом новом коммите, включая коммит слияния (handleMerge ниже). Без него одинаковая правка
  // с одинаковым сообщением в двух ветках получала бы один и тот же id.
  const id = branchCommitHash(message, tree, [parent], state.clock)
  const commit: BranchCommit = { id, parents: [parent], message, tree }
  const nextState: BranchingState = {
    ...state,
    commits: { ...state.commits, [id]: commit },
    branches: { ...state.branches, [state.head]: id },
    index: nextIndex,
    clock: state.clock + 1,
  }
  return ok(nextState, `[${state.head} ${id.slice(0, 7)}] ${summary}`, null)
}

// ---------- git status ----------

const STATUS_ALLOWED = 'git status'

/**
 * `git status` шага A (Часть 1 переноса шага A — подключение к уже существующему
 * formatBranchingStatus, branchRepo.ts). Единственная реализованная форма — голый `git status`
 * (в т.ч. с одиноким "--" без ничего после — см. другие обработчики этого файла, тот же
 * приём). Любой флаг (включая -s/--short — см. комментарий у STATUS_OPTIONS, branchScope.ts,
 * про то, почему короткий формат здесь честно не разобран) и любой позиционный аргумент
 * (pathspec, настоящая возможность git-status(1), но не разобранная в этом шаге) получают
 * честный второй ответ правила области, а не молчаливое игнорирование или выдуманный вывод.
 */
function handleStatus(state: BranchingState, args: string[]): { state: BranchingState; result: CommandResult } {
  // "--" отключает разбор опций для всего, что после него — как и у остальных команд этого
  // файла (branch/checkout/merge/add/commit) — всё после "--" уже pathspec, даже слово,
  // начинающееся с "-".
  const afterSeparator = args[0] === '--'
  const rest = afterSeparator ? args.slice(1) : args
  const flags = afterSeparator ? [] : rest.filter((a) => a.startsWith('-'))
  const paths = afterSeparator ? rest : rest.filter((a) => !a.startsWith('-'))

  for (const f of flags) {
    const classified = classifySection2Option('status', f)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null)
    if (classified.kind === 'ambiguous') return fail(state, be.ambiguousAbbreviationOutOfScope(`git status ${f}`, STATUS_ALLOWED), null)
    if (classified.kind === 'help') return fail(state, be.helpOutOfScope(`git status ${f}`, STATUS_ALLOWED), null)
    return fail(state, be.optionOutOfScope(`git status ${classified.resolved}`, STATUS_ALLOWED), null)
  }
  if (paths.length) return fail(state, be.optionOutOfScope(`git status ${paths.join(' ')}`, STATUS_ALLOWED), null)
  return ok(state, formatBranchingStatus(state), null)
}

// ---------- диспетчер ----------

function appendCommand(state: BranchingState, rawInput: string, result: CommandResult): BranchingState {
  return {
    ...state,
    history: [...state.history, { kind: 'command', input: rawInput, ok: result.ok, output: result.output, explanation: result.explanation }],
  }
}

/**
 * Выполняет одну строку терминала шага A. Та же двухэтапная граница
 * «шелл/git», что и в разделе 1 (shellTokenize уже снял кавычки и раскрыл
 * голую "*" — см. shell.ts); ничего не бросает — любой недопустимый ввод
 * превращается в предусмотренный отказ.
 */
export function executeBranchingCommand(state: BranchingState, rawInput: string): { state: BranchingState; result: CommandResult | null } {
  if (!rawInput.trim()) return { state, result: null }

  const tokens = shellTokenize(rawInput, Object.keys(state.working))
  const words = tokens.map((t) => t.text)

  function respond(pair: { state: BranchingState; result: CommandResult }) {
    return { state: appendCommand(pair.state, rawInput, pair.result), result: pair.result }
  }

  if (words[0] !== 'git') return respond(fail(state, ru.errors.bashCommandNotFound(words[0] ?? ''), null))

  const badGlob = tokens.slice(1).find((t) => t.unsupportedGlob)
  if (badGlob) return respond(fail(state, ru.errors.shellGlobUnsupported(badGlob.text), null))

  const sub = words[1]
  if (sub === undefined) return respond(fail(state, be.gitUsageNoArgs, null))
  if (isGlobalGitOption(sub)) return respond(fail(state, be.commandOutOfScope(sub), null))

  if (sub === 'switch' || sub === 'restore') return respond(fail(state, be.switchRestoreOutOfScope(sub), null))

  if (!isSection2Command(sub)) {
    if (REAL_GIT_COMMANDS.has(sub)) return respond(fail(state, be.commandOutOfScope(sub), null))
    return respond(fail(state, gitNotACommand(sub), null))
  }

  let outcome: { state: BranchingState; result: CommandResult }
  switch (sub) {
    case 'branch':
      outcome = handleBranch(state, words.slice(2))
      break
    case 'checkout':
      outcome = handleCheckout(state, words.slice(2))
      break
    case 'merge':
      outcome = handleMerge(state, words.slice(2))
      break
    case 'add':
      outcome = handleAdd(state, words.slice(2))
      break
    case 'commit':
      outcome = handleCommit(state, tokens.slice(2))
      break
    case 'status':
      outcome = handleStatus(state, words.slice(2))
      break
  }
  return respond(outcome)
}
