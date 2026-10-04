// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): git-сторона разбора командной
// строки (add/commit/status/log/branch/reset/revert). По архитектуре — прямой
// аналог branchCommands.ts/inspectCommands.ts, но для своей модели данных
// (undoTypes.ts/undoRepo.ts) и своего набора команд (undoScope.ts). Разделы
// 1–3 этот файл не трогает и не импортирует из них ничего, кроме уже
// экспортированных данных о настоящем git и уже сверенной классификации
// флагов add/commit/status/branch (classifySection2Option, branchScope.ts —
// та же команда git даёт те же реальные флаги независимо от раздела) и log
// (classifySection3Option, inspectScope.ts).
//
// Строки вида "fatal: …", "error: …", "HEAD is now at …", usage-блоки —
// буквальный вывод настоящего git, сверенный напрямую запуском git 2.53.0 во
// временном каталоге 26.09.2026 (см. отчёт о переносе раздела 4).
//
// Диффстат после успешного commit/revert (" 1 file changed, N
// insertion(s)(+)…") и строка "Date:" в выводе revert — то же сознательное
// упрощение, что и в branchCommands.ts (см. её шапку, «то же сознательное
// упрощение, что и в repo.ts»): у настоящего git «Date:» появляется в
// выводе revert (сверено напрямую — обычный `git commit` его не печатает, а
// `git revert`/`git cherry-pick` печатают), но у тренажёра нет настоящего
// автора/времени (target.md, часть II, A5) — подделывать выдуманную дату
// нельзя (правило 2), поэтому строка просто не печатается, как и диффстат.
// ============================================================
import type { CommandResult, FileTree, UndoState } from './undoTypes'
import {
  applyTreeChange,
  checkSafety,
  commitTree,
  computeRevert,
  currentTip,
  formatUndoStatus,
  getCommit,
  headTree,
  resolveRef,
  resetToCommit,
  sameTree,
  undoCommitHash,
  unstagePaths,
  unstagedReport,
  indexDiffersFromHead,
  looksLikeUnimplementedRevisionExpression,
  type ResetMode,
  type SafetyBlock,
} from './undoRepo'
import {
  gitNotACommand,
  isGlobalGitOption,
  isResetMergeOrKeepFlag,
  isResetQuietFlag,
  isRevertConflictFlowFlag,
  isRevertMainlineFlag,
  isRevertNoCommitFlag,
  isSection4Command,
  REAL_GIT_COMMANDS,
  RESET_MODE_FLAGS,
  RESET_USAGE,
  REVERT_USAGE,
  classifyUndoOption,
} from './undoScope'
import { classifySection2Option } from './branchScope'
import { classifySection3Option } from './inspectScope'
import { classifyPathspec, classifyRefToken, gitUnrecognizedArgument, UNDO_REF_GRAMMAR } from './outOfScopeForms'
import type { ShellToken } from './shell'
import { shellTokenize } from './shell'
import { applyStageAll, buildCommitMessage, classifyCommitFlagToken, type CommitMessagePart } from './commitFlags'
import { has } from './util'
import { ru } from '../locales/ru'

function ok(state: UndoState, output: string, explanation: string | null = null): { state: UndoState; result: CommandResult } {
  return { state, result: { ok: true, output, explanation } }
}
function fail(state: UndoState, output: string, explanation: string | null = null): { state: UndoState; result: CommandResult } {
  return { state, result: { ok: false, output, explanation } }
}

const ue = ru.undo.errors

// ---------- git add (тот же минимальный набор, что и у раздела 2 — branchCommands.ts, handleAdd) ----------

const ADD_NOTHING_SPECIFIED =
  "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\n" +
  'hint: Disable this message with "git config set advice.addEmptyPathspec false"'

