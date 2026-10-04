// ============================================================
// Раздел 1 git-тренажёра: git-сторона разбора командной строки терминала.
// Реализованы только init, status, add, commit — остальные подкоманды git
// вне границ раздела 1 (см. ru.errors.commandOutOfScope).
//
// Этот файл — вторая половина границы «шелл / git» (target.md, «Граница:
// где шелл, а где git»): он получает от shell.ts уже готовый список
// аргументов и ничего не знает о том, как тот получился (кавычки, "*" —
// дело shell.ts, не это файла).
//
// Строки вида "fatal: …", "error: …", "On branch …", "git: '…' is not a
// git command" — буквальный вывод настоящего git и намеренно хранятся здесь
// как английские литералы (см. шапку locales/ru.ts).
//
// Граница области раздела 1 (target.md, часть III, правило 1) задана ДАННЫМИ в scope.ts
// (SECTION_SCOPE/REAL_GIT_COMMANDS/REAL_GIT_OPTIONS) — этот файл только СВЕРЯЕТСЯ с ними
// через classifyOption()/isSectionCommand(), а не хранит свою копию списков.
// ============================================================
import type { CommandResult, FileTree, SectionState } from './types'
import {
  addAllFiles,
  addSingleFile,
  commitFromIndex,
  commitPathspec,
  countCopiedContent,
  describeAddOutcome,
  formatStatusFriendly,
  formatStatusShort,
  getStatus,
  headTree,
  initRepo,
  matchPathspec,
  representativeFileFor,
  sameTree,
  statusTailKind,
} from './repo'
import { classifyOption, describedScope, isGlobalGitOption, isSectionCommand, REAL_GIT_COMMANDS, splitShortOptionCluster } from './scope'
import { ambiguousOptionOutput } from './optionAbbrev'
import type { ShellToken } from './shell'
import { shellTokenize } from './shell'
import { applyStageAll, buildCommitMessage, classifyCommitFlagToken, type CommitMessagePart } from './commitFlags'
import { ru } from '../locales/ru'

/**
 * Разделяет слова на флаги (начинаются с "-", длиннее одного символа) и позиционные аргументы.
 * "--" отделяет опции от pathspec (та же модель, что в commit/add, — see splitAddArgs/
 * parseCommitArgs): всё, что идёт ПОСЛЕ "--", — pathspec, даже если начинается с "-"
 * (target.md, часть III, правила 1–2).
 */
function splitArgs(list: string[]): { flags: string[]; args: string[] } {
  const flags: string[] = []
  const args: string[] = []
  let afterSeparator = false
  list.forEach((t) => {
    if (!afterSeparator && t === '--') {
      afterSeparator = true
      return
    }
    ;(!afterSeparator && t.length > 1 && t[0] === '-' ? flags : args).push(t)
  })
  return { flags, args }
}

function ok(state: SectionState, output: string, explanation: string | null = null): { state: SectionState; result: CommandResult } {
  return { state, result: { ok: true, output, explanation } }
}
function fail(state: SectionState, output: string, explanation: string | null = null): { state: SectionState; result: CommandResult } {
  return { state, result: { ok: false, output, explanation } }
}

/**
 * target.md, A9/A10, часть III правило 1: имя подкоманды классифицируется на три случая —
 * 1. реализована в разделе 1 (isSectionCommand(sub), см. switch ниже);
 * 2. настоящая, но раздел 1 её не реализует (REAL_GIT_COMMANDS.has(sub) — см. scope.ts);
 * 3. такой команды у git вообще нет (ни там, ни там — ru errors ниже, буквальный вывод git).
 * Списки — данные, не логика, см. scope.ts (SECTION_SCOPE/REAL_GIT_COMMANDS).
 */

