// ============================================================
// Раздел 6 git-тренажёра, шаг A («Проект»): git-сторона разбора командной
// строки (grep/blame/show/log). По архитектуре — аналог inspectCommands.ts
// (раздел 3), но для своей модели (searchTypes.ts/searchRepo.ts) и своего
// набора команд (searchScope.ts). Разделы 1–5 этот файл не трогает.
//
// Строки вида "fatal: …", "error: …", "usage: …" — буквальный вывод настоящего
// git, сверенный запуском git 2.53.0 во временном каталоге 26.09.2026
// (docs/git-trainer/reports/section6-git-runs.txt) — не переводятся и не идут
// в словарь (как и в разделах 1–3).
// ============================================================
import type { CommandResult, SearchState } from './searchTypes'
import {
  commitChain,
  commitTouchesFile,
  commitTree,
  currentTip,
  formatGitLongDate,
  getCommit,
  headTree,
  isTrackedIn,
  resolveSearchRef,
} from './searchRepo'
import { computeBlame, formatBlame } from './searchBlame'
import {
  INSPECT_REF_GRAMMAR,
  SEARCH_REF_GRAMMAR,
  classifyBlameForm,
  classifyPathspec,
  classifyRefToken,
} from './outOfScopeForms'
import { compilePattern, grepTree, type BreErrorKind } from './searchGrep'
import {
  BLAME_KNOWN_OUT_OF_SCOPE,
  BLAME_SCORE_OPTION,
  BLAME_USAGE,
  GREP_KNOWN_OUT_OF_SCOPE,
  GREP_NUM_SHORTCUT,
  GREP_USAGE,
  REAL_GIT_COMMANDS,
  gitNotACommand,
  isBisectCommand,
  isGlobalGitOption,
  isSection6ACommand,
} from './searchScope'
import { findUnquotedShellMeta } from './searchShell'
import { shellTokenize } from './shell'
import { diffBetween } from './inspectDiff'
import { ru } from '../locales/ru'

const se = ru.searching.errors
const sx = ru.searching.explain

function ok(state: SearchState, output: string, explanation: string | null = null, exitCode = 0): { state: SearchState; result: CommandResult } {
  return { state, result: { ok: true, output, explanation, exitCode } }
}
function fail(state: SearchState, output: string, explanation: string | null = null, exitCode?: number): { state: SearchState; result: CommandResult } {
  return { state, result: { ok: false, output, explanation, exitCode } }
}

/** Буквальный текст настоящего git на ссылку/путь, которые ничему не соответствуют (target.md, опасное место 7; сверено напрямую, git 2.53.0). */
function ambiguousArgument(token: string): string {
  return `fatal: ambiguous argument '${token}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`
}

/**
 * Позиционный аргумент, который git принимает, а раздел 6 не разбирает: выражение ревизии вне
 * грамматики раздела (`HEAD@{0}`, `HEAD^2`, `ревизия:путь`, `..`) или форма пути (`./x`, `../x`,
 * глоб, магия pathspec). Обычное имя — нет: его отсутствие остаётся настоящей ошибкой git.
 */
function isForeignArgument(token: string, grammar: typeof SEARCH_REF_GRAMMAR): boolean {
  return classifyRefToken(token, grammar) === 'foreign' || classifyPathspec(token, { globs: false }) === 'foreign'
}

// ---------- git grep ----------

const GREP_ALLOWED = 'git grep <шаблон>, -n, -i, -ni, -l, -c, -w, -F, <шаблон> <файл>, <шаблон> -- <файл>…, <шаблон> <ссылка> [-- <файл>]'

/** Однобуквенные ключи из GREP_KNOWN_OUT_OF_SCOPE (searchScope.ts) — для разбора кластеров вроде "-nE" (target.md — второй ответ правила 1, а не "unknown switch"). */
const GREP_SHORT_OUT_OF_SCOPE = new Set(
  GREP_KNOWN_OUT_OF_SCOPE.filter((o) => o.length === 2 && o[0] === '-').map((o) => o[1]),
)

