// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): git-сторона разбора
// командной строки (log/diff/show/status). По архитектуре — прямой аналог
// commands.ts/branchCommands.ts, но для своей модели данных (inspectTypes.ts/
// inspectRepo.ts) и своего набора команд (inspectScope.ts). Разделы 1 и 2
// этот файл не трогает и не импортирует из них ничего, кроме уже
// экспортированных данных о настоящем git (inspectScope.ts → branchScope.ts
// → scope.ts).
//
// Строки вида "fatal: …", "error: …", "usage: …" — буквальный вывод
// настоящего git, сверенный запуском git 2.53.0 во временном каталоге
// 26.09.2026 — не переводятся и не идут в словарь (как и в разделах 1–2).
// ============================================================
import type { CommandResult, FileTree, InspectState } from './inspectTypes'
import {
  commitChain,
  commitTouchesFile,
  commitTree,
  currentTip,
  formatInspectStatus,
  formatInspectStatusShort,
  getCommit,
  headTree,
  rangeCommits,
  resolveRef,
  trackedWorking,
} from './inspectRepo'
import { diffBetween, diffNameOnly, diffStat } from './inspectDiff'
import { classifyPathspec, classifyRefToken, gitUnrecognizedArgument, INSPECT_REF_GRAMMAR } from './outOfScopeForms'
import { classifySection3Option, gitNotACommand, statusClusterFault, isGlobalGitOption, isSection3Command, REAL_GIT_COMMANDS } from './inspectScope'
import { findShellRefusal, shellRefusalText, shellTokenize } from './shell'
import { has } from './util'
import { ru } from '../locales/ru'

function ok(state: InspectState, output: string, explanation: string | null = null): { state: InspectState; result: CommandResult } {
  return { state, result: { ok: true, output, explanation } }
}
function fail(state: InspectState, output: string, explanation: string | null = null): { state: InspectState; result: CommandResult } {
  return { state, result: { ok: false, output, explanation } }
}

const ie = ru.inspecting.errors

/** Буквальный текст настоящего git на ссылку/путь, которые ничему не соответствуют (target.md, часть V — S3-08/S3-23/S3-31 и т.п.; сверено напрямую, git 2.53.0). */
function ambiguousArgument(token: string): string {
  return `fatal: ambiguous argument '${token}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`
}

/** Первая строка настоящего usage-блока `git diff` (S3-27) — как и в остальных местах движка, печатается только первая строка, не весь блок (тот же приём, что и в commands.ts/branchCommands.ts для usage/unknown-option). */
const DIFF_USAGE_LINE = 'usage: git diff [<options>] [<commit>] [--] [<path>...]'

function unknownLongOption(token: string): string {
  const bare = token.split('=')[0]
  return `error: unknown option \`${bare.slice(2)}'`
}
/** Короткий флаг status: виновна одна буква (или имя длинной опции после `-`), а не весь хвост (`-Z9` → `Z`). */
function unknownShortOption(token: string): string {
  const fault = statusClusterFault(token)
  if (fault === null) return `error: unknown switch \`${token.slice(1)}'`
  return `error: unknown ${fault.kind === 'option' ? 'option' : 'switch'} \`${fault.text}'`
}

/** Классифицирует один флаг команды `cmd` и, если это не «в области», сразу строит готовый отказ — общая часть для log/diff/show/status. `null`, если флаг в области (вызывающий код сам решает, что с ним делать). */
function rejectFlag(cmd: 'log' | 'diff' | 'show' | 'status', scopeFlags: readonly string[], usagePrefix: string, allowed: string, token: string): string | null {
  const cls = classifySection3Option(cmd, scopeFlags, token)
  if (cls === 'scope') return null
  if (cls === 'outOfScope') return ie.optionOutOfScope(`${usagePrefix} ${token}`, allowed)
  // Заведомо несуществующая опция: у каждой команды git свой текст (проверено на git 2.53.0).
  if (cmd === 'log' || cmd === 'show') return gitUnrecognizedArgument(token)
  if (cmd === 'diff') return `error: invalid option: ${token}\n${DIFF_USAGE_LINE}`
  return token.startsWith('--') ? unknownLongOption(token) : unknownShortOption(token)
}