function addPaths(state: UndoState, paths: string[]): { state: UndoState; result: CommandResult } {
  if (!paths.length) return ok(state, ADD_NOTHING_SPECIFIED)

  if (paths.includes('.')) {
    const head = headTree(state)
    const files = new Set<string>([...Object.keys(state.working), ...Object.keys(state.index), ...Object.keys(head)])
    const nextIndex: FileTree = { ...state.index }
    files.forEach((f) => {
      if (has(state.working, f)) nextIndex[f] = state.working[f]
      else delete nextIndex[f]
    })
    return ok({ ...state, index: nextIndex }, '')
  }

  // Форма пути, которую git принимает, а раздел 4 не разбирает ("./x", "../x", глоб, магия pathspec).
  const foreignPath = paths.find((p) => classifyPathspec(p, { globs: false }) === 'foreign')
  if (foreignPath !== undefined) return fail(state, ue.optionOutOfScope(`git add ${foreignPath}`, 'git add <файл>, git add .'))
  const head = headTree(state)
  const knownToGit = new Set<string>([...Object.keys(state.working), ...Object.keys(state.index), ...Object.keys(head)])
  const notFound = paths.find((f) => !knownToGit.has(f))
  if (notFound !== undefined) return fail(state, `fatal: pathspec '${notFound}' did not match any files`)

  const nextIndex: FileTree = { ...state.index }
  paths.forEach((f) => {
    if (has(state.working, f)) nextIndex[f] = state.working[f]
    else delete nextIndex[f]
  })
  return ok({ ...state, index: nextIndex }, '')
}

function handleAdd(state: UndoState, args: string[]): { state: UndoState; result: CommandResult } {
  if (args[0] === '--') return addPaths(state, args.slice(1))
  if (!args.length) return ok(state, ADD_NOTHING_SPECIFIED)

  const flag = args.find((a) => a.startsWith('-'))
  if (flag) {
    const addAllowed = 'git add <файл>, git add .'
    const classified = classifySection2Option('add', flag)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output)
    if (classified.kind === 'ambiguous') return fail(state, ue.ambiguousAbbreviationOutOfScope(`git add ${flag}`, addAllowed))
    if (classified.kind === 'help') return fail(state, ue.helpOutOfScope(`git add ${flag}`, addAllowed))
    return fail(state, ue.optionOutOfScope(`git add ${classified.resolved}`, addAllowed))
  }
  return addPaths(state, args)
}

// ---------- git commit (тот же минимальный набор, что и у раздела 2 — branchCommands.ts, handleCommit) ----------

const COMMIT_ALLOWED = 'git commit -m "..."'

function commitOptionError(flag: string): CommandResult {
  const classified = classifySection2Option('commit', flag)
  if (classified.kind === 'unknown' || classified.kind === 'noValue') return { ok: false, output: classified.output, explanation: null }
  if (classified.kind === 'ambiguous') return { ok: false, output: ue.ambiguousAbbreviationOutOfScope(`git commit ${flag}`, COMMIT_ALLOWED), explanation: null }
  if (classified.kind === 'help') return { ok: false, output: ue.helpOutOfScope(`git commit ${flag}`, COMMIT_ALLOWED), explanation: null }
  return { ok: false, output: ue.optionOutOfScope(`git commit ${classified.resolved}`, COMMIT_ALLOWED), explanation: null }
}

function commitShortFlagIsReal(letter: string): boolean {
  return classifySection2Option('commit', '-' + letter).kind === 'real'
}

function handleCommit(state: UndoState, tokens: ShellToken[]): { state: UndoState; result: CommandResult } {
  let stageAll = false
  const messages: CommitMessagePart[] = []

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const classified = classifyCommitFlagToken(tok, commitShortFlagIsReal, commitOptionError)
    if (classified.kind === 'error') return { state, result: classified.result }
    if (classified.kind === 'separator') {
      const rest = tokens.slice(i + 1)
      if (!rest.length) break
      if (stageAll) return fail(state, `fatal: paths '${rest[0].text} ...' with -a does not make sense`)
      return fail(state, ue.optionOutOfScope('git commit -- <файл> (выборочный коммит по путям)', COMMIT_ALLOWED))
    }
    if (classified.kind === 'positional') {
      if (stageAll) return fail(state, `fatal: paths '${tok.text} ...' with -a does not make sense`)
      return fail(state, ue.optionOutOfScope(`git commit ${tok.text}`, COMMIT_ALLOWED))
    }
    const { outcome } = classified
    if (outcome.stageAll) stageAll = true
    if (outcome.message) {
      messages.push(outcome.message)
    } else if (outcome.needsMessageFromNextToken) {
      const next = tokens[i + 1]
      if (!next) return fail(state, "error: switch `m' requires a value")
      messages.push({ value: next.text, quoted: next.quoted })
      i++
    }
  }

  const { message, summary } = buildCommitMessage(messages)
  const sawM = messages.length > 0

  const head = headTree(state)
  const nextIndex: FileTree = stageAll ? applyStageAll(state.index, state.working) : state.index

  if (sameTree(head, nextIndex)) {
    return fail(state, formatUndoStatus({ ...state, index: nextIndex }))
  }

  if (!sawM) return fail(state, 'Aborting commit due to empty commit message.', ru.explain.commitAborting)
  if (!message) return fail(state, 'Aborting commit due to empty commit message.', ru.explain.commitAbortingEmptyMessage)

  const parent = currentTip(state)
  const tree: FileTree = { ...nextIndex }
  const id = undoCommitHash(message, tree, parent, state.clock)
  const nextState: UndoState = {
    ...state,
    commits: { ...state.commits, [id]: { id, parentId: parent, message, tree } },
    branches: { ...state.branches, [state.head]: id },
    index: nextIndex,
    clock: state.clock + 1,
  }
  return ok(nextState, `[${state.head} ${id.slice(0, 7)}] ${summary}`)
}