interface GrepFlags {
  n: boolean
  i: boolean
  l: boolean
  c: boolean
  w: boolean
  F: boolean
}

type GrepFlagParse = { kind: 'flags'; flags: GrepFlags } | { kind: 'outOfScope'; usageToken: string } | { kind: 'unknown'; token: string }

/** Разбирает один токен-флаг `git grep` — одиночный или кластер коротких букв (`-ni`, target.md: «`-ni Debounce` → те же 2 строки»). Останавливается на первой проблемной букве кластера, как и настоящий getopt. */
function parseGrepFlagToken(token: string): GrepFlagParse {
  if (token.startsWith('--')) {
    const bare = token.split('=')[0]
    if (GREP_KNOWN_OUT_OF_SCOPE.includes(bare)) return { kind: 'outOfScope', usageToken: token }
    // Однозначный префикс или отрицание известной опции git принимает (parse-options.c).
    if (bare.length > 2 && GREP_KNOWN_OUT_OF_SCOPE.some((o) => o.startsWith(bare) || o === '--' + bare.slice('--no-'.length) && bare.startsWith('--no-'))) {
      return { kind: 'outOfScope', usageToken: token }
    }
    return { kind: 'unknown', token }
  }
  // "-NUM" — сокращение "-C NUM" (searchScope.ts, GREP_NUM_SHORTCUT), не кластер букв.
  if (GREP_NUM_SHORTCUT.test(token)) return { kind: 'outOfScope', usageToken: token }
  const flags: GrepFlags = { n: false, i: false, l: false, c: false, w: false, F: false }
  for (const ch of token.slice(1)) {
    if (ch === 'n') flags.n = true
    else if (ch === 'i') flags.i = true
    else if (ch === 'l') flags.l = true
    else if (ch === 'c') flags.c = true
    else if (ch === 'w') flags.w = true
    else if (ch === 'F') flags.F = true
    else if (GREP_SHORT_OUT_OF_SCOPE.has(ch)) return { kind: 'outOfScope', usageToken: `-${ch}` }
    else return { kind: 'unknown', token: `-${ch}` }
  }
  return { kind: 'flags', flags }
}

function unknownGrepOption(token: string): string {
  if (token.startsWith('--')) return `error: unknown option \`${token.slice(2).split('=')[0]}'`
  return `error: unknown switch \`${token.slice(1)}'`
}

/** Буквальный текст ошибки BRE (target.md, опасное место 2 — сверено напрямую, git 2.53.0). `outOfScope` сюда не попадает — вызывающий код (handleGrep) обрабатывает его отдельно (это не вывод git, а честный отказ, правило 2). */
function grepPatternFatal(pattern: string, kind: Exclude<BreErrorKind, 'outOfScope'>): string {
  const label: Record<Exclude<BreErrorKind, 'outOfScope'>, string> = {
    trailingBackslash: 'Trailing backslash',
    invalidRegex: 'Invalid regular expression',
    invalidRangeEnd: 'Invalid range end',
    unmatchedParen: 'Unmatched ( or \\(',
  }
  return `fatal: command line, '${pattern}': ${label[kind]}`
}

/** Пояснение про кавычки (target.md, опасное место 1): показывается, только если шаблон был взят ровно в двойные кавычки и сам кавычек не содержит — иначе неоткуда быть путанице «что ввёл — что получил git». Упрощение: определяется текстовым совпадением `"<шаблон>"` в сырой строке ввода, а не разбором позиций токенов (см. отчёт о переносе, «список упрощений»). */
function quotesExplanation(rawInput: string, pattern: string): string | null {
  if (pattern.includes('"')) return null
  return rawInput.includes(`"${pattern}"`) ? sx.quotesEatenByShell(pattern) : null
}