/**
 * target.md, A9: буквальный вывод настоящего git — не переводится, см. шапку файла.
 * Проверено на git 2.53.0: полная первая строка — "git: 'foo' is not a git command.
 * See 'git --help'." — эта часть детерминированная (не зависит от ввода), дописана дословно.
 * Дальше настоящий git иногда добавляет пустую строку и "The most similar command is\n\t<имя>" —
 * это НЕ воспроизводится: подсказка зависит от версии git и её собственного алгоритма
 * похожести (список реальных команд для сравнения нужен намного шире REAL_GIT_COMMANDS, а
 * сам подбор — не что-то, что можно честно повторить, не имитируя частный алгоритм git).
 * Сознательная обрезка, а не незамеченная.
 */
function gitNotACommand(sub: string): string {
  return `git: '${sub}' is not a git command. See 'git --help'.`
}

// ---------- git status ----------

/**
 * target.md, часть III, правило 1 — три ответа на опцию, не два: см. classifyOption в scope.ts.
 * Случай 3 (совсем неизвестная git опции) собирает буквальную первую строку настоящей ошибки
 * git ("error: unknown switch/option …") — без хвоста-usage, который git печатает следом
 * (десятки строк help; не воспроизводится — подсказка зависит от версии git). Случай 2
 * (опция реальная, но раздел 1 её не разбирает) — честный маркированный отказ, не «unknown».
 *
 * `paths` — позиционные аргументы после `git status` (pathspec). Настоящий git фильтрует по
 * ним вывод (git-status(1)); раздел 1 эту фильтрацию не реализует (SECTION_SCOPE.options.
 * status.pathspec === false) — честный отказ (второй ответ правила 1), а не молчаливое
 * игнорирование лишнего аргумента.
 */
function handleStatus(state: SectionState, flags: string[], paths: string[]): { state: SectionState; result: CommandResult } {
  // target.md, часть III, правило 1 (пункт 4): кластер коротких опций ("-sb") разбирается
  // посимвольно, как parse-options.c у настоящего git — ровно та же модель, что уже есть у
  // commit (parseCommitArgs). Сравнение токена "-sb" целиком с "-s"/"--short" не совпало бы
  // ни с чем, поэтому `git status -sb` (рабочая команда настоящего git) получил бы
  // придуманное "unknown switch 'sb'" вместо честной классификации каждой буквы отдельно.
  const expanded = flags.flatMap(splitShortOptionCluster)
  // Каноническое имя после разрешения возможного сокращения (target.md, «При сомнении —
  // второй ответ»; см. classifyOption/abbreviatedOptionCandidates в scope.ts) — нужно
  // отдельно от "expanded", потому что "-s"/"--short" ниже проверяются по каноническому
  // имени: иначе "--sho" (однозначное сокращение --short) прошло бы классификацию как
  // "scope", но осталось бы неопознанным как короткий формат вывода.
  const resolvedFlags: string[] = []
  for (const f of expanded) {
    const cls = classifyOption('status', f)
    if (cls.kind === 'ambiguous') {
      return fail(state, ambiguousOptionOutput(f, cls.candidates ?? []), null)
    }
    if (cls.kind === 'unknown') {
      // Расхождение B1: значение после "=" остаётся в тексте ошибки, git его не отрезает
      // (сверено на git 2.53.0, 24.09.2026: `git status --bogus=1` → "unknown option `bogus=1'").
      const long = f.startsWith('--')
      const name = f.replace(/^-+/, '')
      return fail(state, `error: unknown ${long ? 'option' : 'switch'} \`${name}'`, null)
    }
    if (cls.kind === 'outOfScope') {
      return fail(state, ru.errors.optionOutOfScope('status', cls.resolved, describedScope('status')), null)
    }
    resolvedFlags.push(cls.resolved)
  }
  if (paths.length) {
    return fail(state, ru.errors.statusPathspecOutOfScope(paths), null)
  }
  const short = resolvedFlags.includes('-s') || resolvedFlags.includes('--short')
  const output = short ? formatStatusShort(state) : formatStatusFriendly(state)
  return ok(state, output, ru.explain.status)
}

// ---------- git add ----------