// ---------- git status ----------

const STATUS_ALLOWED = 'git status'

function handleStatus(state: UndoState, args: string[]): { state: UndoState; result: CommandResult } {
  const afterSeparator = args[0] === '--'
  const rest = afterSeparator ? args.slice(1) : args
  const flags = afterSeparator ? [] : rest.filter((a) => a.startsWith('-'))
  const paths = afterSeparator ? rest : rest.filter((a) => !a.startsWith('-'))

  for (const f of flags) {
    const classified = classifySection2Option('status', f)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output)
    if (classified.kind === 'ambiguous') return fail(state, ue.ambiguousAbbreviationOutOfScope(`git status ${f}`, STATUS_ALLOWED))
    if (classified.kind === 'help') return fail(state, ue.helpOutOfScope(`git status ${f}`, STATUS_ALLOWED))
    return fail(state, ue.optionOutOfScope(`git status ${classified.resolved}`, STATUS_ALLOWED))
  }
  if (paths.length) return fail(state, ue.optionOutOfScope(`git status ${paths.join(' ')}`, STATUS_ALLOWED))
  return ok(state, formatUndoStatus(state))
}

// ---------- git log (только голая форма и --oneline — искать хэш для revert; полный разбор, диапазоны и т.п. — тема раздела 3, inspectCommands.ts) ----------

const LOG_ALLOWED = 'git log, git log --oneline'

function onelineEntry(state: UndoState, id: string): string {
  return `${id} ${getCommit(state, id)?.message ?? ''}`
}
function longEntry(state: UndoState, id: string): string {
  return `commit ${id}\n\n    ${getCommit(state, id)?.message ?? ''}`
}

/** Цепочка коммитов от `id` к корню (у коммита раздела 4 не больше одного родителя). */
function commitChainFrom(state: UndoState, id: string): string[] {
  const chain: string[] = []
  let cur: string | null = id
  while (cur !== null) {
    chain.push(cur)
    cur = state.commits[cur]?.parentId ?? null
  }
  return chain
}

function handleLog(state: UndoState, args: string[]): { state: UndoState; result: CommandResult } {
  // "--" отделяет пути от ревизий: git принимает, раздел 4 историю по путям не разбирает.
  const separatorAt = args.indexOf('--')
  if (separatorAt !== -1) return fail(state, ue.optionOutOfScope(`git log ${args.slice(separatorAt).join(' ')}`, LOG_ALLOWED))
  let oneline = false
  const positionals: string[] = []
  for (const t of args) {
    if (t === '--oneline') {
      oneline = true
      continue
    }
    if (t.startsWith('-')) {
      const cls = classifySection3Option('log', ['--oneline'], t)
      if (cls === 'outOfScope') return fail(state, ue.optionOutOfScope(`git log ${t}`, LOG_ALLOWED))
      if (cls === 'unknown') return fail(state, gitUnrecognizedArgument(t))
      continue
    }
    positionals.push(t)
  }
  if (positionals.length) return fail(state, ue.optionOutOfScope(`git log ${positionals.join(' ')}`, LOG_ALLOWED))

  const chain = commitChainFrom(state, currentTip(state))
  const lines = chain.map((id) => (oneline ? onelineEntry(state, id) : longEntry(state, id)))
  return ok(state, lines.join(oneline ? '\n' : '\n\n'))
}