function handleGrep(state: SearchState, tokens: string[], rawInput: string): { state: SearchState; result: CommandResult } {
  const sepIdx = tokens.indexOf('--')
  const preTokens = sepIdx === -1 ? tokens : tokens.slice(0, sepIdx)
  const pathTokens = sepIdx === -1 ? [] : tokens.slice(sepIdx + 1)

  const flags: GrepFlags = { n: false, i: false, l: false, c: false, w: false, F: false }
  const positionals: string[] = []

  for (const t of preTokens) {
    if (t.startsWith('-') && t !== '-') {
      const parsed = parseGrepFlagToken(t)
      if (parsed.kind === 'outOfScope') return fail(state, se.optionOutOfScope(`git grep ${parsed.usageToken}`, GREP_ALLOWED))
      if (parsed.kind === 'unknown') return fail(state, `${unknownGrepOption(parsed.token)}\n${GREP_USAGE}`, null, 129)
      flags.n = flags.n || parsed.flags.n
      flags.i = flags.i || parsed.flags.i
      flags.l = flags.l || parsed.flags.l
      flags.c = flags.c || parsed.flags.c
      flags.w = flags.w || parsed.flags.w
      flags.F = flags.F || parsed.flags.F
      continue
    }
    positionals.push(t)
  }

  if (positionals.length === 0) return fail(state, 'fatal: no pattern given', null, 128)
  const pattern = positionals[0]
  const rest = positionals.slice(1)
  if (rest.length > 1) return fail(state, se.optionOutOfScope(`git grep ${positionals.join(' ')}`, GREP_ALLOWED))

  const workingTree = headTree(state)
  let refToken: string | null = null
  let refId: string | null = null
  let barePathFilter: string | null = null

  if (rest.length === 1) {
    const token = rest[0]
    const resolved = resolveSearchRef(state, token)
    if (resolved !== null) {
      refToken = token
      refId = resolved
    } else if (pathTokens.length === 0 && isTrackedIn(workingTree, token)) {
      barePathFilter = token
    } else if (isForeignArgument(token, SEARCH_REF_GRAMMAR)) {
      return fail(state, se.optionOutOfScope(`git grep ${positionals.join(' ')}`, GREP_ALLOWED))
    } else {
      return fail(state, ambiguousArgument(token), null, 128)
    }
  }
  // Формы путей после "--" (./x, ../x, глоб, магия pathspec) git принимает, раздел 6 не разбирает.
  const foreignPath = pathTokens.find((p) => classifyPathspec(p, { globs: false }) === 'foreign')
  if (foreignPath !== undefined) return fail(state, se.optionOutOfScope(`git grep -- ${foreignPath}`, GREP_ALLOWED))

  const searchTree = refId !== null ? commitTree(state, refId) : workingTree

  const compiled = compilePattern(pattern, { ignoreCase: flags.i, fixedStrings: flags.F, wordRegexp: flags.w })
  if (!compiled.ok) {
    if (compiled.kind === 'outOfScope') return fail(state, se.grepPatternOutOfScope(pattern))
    return fail(state, grepPatternFatal(pattern, compiled.kind), null, 128)
  }
  // target.md, «Что НЕ входит»: шаблон, совпадающий с пустой строкой (^$, ^, $, x* и подобные) —
  // правило области, проверяемое буквально так — не выполняем поиск, если это так.
  if (!flags.F && compiled.regex.test('')) return fail(state, se.grepPatternOutOfScope(pattern))

  const files = pathTokens.length ? pathTokens : barePathFilter ? [barePathFilter] : undefined
  const matches = grepTree(searchTree, compiled.regex, files)

  const prefix = refToken !== null ? `${refToken}:` : ''
  let output: string
  if (flags.l) {
    output = [...new Set(matches.map((m) => m.file))].map((f) => `${prefix}${f}`).join('\n')
  } else if (flags.c) {
    const counts = new Map<string, number>()
    matches.forEach((m) => counts.set(m.file, (counts.get(m.file) ?? 0) + 1))
    output = [...counts.entries()].map(([f, n]) => `${prefix}${f}:${n}`).join('\n')
  } else {
    output = matches.map((m) => `${prefix}${m.file}:${flags.n ? `${m.line}:` : ''}${m.content}`).join('\n')
  }

  let nextState = state
  if (refId === null) {
    const hasReadme4 = matches.some((m) => m.file === 'README.md' && m.line === 4)
    const hasUtils5 = matches.some((m) => m.file === 'utils.js' && m.line === 5)
    if (hasReadme4 && hasUtils5) nextState = { ...state, grepFoundDebounceScenario: true }
  }

  const explanation = quotesExplanation(rawInput, pattern)
  return ok(nextState, output, explanation, matches.length ? 0 : 1)
}