/**
 * target.md, A2: явное пояснение в зависимости от того, что реально произошло с индексом.
 * `addContent` склоняется по числу файлов (один файл vs несколько за один `git add .`/`-A`) —
 * см. locales/ru.ts.
 */
function explainAddResult(prevIndex: FileTree, nextIndex: FileTree): string {
  const kind = describeAddOutcome(prevIndex, nextIndex)
  if (kind === 'removal') return ru.explain.addRemoval
  if (kind === 'mixed') return ru.explain.addMixed
  return ru.explain.addContent(countCopiedContent(prevIndex, nextIndex))
}

/**
 * Разделяет аргументы `git add` на флаги и пути с учётом "--" (scope.ts,
 * SECTION_SCOPE.options.add.separator): "--" отделяет опции от pathspec — всё, что идёт
 * после него, трактуется как путь, даже если начинается с "-" (ровно как у настоящего git,
 * см. `git add -- -weird.txt`, проверено на git 2.53). До "--" поведение прежнее: слово,
 * начинающееся с "-", — флаг.
 */
function splitAddArgs(tokens: string[]): { flags: string[]; paths: string[] } {
  const flags: string[] = []
  const paths: string[] = []
  let afterSeparator = false
  for (const t of tokens) {
    if (!afterSeparator && t === '--') {
      afterSeparator = true
      continue
    }
    if (!afterSeparator && t.startsWith('-')) flags.push(t)
    else paths.push(t)
  }
  return { flags, paths }
}

/**
 * @param restTokens аргументы `git add` — уже прошли через шелл (см. shell.ts): кавычки
 * сняты, "*" уже раскрыт в список файлов (или остался литеральной строкой "*", если файлов
 * не нашлось). Здесь про кавычки и "*" ничего не знают — target.md, A4: "." — единственный
 * спецсимвол, который остаётся на стороне git (это его собственный синтаксис pathspec,
 * а не что-то, что раскрывает шелл).
 */
function handleAdd(state: SectionState, restTokens: string[]): { state: SectionState; result: CommandResult } {
  // Буквальный вывод git (проверено на git 2.53.0, 20.09.2026), включая третью hint-строку про
  // advice.addEmptyPathspec — это не переменный текст (не зависит от ввода), поэтому
  // воспроизводится дословно целиком, а не документируется как упрощение.
  const ADD_NOTHING_SPECIFIED =
    "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\n" +
    'hint: Disable this message with "git config set advice.addEmptyPathspec false"'
  if (!restTokens.length) {
    // B2: настоящий git add без аргументов завершается успешно (код 0) — это подсказка,
    // а не ошибка (проверено на git 2.43+).
    return ok(state, ADD_NOTHING_SPECIFIED, null)
  }
  const { flags: rawFlags, paths } = splitAddArgs(restTokens)
  // "git add --" (без путей после разделителя) — тот же случай, что и "git add" совсем без
  // аргументов: "--" сам по себе ничего не задаёт, а не опция и не путь. Настоящий git даёт
  // ровно тот же текст и ту же подсказку про "git add ." (проверено на git 2.53).
  if (!rawFlags.length && !paths.length) {
    return ok(state, ADD_NOTHING_SPECIFIED, null)
  }
  // target.md, часть III, правило 1 (пункт 4): кластер коротких опций разбирается посимвольно,
  // как у commit (parseCommitArgs) — см. пояснение в handleStatus.
  const flags = rawFlags.flatMap(splitShortOptionCluster)
  // target.md, часть III, правило 1 — та же трёхходовая классификация, что и у status (см. там).
  for (const f of flags) {
    const cls = classifyOption('add', f)
    if (cls.kind === 'ambiguous') {
      return fail(state, ambiguousOptionOutput(f, cls.candidates ?? []), null)
    }
    if (cls.kind === 'unknown') {
      // Расхождение B1, тот же текст, что и в handleStatus выше.
      const long = f.startsWith('--')
      const name = f.replace(/^-+/, '')
      return fail(state, `error: unknown ${long ? 'option' : 'switch'} \`${name}'`, null)
    }
    if (cls.kind === 'outOfScope') {
      return fail(state, ru.errors.optionOutOfScope('add', cls.resolved, describedScope('add')), null)
    }
  }
  if (flags.length && !paths.length) {
    const next = addAllFiles(state)
    return ok(next, '', explainAddResult(state.index, next.index))
  }
  if (paths.some((p) => p === '.')) {
    const next = addAllFiles(state)
    return ok(next, '', explainAddResult(state.index, next.index))
  }
  // target.md, часть III, правило 1 (пункт 1): pathspec — glob git, а не шелла (git-add(1),
  // пример "git add Documentation/\*.txt"). Строка вроде "*.html", дошедшая до git буквально
  // (например в кавычках — шелл её не раскрывает, см. shell.ts), сопоставляется как glob, а
  // не сравнивается дословно с именами файлов — настоящий git умеет её сопоставить сам, см.
  // repo.ts, matchPathspec, там же обоснование и границы.
  const candidates = [...new Set([...Object.keys(state.working), ...Object.keys(state.index)])]
  const resolved = paths.map((p) => ({ pattern: p, matches: matchPathspec(p, candidates) }))
  const firstMissing = resolved.find((r) => r.matches.length === 0)
  if (firstMissing) {
    return fail(state, `fatal: pathspec '${firstMissing.pattern}' did not match any files`, ru.explain.addPathspecNotFound)
  }
  let next = state
  const toAdd = new Set<string>()
  resolved.forEach((r) => r.matches.forEach((m) => toAdd.add(m)))
  toAdd.forEach((f) => {
    next = addSingleFile(next, f)
  })
  return ok(next, '', explainAddResult(state.index, next.index))
}