/**
 * Позиционный аргумент, который git принимает, а раздел 3 не разбирает: выражение ревизии вне
 * грамматики раздела (`HEAD@{1}`, `HEAD^2`, `HEAD~1..`, `HEAD:файл`) или форма пути (`./файл`,
 * `../x`, глоб, магия pathspec). `null` — аргумент обычный: если его не нашли, это настоящая
 * ошибка git (`nosuch`, `HEAD~3` за корнем, `a..b` с несуществующими именами).
 */
function foreignArgument(token: string): boolean {
  return classifyRefToken(token, INSPECT_REF_GRAMMAR) === 'foreign' || classifyPathspec(token, { globs: false }) === 'foreign'
}

// ---------- разбор одной позиционной ссылки: ref / A..B / A...B / pathspec / не найдено ----------

type SingleRefResolution =
  | { kind: 'ref'; id: string }
  | { kind: 'range'; fromId: string; toId: string }
  | { kind: 'tripleDot' }
  | { kind: 'unresolved' }

/** Пытается разобрать токен как ссылку ИЛИ диапазон "A..B" (без попытки трактовать его как pathspec — это отдельный, следующий шаг у вызывающего кода, см. handleLog/handleDiff). */
function resolveRefOrRange(state: InspectState, token: string): SingleRefResolution {
  if (token.includes('...')) return { kind: 'tripleDot' }
  const direct = resolveRef(state, token)
  if (direct !== null) return { kind: 'ref', id: direct }
  const dotsAt = token.indexOf('..')
  if (dotsAt !== -1) {
    const a = token.slice(0, dotsAt)
    const b = token.slice(dotsAt + 2)
    if (a && b) {
      const fromId = resolveRef(state, a)
      const toId = resolveRef(state, b)
      if (fromId !== null && toId !== null) return { kind: 'range', fromId, toId }
    }
    return { kind: 'unresolved' }
  }
  return { kind: 'unresolved' }
}

// ---------- git log ----------

function onelineEntry(state: InspectState, id: string): string {
  return `${id} ${getCommit(state, id)?.message ?? ''}`
}
function longEntry(state: InspectState, id: string): string {
  return `commit ${id}\n\n    ${getCommit(state, id)?.message ?? ''}`
}

const LOG_ALLOWED = 'git log, -n <N> / -<N>, --oneline, ссылка, A..B, <файл>, -- <файл>'

/**
 * `git log` (target.md, часть V, «История»/«История части»/«История файла»). Разбирает: голый
 * вызов, `-n <N>`/`-<N>` (в т.ч. приклеенное `-n2`), `--oneline`, одну позиционную ссылку (ref,
 * `A..B`), `<файл>`/`-- <файл>` (история файла). Всё остальное — по правилу области (target.md,
 * часть III, правило 1): реальный флаг/сценарий вне области (`--graph`, несколько ссылок и т.п.)
 * получает честный второй ответ, а не молчаливое игнорирование.
 */