// ---------- git branch (только создание + список — переключение/удаление вне области, target.md, часть VI: нужен только для "git branch rescue <хэш>") ----------

const BRANCH_ALLOWED = 'git branch, git branch <имя> [<начальная точка>]'

function formatBranchList(state: UndoState): string {
  return Object.keys(state.branches)
    .sort()
    .map((b) => (b === state.head ? '* ' : '  ') + b)
    .join('\n')
}

function handleBranchPositional(state: UndoState, args: string[]): { state: UndoState; result: CommandResult } {
  if (!args.length) return ok(state, formatBranchList(state))
  if (args.length > 2) return fail(state, ue.optionOutOfScope('git branch <имя> <доп. аргументы>', BRANCH_ALLOWED))
  const name = args[0]
  if (!name) return fail(state, 'fatal: branch name required')
  if (has(state.branches, name)) return fail(state, `fatal: a branch named '${name}' already exists`)
  let startId: string
  if (args.length === 2) {
    if (classifyRefToken(args[1], UNDO_REF_GRAMMAR) === 'foreign') {
      return fail(state, ue.optionOutOfScope(`git branch ${name} ${args[1]}`, BRANCH_ALLOWED))
    }
    const resolved = resolveRef(state, args[1])
    if (resolved === null) return fail(state, `fatal: not a valid object name: '${args[1]}'`)
    startId = resolved
  } else {
    startId = currentTip(state)
  }
  const nextState: UndoState = { ...state, branches: { ...state.branches, [name]: startId }, branchOrder: [...state.branchOrder, name] }
  return ok(nextState, '')
}

function handleBranch(state: UndoState, args: string[]): { state: UndoState; result: CommandResult } {
  if (args[0] === '--') return handleBranchPositional(state, args.slice(1))
  if (!args.length) return ok(state, formatBranchList(state))
  const flag = args.find((a) => a.startsWith('-'))
  if (flag) {
    const classified = classifySection2Option('branch', flag)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output)
    if (classified.kind === 'ambiguous') return fail(state, ue.ambiguousAbbreviationOutOfScope(`git branch ${flag}`, BRANCH_ALLOWED))
    if (classified.kind === 'help') return fail(state, ue.helpOutOfScope(`git branch ${flag}`, BRANCH_ALLOWED))
    return fail(state, ue.optionOutOfScope(`git branch ${classified.resolved}`, BRANCH_ALLOWED))
  }
  return handleBranchPositional(state, args)
}

// ---------- git reset ----------

const RESET_ALLOWED = 'git reset [--soft|--mixed|--hard] [<коммит>], git reset [<коммит>] [--] <файл>...'

function ambiguousArgument(token: string): string {
  return `fatal: ambiguous argument '${token}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`
}

/**
 * Решает, что считать ссылкой, а что путями, из позиционных токенов ДО "--" (target.md, часть VI,
 * «Убрать файл из индекса»; сверено напрямую, git 2.53.0, 26.09.2026 — см. отчёт):
 * - c явным "--": первый токен (если есть) ОБЯЗАН быть ссылкой ("fatal: Failed to resolve '<x>'
 *   as a valid tree." — иначе), остальное всегда пути, даже если ни один файл не существует.
 * - без "--": ссылка побеждает, если первый токен ей разбирается; иначе, если это известный git
 *   путь (в HEAD/индексе/рабочем дереве) — путь; иначе — настоящая ошибка git «ambiguous
 *   argument» (единственная проверка на весь список: остальные токены дальше не проверяются —
 *   сверено напрямую, `git reset a b` с несуществующим "b" молча пропускает "b").
 */