// ---------- git commit ----------

interface ParsedCommitArgs {
  message: string | null
  /** Было ли слово/токен, из которого взято значение -m, хотя бы частично в кавычках (target.md, A8). */
  messageQuoted: boolean
  stageAll: boolean
  paths: { value: string; afterMessage: boolean; quoted: boolean }[]
}

/**
 * Разбор аргументов commit: -m/-a/-am/--all, длинные и короткие неподдерживаемые флаги.
 * `args` — уже готовые токены от шелла (см. shell.ts): значение может быть приклеено
 * к флагу в ОДНОМ токене (target.md, A6, например `-mтекст` — шелл уже собрал это слово
 * из `-m"текст"`) — сам разбор одного токена (-a/-m/--all/кластеры) общий с разделом 2
 * (см. commitFlags.ts, classifyCommitFlagToken) — короткие флаги разбираются посимвольно,
 * и как только встречается 'm', остаток текущего токена (если он не пуст) становится
 * значением; это ровно то, как короткие опции с значением разбирает настоящий git
 * (проверено на git 2.43+: `-ma` даёт сообщение "a", а не флаг -a вдобавок к -m).
 * Раздел 1 отличается от раздела 2 только тем, что происходит с ПОЗИЦИОННЫМИ токенами
 * (здесь — pathspec, продолжает разбирать флаги и после него) и тем, что делает с
 * несколькими "-m" (buildCommitMessage — общая логика, см. commitFlags.ts).
 */
function commitOptionError(flag: string): CommandResult {
  const cls = classifyOption('commit', flag)
  if (cls.kind === 'ambiguous') {
    return { ok: false, output: ambiguousOptionOutput(flag, cls.candidates ?? []), explanation: null }
  }
  if (cls.kind === 'outOfScope') {
    return { ok: false, output: ru.errors.optionOutOfScope('commit', cls.resolved, describedScope('commit')), explanation: null }
  }
  // Расхождение B1, тот же текст, что и в handleStatus/handleAdd выше.
  const long = flag.startsWith('--')
  const name = flag.replace(/^-+/, '')
  return { ok: false, output: `error: unknown ${long ? 'option' : 'switch'} \`${name}'`, explanation: null }
}