// ---------- git blame ----------

const BLAME_ALLOWED = 'git blame <файл>, -s, -L <n>,<m>, -L <n>'

function unknownBlameOption(token: string): string {
  return `error: unknown option \`${token}'`
}

function handleBlame(state: SearchState, tokens: string[]): { state: SearchState; result: CommandResult } {
  let sFlag = false
  let lRaw: string | null = null
  const positionals: string[] = []

  // Повтор -L и значение, слитное с -L, git принимает — раздел 6 не разбирает (проверка до разбора флагов).
  const lineRangeForm = classifyBlameForm(tokens, { isTrackedFile: () => false, isRevision: () => false })
  if (lineRangeForm === 'repeatedLineRange' || lineRangeForm === 'gluedLineRange') {
    return fail(state, se.optionOutOfScope(`git blame ${tokens.join(' ')}`, BLAME_ALLOWED))
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '-s') {
      sFlag = true
      continue
    }
    if (t === '-L') {
      lRaw = tokens[i + 1] ?? null
      i++
      continue
    }
    if (t.startsWith('-') && t !== '-') {
      const bare = t.startsWith('--') ? t.split('=')[0] : t
      const knownLong =
        bare.startsWith('--') &&
        bare.length > 2 &&
        BLAME_KNOWN_OUT_OF_SCOPE.some((o) => o.startsWith(bare) || (bare.startsWith('--no-') && o === '--' + bare.slice('--no-'.length)))
      if (BLAME_KNOWN_OUT_OF_SCOPE.includes(bare) || knownLong || BLAME_SCORE_OPTION.test(t)) return fail(state, se.optionOutOfScope(`git blame ${t}`, BLAME_ALLOWED))
      return fail(state, `${unknownBlameOption(t)}\n${BLAME_USAGE}`, null, 129)
    }
    positionals.push(t)
  }

  if (positionals.length === 0) return fail(state, BLAME_USAGE, null, 129)
  // Формы, которые git принимает, а раздел 6 не разбирает: повтор -L, значение слитно с -L,
  // ревизия перед файлом (в том числе HEAD@{N}), форма пути вне разбора. blame app.js utils.js
  // (оба — файлы) остаётся настоящей ошибкой git.
  const blameContext = {
    isTrackedFile: (n: string) => isTrackedIn(headTree(state), n),
    isRevision: (n: string) => resolveSearchRef(state, n) !== null,
  }
  const foreignBlame =
    classifyBlameForm(tokens, blameContext) !== null ||
    (positionals.length >= 2 && classifyRefToken(positionals[0], SEARCH_REF_GRAMMAR) === 'foreign') ||
    positionals.some((p) => classifyPathspec(p, { globs: false }) === 'foreign')
  if (foreignBlame) return fail(state, se.optionOutOfScope(`git blame ${tokens.join(' ')}`, BLAME_ALLOWED))
  if (positionals.length >= 2) return fail(state, `fatal: bad revision '${positionals[0]}'`, null, 128)

  const file = positionals[0]
  const tree = headTree(state)
  if (!isTrackedIn(tree, file)) return fail(state, `fatal: no such path '${file}' in HEAD`, null, 128)

  const full = computeBlame(state, currentTip(state), file)
  const totalLines = full.length

  let startLine = 1
  let endLine = totalLines
  if (lRaw !== null) {
    const m = lRaw.match(/^(\d+)(?:,(\d+))?$/)
    if (!m) return fail(state, se.optionOutOfScope(`git blame -L ${lRaw}`, BLAME_ALLOWED))
    let a = parseInt(m[1], 10)
    let b = m[2] !== undefined ? parseInt(m[2], 10) : totalLines
    if (a > b) {
      const tmp = a
      a = b
      b = tmp
    }
    if (a < 1) return fail(state, `fatal: -L invalid line number: ${a}`, null, 128)
    if (a > totalLines) return fail(state, `fatal: file ${file} has only ${totalLines} lines`, null, 128)
    startLine = a
    endLine = Math.min(b, totalLines)
  }

  const sliced = full.filter((l) => l.line >= startLine && l.line <= endLine)
  const output = formatBlame(state, sliced, { suppressAuthor: sFlag })

  let nextState = state
  if (sliced.some((l) => l.line === 5)) {
    nextState = sFlag ? { ...state, blameLine5Suppressed: true } : { ...state, blameLine5WithAuthor: true }
  }

  return ok(nextState, output)
}