function classifyResetPositionals(
  state: UndoState,
  positionalBeforeDD: string[],
  hasExplicitDD: boolean,
): { refId: string | null; paths: string[] } | { fatal: string } {
  if (hasExplicitDD) {
    if (!positionalBeforeDD.length) return { refId: null, paths: [] }
    const resolved = resolveRef(state, positionalBeforeDD[0])
    if (resolved === null) return { fatal: `fatal: Failed to resolve '${positionalBeforeDD[0]}' as a valid tree.` }
    return { refId: resolved, paths: positionalBeforeDD.slice(1) }
  }
  if (!positionalBeforeDD.length) return { refId: null, paths: [] }
  const first = positionalBeforeDD[0]
  const resolved = resolveRef(state, first)
  if (resolved !== null) return { refId: resolved, paths: positionalBeforeDD.slice(1) }
  const known = has(headTree(state), first) || has(state.index, first) || has(state.working, first)
  if (!known) return { fatal: ambiguousArgument(first) }
  return { refId: null, paths: positionalBeforeDD }
}

function handleReset(state: UndoState, args: string[]): { state: UndoState; result: CommandResult } {
  const ddAt = args.indexOf('--')
  const beforeDD = ddAt === -1 ? args : args.slice(0, ddAt)
  const afterDD = ddAt === -1 ? [] : args.slice(ddAt + 1)

  let mode: ResetMode | null = null
  const positionalBeforeDD: string[] = []
  for (const t of beforeDD) {
    if (!t.startsWith('-')) {
      positionalBeforeDD.push(t)
      continue
    }
    if ((RESET_MODE_FLAGS as readonly string[]).includes(t)) {
      mode = t === '--soft' ? 'soft' : t === '--hard' ? 'hard' : 'mixed'
      continue
    }
    if (isResetQuietFlag(t)) return fail(state, ue.optionOutOfScope(`git reset ${t}`, RESET_ALLOWED))
    if (isResetMergeOrKeepFlag(t)) return fail(state, ue.optionOutOfScope(`git reset ${t}`, RESET_ALLOWED))
    // Опция, которую git принимает, а раздел 4 не разбирает, — отказ; заведомо несуществующая
    // получает ниже настоящую ошибку git.
    if (classifyUndoOption('reset', RESET_MODE_FLAGS, t) === 'refuse') return fail(state, ue.optionOutOfScope(`git reset ${t}`, RESET_ALLOWED))
    // Настоящий git на любой другой нераспознанный (фейковый ИЛИ реальный-но-нереализованный)
    // флаг даёт один и тот же ответ — "error: unknown option/switch" + буквальный usage-блок
    // (сверено напрямую: `git reset --bogus`/`git reset -Z`).
    const prefix = t.startsWith('--') ? `error: unknown option \`${t.slice(2).split('=')[0]}'` : `error: unknown switch \`${t.slice(1)}'`
    return fail(state, `${prefix}\n${RESET_USAGE}`)
  }
  const effectiveMode: ResetMode = mode ?? 'mixed'

  // Ссылка вне грамматики раздела 4 (HEAD^, HEAD~~, ветка~N, HEAD@{N}) и формы путей (./x, ../x,
  // глоб, магия pathspec) git принимает, а раздел 4 не разбирает: отказ, а не выдуманное
  // «ambiguous argument». Первый позиционный до "--" — ссылка или путь, остальные — пути.
  const [firstArg, ...restArgs] = positionalBeforeDD
  const foreignFirst =
    firstArg !== undefined && (classifyRefToken(firstArg, UNDO_REF_GRAMMAR) === 'foreign' || classifyPathspec(firstArg, { globs: false }) === 'foreign')
  const foreignToken = foreignFirst ? firstArg : [...restArgs, ...afterDD].find((p) => classifyPathspec(p, { globs: false }) === 'foreign')
  if (foreignToken !== undefined) return fail(state, ue.optionOutOfScope(`git reset ${foreignToken}`, RESET_ALLOWED))
  const classified = classifyResetPositionals(state, positionalBeforeDD, ddAt !== -1)
  if ('fatal' in classified) return fail(state, classified.fatal)
  const { refId, paths: refPaths } = classified
  const paths = refPaths.concat(afterDD)

  if (paths.length) {
    if (effectiveMode !== 'mixed') return fail(state, `fatal: Cannot do ${effectiveMode} reset with paths.`)
    const targetId = refId ?? currentTip(state)
    const refTree = commitTree(state, targetId)
    const { index: nextIndex } = unstagePaths(state, paths, refTree)
    const report = unstagedReport({ ...state, index: nextIndex }, refTree, paths)
    return ok({ ...state, index: nextIndex }, report, ru.undo.explain.resetUnstage)
  }

  const targetId = refId ?? currentTip(state)
  const outcome = resetToCommit(state, effectiveMode, targetId)
  if (effectiveMode === 'hard') {
    const message = getCommit(outcome.state, targetId)?.message ?? ''
    return ok(outcome.state, `HEAD is now at ${targetId.slice(0, 7)} ${message}`, ru.undo.explain.resetHard)
  }
  if (effectiveMode === 'soft') {
    return ok(outcome.state, '', outcome.moved ? ru.undo.explain.resetSoft : ru.undo.explain.resetNoop)
  }
  return ok(outcome.state, unstagedReport(outcome.state, commitTree(outcome.state, targetId)), ru.undo.explain.resetMixed)
}