function handleLog(state: InspectState, tokens: string[]): { state: InspectState; result: CommandResult } {
  const sepIdx = tokens.indexOf('--')
  const preTokens = sepIdx === -1 ? tokens : tokens.slice(0, sepIdx)
  const pathTokens = sepIdx === -1 ? [] : tokens.slice(sepIdx + 1)

  let oneline = false
  let limit: number | null = null
  const positionals: string[] = []

  for (let i = 0; i < preTokens.length; i++) {
    const t = preTokens[i]
    if (t === '--oneline') {
      oneline = true
      continue
    }
    if (t === '-n') {
      const value = preTokens[i + 1]
      if (value === undefined) return fail(state, 'error: -n requires an argument')
      const n = Number(value)
      if (!/^-?\d+$/.test(value) || Number.isNaN(n)) return fail(state, `fatal: '${value}': not an integer`)
      limit = n
      i++
      continue
    }
    const gluedN = /^-n(.+)$/.exec(t)
    if (gluedN) {
      const value = gluedN[1]
      const n = Number(value)
      if (!/^-?\d+$/.test(value) || Number.isNaN(n)) return fail(state, `fatal: '${value}': not an integer`)
      limit = n
      continue
    }
    const bareCount = /^-(\d+)$/.exec(t)
    if (bareCount) {
      limit = parseInt(bareCount[1], 10)
      continue
    }
    if (t.startsWith('-')) {
      const rejection = rejectFlag('log', ['--oneline'], 'git log', LOG_ALLOWED, t)
      if (rejection !== null) return fail(state, rejection)
      continue
    }
    positionals.push(t)
  }

  if (positionals.length > 1) return fail(state, ie.optionOutOfScope(`git log ${positionals.join(' ')}`, LOG_ALLOWED))
  if (pathTokens.length > 1) return fail(state, ie.optionOutOfScope(`git log -- ${pathTokens.join(' ')}`, LOG_ALLOWED))

  const foreignPath = pathTokens.find((p) => classifyPathspec(p, { globs: false }) === 'foreign')
  if (foreignPath !== undefined) return fail(state, ie.optionOutOfScope(`git log -- ${foreignPath}`, LOG_ALLOWED))
  let chain: string[]
  let pathFilter: string | null = pathTokens.length === 1 ? pathTokens[0] : null

  if (positionals.length === 1) {
    const token = positionals[0]
    const resolved = resolveRefOrRange(state, token)
    if (resolved.kind === 'tripleDot') return fail(state, ie.optionOutOfScope(`git log ${token}`, LOG_ALLOWED))
    if (resolved.kind === 'range') chain = rangeCommits(state, resolved.fromId, resolved.toId)
    else if (resolved.kind === 'ref') chain = commitChain(state, resolved.id)
    else if (foreignArgument(token)) return fail(state, ie.optionOutOfScope(`git log ${token}`, LOG_ALLOWED))
    else if (pathTokens.length === 0 && has(state.working, token)) {
      pathFilter = token
      chain = commitChain(state, currentTip(state))
    } else {
      return fail(state, ambiguousArgument(token))
    }
  } else {
    chain = commitChain(state, currentTip(state))
  }

  if (pathFilter !== null) chain = chain.filter((id) => commitTouchesFile(state, id, pathFilter as string))
  if (limit !== null) chain = chain.slice(0, Math.max(0, limit))

  const output = oneline ? chain.map((id) => onelineEntry(state, id)).join('\n') : chain.map((id) => longEntry(state, id)).join('\n\n')
  return ok(state, output)
}

// ---------- git diff ----------

const DIFF_ALLOWED = 'git diff, --staged/--cached, HEAD, коммит, A B, A..B, <файл>, -- <файл>, --stat, --name-only'

function diffPair(state: InspectState, staged: boolean): { left: FileTree; right: FileTree } {
  return staged ? { left: headTree(state), right: state.index } : { left: state.index, right: trackedWorking(state) }
}