/**
 * Одна буква внутри кластера коротких опций `git commit`, которую раздел 1 не реализует ни в
 * каком виде (не "a"/"m", см. classifyCommitFlagToken, commitFlags.ts), но которая тем не менее
 * РЕАЛЬНА у настоящего git (REAL_GIT_OPTIONS.commit, scope.ts) — общий с разделом 2 механизм
 * (см. branchCommands.ts/commitShortFlagIsReal), свой список известных опций на каждый раздел.
 */
function commitShortFlagIsReal(letter: string): boolean {
  return classifyOption('commit', '-' + letter).kind !== 'unknown'
}

function parseCommitArgs(args: ShellToken[]): { error: CommandResult } | { parsed: ParsedCommitArgs } {
  let stageAll = false
  let afterSeparator = false
  const messages: CommitMessagePart[] = []
  const paths: { value: string; afterMessage: boolean; quoted: boolean }[] = []

  for (let i = 0; i < args.length; i++) {
    const tok = args[i]
    // target.md, часть III, правила 1–2: "--" отделяет опции от pathspec в git commit так же,
    // как в git status и git add.
    // scope.ts, SECTION_SCOPE.options.commit.separator: после "--" всё, включая слова
    // с "-" впереди, — pathspec, а не флаги (ровно как у настоящего git).
    if (afterSeparator) {
      paths.push({ value: tok.text, afterMessage: messages.length > 0, quoted: tok.quoted })
      continue
    }
    const classified = classifyCommitFlagToken(tok, commitShortFlagIsReal, commitOptionError)
    if (classified.kind === 'error') return { error: classified.result }
    if (classified.kind === 'separator') {
      afterSeparator = true
      continue
    }
    if (classified.kind === 'flag') {
      const { outcome } = classified
      if (outcome.stageAll) stageAll = true
      if (outcome.message) {
        messages.push(outcome.message)
      } else if (outcome.needsMessageFromNextToken) {
        if (i + 1 >= args.length) {
          return { error: { ok: false, output: "error: switch `m' requires a value", explanation: null } }
        }
        const valueTok = args[++i]
        messages.push({ value: valueTok.text, quoted: valueTok.quoted })
      }
      continue
    }
    // kind === 'positional' — раздел 1 (в отличие от раздела 2) продолжает разбирать
    // флаги и после позиционного токена (target.md, A8: сообщение может идти и до, и после pathspec).
    paths.push({ value: tok.text, afterMessage: messages.length > 0, quoted: tok.quoted })
  }
  const { message, messageQuoted } = buildCommitMessage(messages)
  return { parsed: { message, messageQuoted, stageAll, paths } }
}

/**
 * target.md, A8: честное условие для подсказки про кавычки — не догадка по одной лишь
 * позиции аргумента. Срабатывает, только если git получил лишние аргументы ПОСЛЕ
 * значения -m, и ни один из участников этой путаницы — ни само значение -m, ни лишние
 * аргументы — не был в кавычках. Если сообщение было в кавычках, значит пользователь
 * осознанно указал коммит по путям (`git commit -m "текст" <pathspec>` — законный
 * синтаксис git), и лишний путь — просто опечатка в имени файла, а не забытые кавычки
 * (см. target.md, A8, пример именно с этим исключением).
 */
function likelyForgottenQuotes(
  message: string | null,
  messageQuoted: boolean,
  extraPaths: { afterMessage: boolean; quoted: boolean }[],
): boolean {
  if (message === null || messageQuoted || !extraPaths.length) return false
  return extraPaths.every((p) => p.afterMessage && !p.quoted)
}