// ---------- git revert ----------

const REVERT_ALLOWED = 'git revert <коммит> [--no-edit]'

/** Буквальный текст настоящего git (сверено напрямую, git 2.53.0, 26.09.2026) — те же роли, что и formatOverwriteError в branchCommands.ts, но verb здесь ВСЕГДА "merge": настоящий git печатает именно это слово даже для revert (сверено напрямую — сюрприз, задокументирован в отчёте). */
function formatRevertOverwriteBlock(block: SafetyBlock): string {
  const parts: string[] = []
  if (block.modified.length) {
    const list = block.modified.map((f) => `\t${f}`).join('\n')
    parts.push(`error: Your local changes to the following files would be overwritten by merge:\n${list}\nPlease commit your changes or stash them before you merge.`)
  }
  if (block.untracked.length) {
    const list = block.untracked.map((f) => `\t${f}`).join('\n')
    parts.push(`error: The following untracked working tree files would be overwritten by merge:\n${list}\nPlease move or remove them before you merge.`)
  }
  return `${parts.join('\n')}\nAborting\nfatal: revert failed`
}

function handleRevert(state: UndoState, args: string[]): { state: UndoState; result: CommandResult } {
  const flags = args.filter((a) => a.startsWith('-'))
  const positionals = args.filter((a) => !a.startsWith('-'))

  let otherFlag: string | undefined
  for (const f of flags) {
    if (f === '--no-edit') continue
    if (isRevertNoCommitFlag(f)) return fail(state, ue.revertNoCommitOutOfScope)
    if (isRevertMainlineFlag(f)) return fail(state, ue.revertMainlineOutOfScope)
    if (isRevertConflictFlowFlag(f)) return fail(state, ue.revertConflictFlowOutOfScope(f))
    otherFlag ??= f
  }

  if (!positionals.length) return fail(state, REVERT_USAGE, ru.undo.explain.revertNeedsCommit)
  // Остальные флаги проверяются ПОСЛЕ разбора позиционных: без коммита настоящий git на любой флаг
  // печатает один usage-блок (его тренажёр воспроизводит выше). С коммитом флаг, который git
  // принимает (-e, -s, -X, --strategy …), — отказ; заведомо несуществующий — usage, как у git.
  if (otherFlag !== undefined) {
    if (classifyUndoOption('revert', ['--no-edit'], otherFlag) === 'unknown') return fail(state, REVERT_USAGE)
    return fail(state, ue.optionOutOfScope(`git revert ${otherFlag}`, REVERT_ALLOWED))
  }
  if (positionals.length > 1) return fail(state, ue.optionOutOfScope(`git revert ${positionals.join(' ')}`, REVERT_ALLOWED))

  const ref = positionals[0]
  const targetId = resolveRef(state, ref)
  if (targetId === null) {
    if (looksLikeUnimplementedRevisionExpression(ref) || classifyRefToken(ref, UNDO_REF_GRAMMAR) === 'foreign') return fail(state, ue.optionOutOfScope(`git revert ${ref}`, REVERT_ALLOWED))
    return fail(state, `fatal: bad revision '${ref}'`)
  }

  // Широкая проверка (индекс отличается от HEAD ГДЕ УГОДНО) — раньше вычисления самого revert
  // (сверено напрямую: staged-правка в СОВСЕМ ДРУГОМ файле блокирует revert коротким сообщением,
  // даже когда сам revert результата бы не менял вовсе — см. отчёт).
  if (indexDiffersFromHead(state).length > 0) {
    return fail(state, 'error: your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.\nfatal: revert failed')
  }

  const { merged } = computeRevert(state, targetId)
  if (merged.conflicts.length > 0) {
    // target.md, часть VI, «Что НЕ входит»: конфликт при revert — правило области, без
    // выдуманного вывода (CONFLICT-маркеров, --abort/--continue).
    return fail(state, ue.revertConflictOutOfScope(merged.conflicts))
  }

  const currentTree = headTree(state)
  if (sameTree(merged.tree, currentTree)) {
    // «Нечего отменять»: настоящий git в этом случае не печатает специальный текст про revert —
    // он просто идёт по тому же пути, что и обычный commit без изменений, и печатает статус
    // (сверено напрямую, git 2.53.0, 26.09.2026 — см. отчёт; source.html и spec.md предполагали
    // отдельный текст «нечего отменять», которого реальный git не печатает).
    return fail(state, formatUndoStatus(state))
  }

  const block = checkSafety(state, merged.tree)
  if (block.modified.length || block.untracked.length) {
    return fail(state, formatRevertOverwriteBlock(block))
  }

  const { index, working } = applyTreeChange(state, merged.tree)
  const target = getCommit(state, targetId)
  const parent = currentTip(state)
  const message = `Revert "${target?.message ?? ''}"`
  const id = undoCommitHash(message, merged.tree, parent, state.clock)
  const nextState: UndoState = {
    ...state,
    commits: { ...state.commits, [id]: { id, parentId: parent, message, tree: merged.tree } },
    branches: { ...state.branches, [state.head]: id },
    index,
    working,
    clock: state.clock + 1,
  }
  return ok(nextState, `[${state.head} ${id.slice(0, 7)}] ${message}`, ru.undo.explain.revertSuccess)
}