// ---------- git show ----------

const SHOW_ALLOWED = 'git show, git show <ссылка>'

function handleShow(state: SearchState, tokens: string[]): { state: SearchState; result: CommandResult } {
  const positionals: string[] = []
  for (const t of tokens) {
    if (t.startsWith('-')) return fail(state, se.optionOutOfScope(`git show ${t}`, SHOW_ALLOWED))
    positionals.push(t)
  }
  if (positionals.length > 1) return fail(state, se.optionOutOfScope(`git show ${positionals.join(' ')}`, SHOW_ALLOWED))

  let id: string
  if (positionals.length === 0) {
    id = currentTip(state)
  } else {
    const token = positionals[0]
    const resolved = resolveSearchRef(state, token)
    if (resolved !== null) id = resolved
    else if (isTrackedIn(headTree(state), token) || isForeignArgument(token, SEARCH_REF_GRAMMAR)) return fail(state, se.optionOutOfScope(`git show ${token}`, SHOW_ALLOWED))
    else return fail(state, ambiguousArgument(token), null, 128)
  }

  const commit = getCommit(state, id)
  if (!commit) return fail(state, ambiguousArgument(positionals[0] ?? id), null, 128)

  const parentTree = commit.parentId ? commitTree(state, commit.parentId) : {}
  const diffText = diffBetween(parentTree, commit.tree)
  const header = `commit ${id}\nAuthor: ${commit.author} <${commit.email}>\nDate:   ${formatGitLongDate(commit.date)}\n\n    ${commit.message}`
  const output = diffText ? `${header}\n\n${diffText}` : header

  // Побочный канал миссии 2, второй вариант зачёта (target.md, «Миссии», п.2): показ ИМЕННО того
  // коммита, который blame назвал последним изменившим строку 5 (сейчас у app.js это единственный
  // такой коммит) — не завязано на конкретный id "жёстко", вычисляется по факту blame.
  const line5Owner = computeBlame(state, currentTip(state), 'app.js').find((l) => l.line === 5)?.commitId
  const nextState = line5Owner !== undefined && id === line5Owner ? { ...state, shownDatasetCommit: true } : state

  return ok(nextState, output)
}

// ---------- git log ----------

const LOG_ALLOWED = 'git log, --oneline, <файл>, --oneline <файл>'

function longLogEntry(state: SearchState, id: string): string {
  const c = getCommit(state, id)
  if (!c) throw new Error(`invariant: commit "${id}" not found`)
  return `commit ${id}\nAuthor: ${c.author} <${c.email}>\nDate:   ${formatGitLongDate(c.date)}\n\n    ${c.message}`
}

function oneLineEntry(state: SearchState, id: string): string {
  const c = getCommit(state, id)
  if (!c) throw new Error(`invariant: commit "${id}" not found`)
  return `${id.slice(0, 7)} ${c.message}`
}