function handleCommit(state: SectionState, restTokens: ShellToken[]): { state: SectionState; result: CommandResult } {
  const parsedOrError = parseCommitArgs(restTokens)
  if ('error' in parsedOrError) return { state, result: parsedOrError.error }
  const { message, messageQuoted, stageAll, paths } = parsedOrError.parsed
  const head = headTree(state)

  if (paths.length) {
    if (stageAll) {
      // Реальный git отказывает раньше, чем проверяет сами пути, и делает это независимо
      // от того, существуют ли они (проверено на git 2.43+: git commit -a -m "x" <pathspec>
      // → "fatal: paths '<первый путь> ...' with -a does not make sense", код 128).
      return fail(state, `fatal: paths '${paths[0].value} ...' with -a does not make sense`, null)
    }
    // target.md, A12: pathspec проверяется по известности GIT — объединению путей из индекса и HEAD, — а НЕ
    // по наличию на диске (working tree в это множество кандидатов не входит: commit имеет
    // дело только с уже известными git файлами, в отличие от add, у которого working tree —
    // часть кандидатов, см. repo.ts, matchPathspec). Сопоставление — та же glob-семантика git
    // ("*", "?", "[...]"), что и у git add (repo.ts, matchPathspec/pathspecPatternToRegExp) —
    // настоящий git использует один и тот же pathspec-механизм в обеих командах (проверено
    // напрямую на git 2.53.0, 20.09.2026: `git commit -m x "*.html"`, когда один совпадающий
    // файл отслеживается, а другой существует только на диске и никогда не был в индексе, —
    // коммитит только известный файл, второй остаётся untracked; если совпадений среди
    // известных файлов нет вовсе — "error: pathspec '*.html' did not match any file(s) known
    // to git", даже если на диске есть файл с подходящим именем).
    const candidates = [...new Set([...Object.keys(state.index), ...Object.keys(head)])]
    const resolved = paths.map((p) => ({ ...p, matches: matchPathspec(p.value, candidates) }))
    const bad = resolved.filter((r) => r.matches.length === 0)
    const suspect = likelyForgottenQuotes(message, messageQuoted, paths)

    if (bad.length) {
      const output = bad.map((r) => `error: pathspec '${r.value}' did not match any file(s) known to git`).join('\n')
      return fail(state, output, suspect ? ru.explain.commitQuotesPathspec : null)
    }

    // Раскрытые pathspec в конкретные имена файлов (порядок — порядок паттернов, без
    // повторов): дальше и commitPathspec, и пояснения работают с реальными именами, а не
    // с исходной маской пользователя (files ru.explain.commit* — «имена файлов, которые
    // реально попали в этот коммит», см. locales/ru.ts).
    const matchedFiles = [...new Set(resolved.flatMap((r) => r.matches))]

    if (message !== null) {
      // target.md, A8 + A12: `git commit -m <сообщение> <pathspec>...` —
      // не только «самый опасный случай» забытых кавычек (suspect), а законный синтаксис
      // git сам по себе: коммитит только перечисленные пути (известные git — проверено выше),
      // а не весь индекс. Проверено прямым запуском на git 2.43+ (см. отчёт): берёт РАБОЧЕЕ
      // дерево для этих путей, а для остальных путей — HEAD как есть (пояснение к A11: индекс
      // ДЛЯ ЭТИХ путей git затем застейджит — см. commitPathspec/A11 в repo.ts).
      const outcome = commitPathspec(state, message, matchedFiles)
      // Защитный случай (outcome.ok === false): указанный путь совпадает с HEAD байт в байт,
      // коммитить для него нечего — на практике почти недостижим (нужен файл, не менявшийся
      // с последнего коммита). Готового пояснения для него нет — не выдумываем.
      const explanation = outcome.ok
        ? suspect
          ? ru.explain.commitAccidentalPathspec(message, matchedFiles)
          : ru.explain.commitExplicitPathspec(message, matchedFiles)
        : null
      return { state: outcome.state, result: { ok: outcome.ok, output: outcome.output, explanation } }
    }

    // message === null (нет -m): настоящий git commit <pathspec> без -m открыл бы текстовый
    // редактор, чтобы запросить сообщение — в песочнице редактора нет (тот же принцип, что
    // и в ветке "message === null" ниже, для формы без pathspec). Это осознанное сужение
    // раздела 1 (target.md, уточнение к A8), а не попытка изобразить редактор.
    return fail(state, ru.errors.commitPathNotSupported, null)
  }

  // target.md, часть III, правило 1 (пункт 2): "-a" автоматически стейджит модификации/удаления
  // только УЖЕ ОТСЛЕЖИВАЕМЫХ файлов (тех, что есть в индексе, а не только в HEAD) — общее с
  // разделом 2 правило, см. commitFlags.ts, applyStageAll — там же разбор сценария A1
  // (коммит → удаление → git add → тот же файл пересоздан под тем же именем), из-за которого
  // "отслеживаемый" нельзя определять по объединению индекса и HEAD.
  const nextIndex: FileTree = stageAll ? applyStageAll(state.index, state.working) : { ...state.index }

  if (sameTree(head, nextIndex)) {
    // Важно: индекс ещё НЕ переключён на nextIndex (это происходит только перед реальным
    // commitFromIndex ниже) — статус в выводе и пояснении считается по текущему, неизменённому
    // состоянию, как в source.html (`friendlyCommit`: `repo.index = nextIndex` присваивается позже).
    const snapshot = getStatus(state)
    const kind = statusTailKind(snapshot)
    const explanation =
      kind === 'needsAddNotStaged' || kind === 'needsAddUntracked'
        ? ru.explain.commitNeedsAdd(representativeFileFor(snapshot, kind) ?? '')
        : kind === 'needsAddEmpty'
          ? ru.explain.commitNeedsAddGeneric
          : kind === 'clean'
            ? ru.explain.commitClean
            : null
    return fail(state, formatStatusFriendly(state), explanation)
  }

  if (message === null) {
    // target.md, часть III, правило 2: настоящий git без -m открывает текстовый редактор; если
    // редактор закрыть, не оставив сообщения (а в песочнице сообщение взять неоткуда —
    // редактора нет), git печатает ровно эту строку, буквально и по-английски (проверено
    // напрямую: GIT_EDITOR=true git commit → "Aborting commit due to empty commit message.").
    return fail(state, 'Aborting commit due to empty commit message.', ru.explain.commitAborting)
  }

  const staged = { ...state, index: nextIndex }
  const outcome = commitFromIndex(staged, message)
  if (!outcome.ok) {
    // Пояснение к отказу repo.commit(): message === '' — сообщение было передано явно (-m ""),
    // но пустое (никакого редактора git тут не открывает — сообщение уже дано); либо (защитный,
    // на практике недостижимый при уже пройденной проверке sameTree выше) случай "нечего коммитить".
    const explanation = /clean$/.test(outcome.output) ? ru.explain.commitClean : ru.explain.commitAbortingEmptyMessage
    return fail(state, outcome.output, explanation)
  }
  return ok(outcome.state, outcome.output, ru.explain.commitSuccess)
}