function handleDiff(state: InspectState, tokens: string[]): { state: InspectState; result: CommandResult } {
  const sepIdx = tokens.indexOf('--')
  const preTokens = sepIdx === -1 ? tokens : tokens.slice(0, sepIdx)
  const pathTokens = sepIdx === -1 ? [] : tokens.slice(sepIdx + 1)

  let staged = false
  let stat = false
  let nameOnly = false
  const positionals: string[] = []

  for (const t of preTokens) {
    if (t === '--staged' || t === '--cached') {
      staged = true
      continue
    }
    if (t === '--stat') {
      stat = true
      continue
    }
    if (t === '--name-only') {
      nameOnly = true
      continue
    }
    if (t.startsWith('-')) {
      const rejection = rejectFlag('diff', ['--staged', '--cached', '--stat', '--name-only'], 'git diff', DIFF_ALLOWED, t)
      if (rejection !== null) return fail(state, rejection)
      continue
    }
    positionals.push(t)
  }

  if (pathTokens.length > 1) return fail(state, ie.optionOutOfScope(`git diff -- ${pathTokens.join(' ')}`, DIFF_ALLOWED))
  const explicitPathspec = pathTokens.length === 1 ? pathTokens[0] : null
  if (explicitPathspec !== null && classifyPathspec(explicitPathspec, { globs: false }) === 'foreign') {
    return fail(state, ie.optionOutOfScope(`git diff -- ${explicitPathspec}`, DIFF_ALLOWED))
  }

  if (staged && positionals.length >= 2) return fail(state, DIFF_USAGE_LINE)

  let left: FileTree
  let right: FileTree
  let pathFilter: string | null = explicitPathspec

  if (positionals.length === 0) {
    const pair = diffPair(state, staged)
    left = pair.left
    right = pair.right
  } else if (positionals.length === 1) {
    const token = positionals[0]
    const resolved = resolveRefOrRange(state, token)
    if (resolved.kind === 'tripleDot') return fail(state, ie.optionOutOfScope(`git diff ${token}`, DIFF_ALLOWED))
    if (resolved.kind === 'range') {
      if (staged) return fail(state, DIFF_USAGE_LINE)
      left = commitTree(state, resolved.fromId)
      right = commitTree(state, resolved.toId)
    } else if (resolved.kind === 'ref') {
      if (staged) return fail(state, ie.optionOutOfScope(`git diff --staged ${token}`, DIFF_ALLOWED))
      left = commitTree(state, resolved.id)
      right = trackedWorking(state)
    } else if (foreignArgument(token)) {
      return fail(state, ie.optionOutOfScope(`git diff ${token}`, DIFF_ALLOWED))
    } else if (pathTokens.length === 0 && has(state.working, token)) {
      pathFilter = token
      const pair = diffPair(state, staged)
      left = pair.left
      right = pair.right
    } else {
      return fail(state, ambiguousArgument(token))
    }
  } else if (positionals.length === 2) {
    const [a, b] = positionals
    const idA = resolveRef(state, a)
    const idB = resolveRef(state, b)
    if (idA === null || idB === null) return fail(state, ie.optionOutOfScope(`git diff ${a} ${b}`, DIFF_ALLOWED))
    left = commitTree(state, idA)
    right = commitTree(state, idB)
  } else {
    return fail(state, ie.optionOutOfScope(`git diff ${positionals.join(' ')}`, DIFF_ALLOWED))
  }

  const files = pathFilter !== null ? [pathFilter] : undefined
  let output: string
  if (nameOnly) output = diffNameOnly(left, right, files)
  else if (stat) output = diffStat(left, right, files)
  else output = diffBetween(left, right, files)

  const explanation = output === '' ? ru.inspecting.explain.diffEmpty : null
  return ok(state, output, explanation)
}

// ---------- git show ----------

const SHOW_ALLOWED = 'git show, git show <ссылка>'

function handleShow(state: InspectState, tokens: string[]): { state: InspectState; result: CommandResult } {
  const positionals: string[] = []
  for (const t of tokens) {
    if (t.startsWith('-')) {
      const rejection = rejectFlag('show', [], 'git show', SHOW_ALLOWED, t)
      if (rejection !== null) return fail(state, rejection)
      continue
    }
    positionals.push(t)
  }
  if (positionals.length > 1) return fail(state, ie.optionOutOfScope(`git show ${positionals.join(' ')}`, SHOW_ALLOWED))

  let id: string
  if (positionals.length === 0) {
    id = currentTip(state)
  } else {
    const token = positionals[0]
    const resolved = resolveRefOrRange(state, token)
    if (resolved.kind === 'ref') id = resolved.id
    else if (resolved.kind === 'range' || resolved.kind === 'tripleDot') return fail(state, ie.optionOutOfScope(`git show ${token}`, SHOW_ALLOWED))
    else if (has(state.working, token) || foreignArgument(token)) return fail(state, ie.optionOutOfScope(`git show ${token}`, SHOW_ALLOWED))
    else return fail(state, ambiguousArgument(token))
  }

  const commit = getCommit(state, id)
  if (!commit) return fail(state, ambiguousArgument(positionals[0] ?? id))
  const parentTree = commit.parentId ? commitTree(state, commit.parentId) : {}
  const diffText = diffBetween(parentTree, commit.tree)
  const header = `commit ${id}\n\n    ${commit.message}`
  const output = diffText ? `${header}\n\n${diffText}` : header
  return ok(state, output)
}