// ---------- диспетчер ----------

function appendCommand(state: UndoState, rawInput: string, result: CommandResult): UndoState {
  return {
    ...state,
    history: [...state.history, { kind: 'command', input: rawInput, ok: result.ok, output: result.output, explanation: result.explanation }],
  }
}

/**
 * Выполняет одну строку терминала раздела 4. Та же двухэтапная граница «шелл/git», что и в
 * разделах 1–3 (shellTokenize уже снял кавычки и раскрыл голую "*" — см. shell.ts); ничего не
 * бросает — любой недопустимый ввод превращается в предусмотренный отказ.
 */
export function executeUndoCommand(state: UndoState, rawInput: string): { state: UndoState; result: CommandResult | null } {
  if (!rawInput.trim()) return { state, result: null }

  const tokens = shellTokenize(rawInput, Object.keys(state.working))
  const words = tokens.map((t) => t.text)

  function respond(pair: { state: UndoState; result: CommandResult }) {
    return { state: appendCommand(pair.state, rawInput, pair.result), result: pair.result }
  }

  if (words[0] !== 'git') return respond(fail(state, ru.errors.bashCommandNotFound(words[0] ?? '')))

  const badGlob = tokens.slice(1).find((t) => t.unsupportedGlob)
  if (badGlob) return respond(fail(state, ru.errors.shellGlobUnsupported(badGlob.text)))

  const sub = words[1]
  if (sub === undefined) return respond(fail(state, ue.gitUsageNoArgs))
  if (isGlobalGitOption(sub)) return respond(fail(state, ue.commandOutOfScope(sub)))

  if (!isSection4Command(sub)) {
    if (REAL_GIT_COMMANDS.has(sub)) return respond(fail(state, ue.commandOutOfScope(sub)))
    return respond(fail(state, gitNotACommand(sub)))
  }

  let outcome: { state: UndoState; result: CommandResult }
  switch (sub) {
    case 'add':
      outcome = handleAdd(state, words.slice(2))
      break
    case 'commit':
      outcome = handleCommit(state, tokens.slice(2))
      break
    case 'status':
      outcome = handleStatus(state, words.slice(2))
      break
    case 'log':
      outcome = handleLog(state, words.slice(2))
      break
    case 'branch':
      outcome = handleBranch(state, words.slice(2))
      break
    case 'reset':
      outcome = handleReset(state, words.slice(2))
      break
    case 'revert':
      outcome = handleRevert(state, words.slice(2))
      break
  }
  return respond(outcome)
}