// ---------- git init ----------

function handleInit(state: SectionState): { state: SectionState; result: CommandResult } {
  const r = initRepo(state)
  const explanation = r.reinitialized ? ru.explain.initReinit : ru.explain.initNew
  return { state: r.state, result: { ok: r.ok, output: r.output, explanation } }
}

// ---------- диспетчер ----------

function appendCommand(state: SectionState, rawInput: string, result: CommandResult): SectionState {
  return {
    ...state,
    history: [...state.history, { kind: 'command', input: rawInput, ok: result.ok, output: result.output, explanation: result.explanation }],
  }
}

/**
 * Выполняет одну строку терминала раздела 1. Ничего не бросает: любой недопустимый
 * ввод превращается в предусмотренный отказ (см. границы задачи).
 *
 * Разбор — в два этапа (target.md, «Граница: где шелл, а где git»): сначала shellTokenize
 * (см. shell.ts) разбивает строку на слова, снимает кавычки, раскрывает "*"; дальше этот
 * диспетчер и обработчики ниже работают с уже готовым списком аргументов и о том, как он
 * получился, ничего не знают.
 *
 * @returns новое состояние и результат команды; `result === null` означает, что строка
 * была пустой/пробельной — история не меняется, ничего не произошло (spec 2.5, S1-73).
 */