function handleLog(state: SearchState, tokens: string[]): { state: SearchState; result: CommandResult } {
  let oneline = false
  const positionals: string[] = []

  for (const t of tokens) {
    if (t === '--oneline') {
      oneline = true
      continue
    }
    if (t.startsWith('-')) return fail(state, se.optionOutOfScope(`git log ${t}`, LOG_ALLOWED))
    positionals.push(t)
  }
  if (positionals.length > 1) return fail(state, se.optionOutOfScope(`git log ${positionals.join(' ')}`, LOG_ALLOWED))

  let chain = commitChain(state, currentTip(state))
  if (positionals.length === 1) {
    const file = positionals[0]
    if (!isTrackedIn(headTree(state), file)) {
      // Ревизия (ветка, HEAD~N, A..B, ..HEAD, HEAD@{N}) git принимает, раздел 6 историю по ревизиям
      // не разбирает. Несуществующее обычное имя и a..b с несуществующими именами — настоящая ошибка git.
      const sides = file.includes('..') ? file.split('..') : [file]
      const resolvable = sides.length > 0 && sides.every((s) => s !== '' && resolveSearchRef(state, s) !== null)
      if (resolvable || isForeignArgument(file, INSPECT_REF_GRAMMAR)) {
        return fail(state, se.optionOutOfScope(`git log ${file}`, LOG_ALLOWED))
      }
      return fail(state, ambiguousArgument(file), null, 128)
    }
    chain = chain.filter((id) => commitTouchesFile(state, id, file))
  }

  const output = oneline ? chain.map((id) => oneLineEntry(state, id)).join('\n') : chain.map((id) => longLogEntry(state, id)).join('\n\n')
  return ok(state, output)
}

// ---------- диспетчер ----------

function appendCommand(state: SearchState, rawInput: string, result: CommandResult): SearchState {
  return {
    ...state,
    history: [...state.history, { kind: 'command', input: rawInput, ok: result.ok, output: result.output, explanation: result.explanation }],
  }
}

/**
 * Выполняет одну строку терминала «Проект» (шаг A). Проверка на символы шелла вне области
 * (target.md, опасное место 3) — на СЫРОЙ строке, до разбора шеллом (shellTokenize): эти символы
 * (`( ) < > | ; &`) меняют, КАК бы bash вообще разбил командную строку на слова (перенаправление,
 * конвейер, список команд), поэтому модель "одно слово = один аргумент" (shell.ts) для них в
 * принципе неприменима — честный отказ раньше, чем tokenizer вообще попытался бы её применить.
 */
export function executeSearchCommand(state: SearchState, rawInput: string): { state: SearchState; result: CommandResult | null } {
  if (!rawInput.trim()) return { state, result: null }

  function respond(pair: { state: SearchState; result: CommandResult }) {
    return { state: appendCommand(pair.state, rawInput, pair.result), result: pair.result }
  }

  if (findUnquotedShellMeta(rawInput) !== null) return respond(fail(state, se.shellMetaUnsupported))

  const tokens = shellTokenize(rawInput, Object.keys(headTree(state)))
  const words = tokens.map((t) => t.text)

  if (words[0] !== 'git') return respond(fail(state, ru.errors.bashCommandNotFound(words[0] ?? '')))

  const badGlob = tokens.slice(1).find((t) => t.unsupportedGlob)
  if (badGlob) return respond(fail(state, ru.errors.shellGlobUnsupported(badGlob.text)))

  const sub = words[1]
  if (sub === undefined) return respond(fail(state, se.gitUsageNoArgs))
  if (isGlobalGitOption(sub)) return respond(fail(state, se.commandOutOfScope(sub)))

  if (!isSection6ACommand(sub)) {
    if (isBisectCommand(sub)) return respond(fail(state, se.bisectOtherTerminal))
    if (REAL_GIT_COMMANDS.has(sub)) return respond(fail(state, se.commandOutOfScope(sub)))
    return respond(fail(state, gitNotACommand(sub)))
  }

  let outcome: { state: SearchState; result: CommandResult }
  switch (sub) {
    case 'grep':
      outcome = handleGrep(state, words.slice(2), rawInput)
      break
    case 'blame':
      outcome = handleBlame(state, words.slice(2))
      break
    case 'show':
      outcome = handleShow(state, words.slice(2))
      break
    case 'log':
      outcome = handleLog(state, words.slice(2))
      break
  }
  return respond(outcome)
}