// ---------- git status ----------

const STATUS_ALLOWED = 'git status, git status -s / --short'

function handleStatus(state: InspectState, tokens: string[]): { state: InspectState; result: CommandResult } {
  const afterSeparator = tokens[0] === '--'
  const rest = afterSeparator ? tokens.slice(1) : tokens
  let short = false
  const paths: string[] = []

  for (const t of rest) {
    if (!afterSeparator && (t === '-s' || t === '--short')) {
      short = true
      continue
    }
    if (!afterSeparator && t.startsWith('-')) {
      const rejection = rejectFlag('status', ['-s', '--short'], 'git status', STATUS_ALLOWED, t)
      if (rejection !== null) return fail(state, rejection)
      continue
    }
    paths.push(t)
  }
  if (paths.length) return fail(state, ie.optionOutOfScope(`git status ${paths.join(' ')}`, STATUS_ALLOWED))
  return ok(state, short ? formatInspectStatusShort(state) : formatInspectStatus(state))
}

// ---------- диспетчер ----------

function appendCommand(state: InspectState, rawInput: string, result: CommandResult): InspectState {
  return {
    ...state,
    history: [...state.history, { kind: 'command', input: rawInput, ok: result.ok, output: result.output, explanation: result.explanation }],
  }
}

/**
 * Выполняет одну строку терминала раздела 3. Та же двухэтапная граница «шелл/git», что и в
 * разделах 1–2 (shellTokenize уже снял кавычки и раскрыл голую "*" — см. shell.ts); ничего не
 * бросает — любой недопустимый ввод превращается в предусмотренный отказ.
 */
export function executeInspectCommand(state: InspectState, rawInput: string): { state: InspectState; result: CommandResult | null } {
  if (!rawInput.trim()) return { state, result: null }

  const tokens = shellTokenize(rawInput, Object.keys(state.working))
  const words = tokens.map((t) => t.text)

  function respond(pair: { state: InspectState; result: CommandResult }) {
    return { state: appendCommand(pair.state, rawInput, pair.result), result: pair.result }
  }

  const refusal = findShellRefusal(rawInput)
  if (refusal) return respond(fail(state, shellRefusalText(refusal), null))

  if (words[0] !== 'git') return respond(fail(state, ru.errors.bashCommandNotFound(words[0] ?? ''), null))

  const badGlob = tokens.slice(1).find((t) => t.unsupportedGlob)
  if (badGlob) return respond(fail(state, ru.errors.shellGlobUnsupported(badGlob.text), null))

  const sub = words[1]
  if (sub === undefined) return respond(fail(state, ie.gitUsageNoArgs, null))
  if (isGlobalGitOption(sub)) return respond(fail(state, ie.commandOutOfScope(sub), null))

  if (!isSection3Command(sub)) {
    if (REAL_GIT_COMMANDS.has(sub)) return respond(fail(state, ie.commandOutOfScope(sub), null))
    return respond(fail(state, gitNotACommand(sub), null))
  }

  let outcome: { state: InspectState; result: CommandResult }
  switch (sub) {
    case 'log':
      outcome = handleLog(state, words.slice(2))
      break
    case 'diff':
      outcome = handleDiff(state, words.slice(2))
      break
    case 'show':
      outcome = handleShow(state, words.slice(2))
      break
    case 'status':
      outcome = handleStatus(state, words.slice(2))
      break
  }
  return respond(outcome)
}