export function executeCommand(state: SectionState, rawInput: string): { state: SectionState; result: CommandResult | null } {
  if (!rawInput.trim()) return { state, result: null }

  const tokens = shellTokenize(rawInput, Object.keys(state.working))
  const words = tokens.map((t) => t.text)

  if (words[0] !== 'git') {
    const r = fail(state, ru.errors.bashCommandNotFound(words[0] ?? ''), null)
    return { state: appendCommand(state, rawInput, r.result), result: r.result }
  }

  // target.md, часть III, правило 1: маску вроде "*.html" раскрыл бы bash, а не git — этот
  // шелл раскрывает только голую "*" целиком словом (см. shell.ts). Проверяется до того, как
  // git вообще увидит аргументы, — это факт о шелле, не о конкретной git-подкоманде.
  const badGlob = tokens.slice(1).find((t) => t.unsupportedGlob)
  if (badGlob) {
    const r = fail(state, ru.errors.shellGlobUnsupported(badGlob.text), null)
    return { state: appendCommand(state, rawInput, r.result), result: r.result }
  }

  const sub = words[1]
  if (sub === undefined) {
    // B2: настоящий git без аргументов завершается отказом (usage, код возврата 1).
    const r = fail(state, ru.errors.gitUsageNoArgs, null)
    return { state: appendCommand(state, rawInput, r.result), result: r.result }
  }
  // target.md, часть III, правило 1 (пункт 3): опции самого git ДО имени подкоманды
  // ("--version", "--help", "-h", "-C", "-c", …) — реальные флаги git (git(1) SYNOPSIS,
  // см. scope.ts, GLOBAL_GIT_OPTIONS), не подкоманды, поэтому не попадают под классификацию
  // имени подкоманды ниже: git.c на неизвестную ОПЦИЮ отвечает "unknown option: %s", а вовсе
  // не "is not a git command" (это сообщение только про имя команды, см. help.c) — раздел 1
  // не должен изображать чужую ошибку там, где эта опция на самом деле существует.
  if (isGlobalGitOption(sub)) {
    const r = fail(state, ru.errors.commandOutOfScope(sub), null)
    return { state: appendCommand(state, rawInput, r.result), result: r.result }
  }

  // target.md, A9/A10, часть III правило 1: имя подкоманды классифицируется на три случая
  // ДО того, есть ли репозиторий, — ровно как у настоящего git (ни "команды не существует",
  // ни "команда реальная, но раздел её не разбирает" от .git не зависят).
  if (!isSectionCommand(sub)) {
    if (REAL_GIT_COMMANDS.has(sub)) {
      const r = fail(state, ru.errors.commandOutOfScope(sub), null)
      return { state: appendCommand(state, rawInput, r.result), result: r.result }
    }
    const r = fail(state, gitNotACommand(sub), null)
    return { state: appendCommand(state, rawInput, r.result), result: r.result }
  }

  // С этой точки sub — гарантированно одна из SECTION_SCOPE.commands (init/status/add/commit).
  // Это единственные команды раздела 1, которым вообще нужен репозиторий (кроме init).
  if (sub !== 'init' && !state.initialized) {
    const r = fail(state, 'fatal: not a git repository (or any of the parent directories): .git', ru.explain.notAGitRepo)
    return { state: appendCommand(state, rawInput, r.result), result: r.result }
  }

  let outcome: { state: SectionState; result: CommandResult }
  switch (sub) {
    case 'init':
      outcome = handleInit(state)
      break
    case 'status': {
      const { flags, args } = splitArgs(words.slice(2))
      outcome = handleStatus(state, flags, args)
      break
    }
    case 'add':
      outcome = handleAdd(state, words.slice(2))
      break
    case 'commit':
      outcome = handleCommit(state, tokens.slice(2))
      break
  }
  return { state: appendCommand(outcome.state, rawInput, outcome.result), result: outcome.result }
}
