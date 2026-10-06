// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): git-сторона разбора командной
// строки (clone/remote/branch/checkout/add/commit/status/fetch/push/pull/
// config). По архитектуре — аналог branchCommands.ts/undoCommands.ts, но для
// своей модели (remoteTypes.ts/remoteRepo.ts) и своего набора команд
// (remoteScope.ts). Разделы 1–4 этот файл не трогает и не импортирует из них
// ничего, кроме уже экспортированной классификации флагов add/commit/branch/
// checkout (classifySection2Option, branchScope.ts — та же команда git даёт
// те же реальные флаги независимо от раздела) и данных о настоящем git
// (GLOBAL_GIT_OPTIONS/REAL_GIT_COMMANDS/gitNotACommand).
//
// Строки вида "fatal: …", "error: …", usage-блоки — буквальный вывод,
// сверенный напрямую запуском git 2.53.0 (LC_ALL=C, без глобального
// конфига) во временном каталоге 26.09.2026, см. docs/git-trainer/reports/
// section5-git-runs.txt — не по памяти. Диффстат НЕ печатается (то же
// упрощение, что и в branchCommands.ts), но на pull после перемотки и слияния добавляется одна
// строка тренажёра о пропуске (ru.remote.notes.pullStatOmitted, см. integrationResultText).
// ============================================================
import type { CommandResult, FileTree, LocalRepo, RemoteCommit, RemoteState } from './remoteTypes'
import {
  applyTreeChange,
  checkSafety,
  commitTree,
  formatFetchUpdates,
  formatRemoteStatus,
  isUpToDateWithUpstream,
  performClone,
  performFetch,
  pullIntegrate,
  pushBranch,
  refLine,
  remoteCommitHash,
  sameTree,
  type SafetyBlock,
} from './remoteRepo'
import {
  CLONE_USAGE,
  FETCH_USAGE,
  NOT_A_GIT_REPO,
  NOT_A_REPO_BLOCK,
  PULL_DIVERGED_NEEDS_CHOICE_BLOCK,
  PULL_FF_ONLY_DIVERGED_BLOCK,
  PULL_NO_TRACKING_BLOCK,
  PULL_USAGE,
  PUSH_FETCH_FIRST_HINT,
  PUSH_NO_UPSTREAM_BLOCK,
  PUSH_NON_FF_HINT,
  PUSH_USAGE,
  REMOTE_USAGE,
  SERVER_PATH,
  classifySection5Option,
  commandNeedsNoRepo,
  gitNotACommand,
  isGlobalGitOption,
  isSection5Command,
  PUSH_SCOPE_FLAGS,
  PULL_SCOPE_FLAGS,
  BRANCH_DELETE_CURRENT_WORKTREE,
  REAL_GIT_COMMANDS,
} from './remoteScope'
import { classifySection2Option, completionHelperMisuse, isSection2Command } from './branchScope'
import { classifyPathspec, classifyPushRefspec, classifyRefToken, classifyRepositoryArgument, REMOTE_REF_GRAMMAR } from './outOfScopeForms'
import type { ShellToken } from './shell'
import { findShellRefusal, shellRefusalText, shellTokenize } from './shell'
import { applyStageAll, buildCommitMessage, classifyCommitFlagToken, type CommitMessagePart } from './commitFlags'
import { has } from './util'
import { ru } from '../locales/ru'

const re = ru.remote.errors
const rx = ru.remote.explain

function ok(state: RemoteState, output: string, explanation: string | null = null, exitCode = 0): { state: RemoteState; result: CommandResult } {
  return { state, result: { ok: true, output, explanation, exitCode } }
}
/** `exitCode` — только для буквальных отказов НАСТОЯЩЕГО git (target.md, часть VII, таблица кодов). У честных "второй ответ" отказов (правило области) кода нет — это не то, что напечатал бы git. */
function fail(state: RemoteState, output: string, explanation: string | null = null, exitCode?: number): { state: RemoteState; result: CommandResult } {
  return { state, result: { ok: false, output, explanation, exitCode } }
}

function unknownFlagBlock(token: string, usage: string): string {
  const head = token.startsWith('--') ? `error: unknown option \`${token.slice(2).split('=')[0]}'` : `error: unknown switch \`${token.slice(1)}'`
  return `${head}\n${usage}`
}

// ---------- git clone ----------

const CLONE_ALLOWED = 'git clone origin local'

function handleClone(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  if (!args.length) return fail(state, `fatal: You must specify a repository to clone.\n\n${CLONE_USAGE}`, null, 129)

  const flag = args.find((a) => a.startsWith('-'))
  if (flag) {
    if (classifySection5Option('clone', [], flag) === 'outOfScope') return fail(state, re.optionOutOfScope(`git clone ${flag}`, CLONE_ALLOWED))
    return fail(state, unknownFlagBlock(flag, CLONE_USAGE), null, 129)
  }

  const positionals = args.filter((a) => !a.startsWith('-'))
  if (positionals.length > 2) return fail(state, re.optionOutOfScope('git clone <repo> <dir> <доп. аргументы>', CLONE_ALLOWED))
  const [repo, dir] = positionals
  if (/^(https?:\/\/|git@|ssh:\/\/)/i.test(repo ?? '')) return fail(state, re.cloneUrlOutOfScope(repo))
  // Путь (включая адрес сервера /team/origin) git принимает, а раздел 5 файловую систему не
  // моделирует: отказ. Именованный remote "origin" и неизвестное имя разбираются ниже.
  if (repo !== undefined && classifyRepositoryArgument(repo) !== 'plain') {
    return fail(state, re.optionOutOfScope(`git clone ${repo}`, CLONE_ALLOWED))
  }

  // target.md, часть VII, опасное место 11: "origin" резолвится в сервер только СНАРУЖИ (до
  // clone) — терминал переходит внутрь копии сразу после успешного clone, и там "origin" уже не
  // существует (тот же самый путь, что и для нонсенс-имени).
  const repoResolves = repo === 'origin' && state.location === 'outside'
  if (!repoResolves) return fail(state, `fatal: repository '${repo}' does not exist`, null, 128)

  if (dir !== 'local') return fail(state, re.cloneOtherDirOutOfScope(dir ?? '(по умолчанию)'))
  if (state.local !== null) return fail(state, "fatal: destination path 'local' already exists and is not an empty directory.", null, 128)

  const nextLocal = performClone(state.server)
  const nextState: RemoteState = { ...state, local: nextLocal, location: 'local' }
  return ok(nextState, "Cloning into 'local'...\ndone.")
}

// ---------- git remote ----------

function handleRemote(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  if (!args.length) return ok(state, 'origin')
  if ((args[0] === '-v' || args[0] === '--verbose') && args.length === 1) {
    return ok(state, `origin\t${SERVER_PATH} (fetch)\norigin\t${SERVER_PATH} (push)`)
  }
  const verboseOnly = args.every((a) => a === '-v' || a === '--verbose' || !a.startsWith('-'))
  const verboseFlags = args.filter((a) => a === '-v' || a === '--verbose')
  const rest = args.filter((a) => !a.startsWith('-'))
  // Повтор -v git принимает (печатает то же, что и один -v), раздел 5 повтор не разбирает.
  if (verboseOnly && verboseFlags.length > 1 && rest.length === 0) {
    return fail(state, re.optionOutOfScope(`git remote ${args.join(' ')}`, 'git remote, git remote -v'))
  }
  // -v с лишним словом: git принимает -v и отвечает на слово как на неизвестную подкоманду.
  if (verboseOnly && verboseFlags.length > 0 && rest.length > 0) {
    return fail(state, `error: unknown subcommand: \`${rest[0]}'\n${REMOTE_USAGE}`, null, 129)
  }
  const flag = args.find((a) => a.startsWith('-'))
  if (flag) {
    if (classifySection5Option('remote', ['-v', '--verbose'], flag) === 'outOfScope') {
      return fail(state, re.optionOutOfScope(`git remote ${args.join(' ')}`, 'git remote, git remote -v'))
    }
    return fail(state, unknownFlagBlock(flag, REMOTE_USAGE), null, 129)
  }
  // Подкоманды (add/remove/rename/set-url/…) — настоящие возможности git, честно вне области
  // (target.md, часть VII, «Что НЕ входит»: «git remote add x y в git проходит молча»).
  return fail(state, re.remoteSubcommandOutOfScope(args.join(' ')))
}

// ---------- git add (тот же минимальный набор, что и раздел 2 — branchCommands.ts, handleAdd) ----------

const ADD_NOTHING_SPECIFIED =
  "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\n" +
  'hint: Disable this message with "git config set advice.addEmptyPathspec false"'

const ADD_ALLOWED = 'git add <файл>, git add .'

function addPaths(state: RemoteState, paths: string[]): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  if (!paths.length) return ok(state, ADD_NOTHING_SPECIFIED)
  const head = commitTree(local.commits, local.branches[local.head])

  if (paths.includes('.')) {
    const files = new Set<string>([...Object.keys(local.working), ...Object.keys(local.index), ...Object.keys(head)])
    const nextIndex: FileTree = { ...local.index }
    files.forEach((f) => {
      if (has(local.working, f)) nextIndex[f] = local.working[f]
      else delete nextIndex[f]
    })
    return ok({ ...state, local: { ...local, index: nextIndex } }, '')
  }

  // Форма пути, которую git принимает, а раздел 5 не разбирает ("./x", "../x", глоб, магия pathspec).
  const foreignPath = paths.find((p) => classifyPathspec(p, { globs: false }) === 'foreign')
  if (foreignPath !== undefined) return fail(state, re.optionOutOfScope(`git add ${foreignPath}`, ADD_ALLOWED))
  const knownToGit = new Set<string>([...Object.keys(local.working), ...Object.keys(local.index), ...Object.keys(head)])
  const notFound = paths.find((f) => !knownToGit.has(f))
  if (notFound !== undefined) return fail(state, `fatal: pathspec '${notFound}' did not match any files`, null, 128)

  const nextIndex: FileTree = { ...local.index }
  paths.forEach((f) => {
    if (has(local.working, f)) nextIndex[f] = local.working[f]
    else delete nextIndex[f]
  })
  return ok({ ...state, local: { ...local, index: nextIndex } }, '')
}

function handleAdd(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  if (args[0] === '--') return addPaths(state, args.slice(1))
  if (!args.length) return ok(state, ADD_NOTHING_SPECIFIED)
  const flag = args.find((a) => a.startsWith('-'))
  if (flag) {
    const classified = classifySection2Option('add', flag)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null, 129)
    if (classified.kind === 'ambiguous') return fail(state, re.ambiguousAbbreviationOutOfScope(`git add ${flag}`, ADD_ALLOWED))
    if (classified.kind === 'help') return fail(state, re.helpOutOfScope(`git add ${flag}`, ADD_ALLOWED))
    return fail(state, re.optionOutOfScope(`git add ${classified.resolved}`, ADD_ALLOWED))
  }
  return addPaths(state, args)
}

// ---------- git commit (тот же минимальный набор, что и раздел 2) ----------

const COMMIT_ALLOWED = 'git commit -m "..."'

function commitOptionError(flag: string): CommandResult {
  const classified = classifySection2Option('commit', flag)
  if (classified.kind === 'unknown' || classified.kind === 'noValue') return { ok: false, output: classified.output, explanation: null, exitCode: 129 }
  if (classified.kind === 'ambiguous') return { ok: false, output: re.ambiguousAbbreviationOutOfScope(`git commit ${flag}`, COMMIT_ALLOWED), explanation: null }
  if (classified.kind === 'help') return { ok: false, output: re.helpOutOfScope(`git commit ${flag}`, COMMIT_ALLOWED), explanation: null }
  return { ok: false, output: re.optionOutOfScope(`git commit ${classified.resolved}`, COMMIT_ALLOWED), explanation: null }
}

function commitShortFlagIsReal(letter: string): boolean {
  return classifySection2Option('commit', '-' + letter).kind === 'real'
}

function handleCommit(state: RemoteState, tokens: ShellToken[]): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  let stageAll = false
  const messages: CommitMessagePart[] = []

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const classified = classifyCommitFlagToken(tok, commitShortFlagIsReal, commitOptionError)
    if (classified.kind === 'error') return { state, result: classified.result }
    if (classified.kind === 'separator') {
      const rest = tokens.slice(i + 1)
      if (!rest.length) break
      if (stageAll) return fail(state, `fatal: paths '${rest[0].text} ...' with -a does not make sense`, null, 128)
      return fail(state, re.optionOutOfScope('git commit -- <файл> (выборочный коммит по путям)', COMMIT_ALLOWED))
    }
    if (classified.kind === 'positional') {
      if (stageAll) return fail(state, `fatal: paths '${tok.text} ...' with -a does not make sense`, null, 128)
      return fail(state, re.optionOutOfScope(`git commit ${tok.text}`, COMMIT_ALLOWED))
    }
    const { outcome } = classified
    if (outcome.stageAll) stageAll = true
    if (outcome.message) {
      messages.push(outcome.message)
    } else if (outcome.needsMessageFromNextToken) {
      const next = tokens[i + 1]
      if (!next) return fail(state, "error: switch `m' requires a value", null, 129)
      messages.push({ value: next.text, quoted: next.quoted })
      i++
    }
  }

  const { message, summary } = buildCommitMessage(messages)
  const sawM = messages.length > 0

  const head = commitTree(local.commits, local.branches[local.head])
  const nextIndex: FileTree = stageAll ? applyStageAll(local.index, local.working) : local.index

  if (sameTree(head, nextIndex)) {
    return fail(state, formatRemoteStatus({ ...local, index: nextIndex }), null, 1)
  }
  if (!sawM) return fail(state, 'Aborting commit due to empty commit message.', ru.explain.commitAborting)
  if (!message) return fail(state, 'Aborting commit due to empty commit message.', ru.explain.commitAbortingEmptyMessage)

  const parent = local.branches[local.head]
  const tree: FileTree = { ...nextIndex }
  const id = remoteCommitHash(message, tree, [parent], state.clock)
  const commit: RemoteCommit = { id, parents: [parent], message, tree }
  const nextLocal: LocalRepo = {
    ...local,
    commits: { ...local.commits, [id]: commit },
    branches: { ...local.branches, [local.head]: id },
    index: nextIndex,
  }
  const nextState: RemoteState = {
    ...state,
    local: nextLocal,
    clock: state.clock + 1,
    commitAfterColleagueEvent: state.commitAfterColleagueEvent || state.colleaguePushCount > 0,
  }
  return ok(nextState, `[${local.head} ${id.slice(0, 7)}] ${summary}`)
}

// ---------- git status ----------

const STATUS_ALLOWED = 'git status'

function handleStatus(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  const flags = args.filter((a) => a.startsWith('-'))
  const paths = args.filter((a) => !a.startsWith('-'))
  for (const f of flags) {
    const classified = classifySection2Option('status', f)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null, 129)
    if (classified.kind === 'ambiguous') return fail(state, re.ambiguousAbbreviationOutOfScope(`git status ${f}`, STATUS_ALLOWED))
    if (classified.kind === 'help') return fail(state, re.helpOutOfScope(`git status ${f}`, STATUS_ALLOWED))
    return fail(state, re.optionOutOfScope(`git status ${classified.resolved}`, STATUS_ALLOWED))
  }
  if (paths.length) return fail(state, re.optionOutOfScope(`git status ${paths.join(' ')}`, STATUS_ALLOWED))
  const local = state.local!
  return ok(state, formatRemoteStatus(local), isUpToDateWithUpstream(local) ? ru.remote.explain.upToDateNote : null)
}

// ---------- git config (только pull.rebase false / pull.ff only, target.md «Что входит») ----------

function handleConfig(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  if (args.length === 2 && args[0] === 'pull.rebase' && args[1] === 'false') {
    return ok({ ...state, local: { ...local, pullRebaseFalse: true } }, '')
  }
  if (args.length === 2 && args[0] === 'pull.ff' && args[1] === 'only') {
    return ok({ ...state, local: { ...local, pullFfOnly: true } }, '')
  }
  return fail(state, re.configOutOfScope(args.join(' ')))
}

// ---------- git branch ----------

const BRANCH_ALLOWED = 'git branch, git branch <имя>, git branch -r, git branch -a'

function formatBranchList(local: LocalRepo): string {
  return Object.keys(local.branches)
    .sort()
    .map((b) => (b === local.head ? '* ' : '  ') + b)
    .join('\n')
}

function formatBranchR(local: LocalRepo): string {
  const lines = [`  origin/HEAD -> origin/${local.remoteHeadBranch}`]
  Object.keys(local.remoteBranches)
    .sort()
    .forEach((n) => lines.push(`  origin/${n}`))
  return lines.join('\n')
}

function formatBranchA(local: LocalRepo): string {
  const localLines = Object.keys(local.branches)
    .sort()
    .map((b) => (b === local.head ? '* ' : '  ') + b)
  const remoteLines = [`  remotes/origin/HEAD -> origin/${local.remoteHeadBranch}`]
  Object.keys(local.remoteBranches)
    .sort()
    .forEach((n) => remoteLines.push(`  remotes/origin/${n}`))
  return [...localLines, ...remoteLines].join('\n')
}

/** Разбор ссылки для `git branch <имя> <начальная точка>` — HEAD/имя ветки/короткий хэш (>=4 hex) — тот же минимальный набор, что и resolveRef разделов 2/4. */
function resolveRef(local: LocalRepo, ref: string): string | null {
  if (ref === 'HEAD') return local.branches[local.head] ?? null
  if (has(local.branches, ref)) return local.branches[ref]
  if (/^[0-9a-f]{4,7}$/i.test(ref)) {
    const matches = Object.keys(local.commits).filter((id) => id.startsWith(ref.toLowerCase()))
    if (matches.length === 1) return matches[0]
  }
  return null
}

function handleBranch(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  if (args[0] === '-r' && args.length === 1) return ok(state, formatBranchR(local))
  if (args[0] === '-a' && args.length === 1) return ok(state, formatBranchA(local))
  if ((args[0] === '-d' || args[0] === '-D' || args[0] === '--delete') && args.length === 2) {
    const name = args[1]
    if (name === local.head) return fail(state, BRANCH_DELETE_CURRENT_WORKTREE(name), null, 1)
    // target.md, часть VII, опасное место 10: только этот буквальный случай сверен (см. отчёт) —
    // удаление ЛЮБОЙ другой ветки (текущая копия не держит другого worktree) настоящим git
    // разрешено, но не проверялось прогоном этого раздела; честный отказ, а не угадывание.
    return fail(state, re.optionOutOfScope(`git branch -d ${name}`, BRANCH_ALLOWED))
  }
  if (!args.length) return ok(state, formatBranchList(local))
  const flag = args.find((a) => a.startsWith('-'))
  if (flag) {
    const classified = classifySection2Option('branch', flag)
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null, 129)
    if (classified.kind === 'ambiguous') return fail(state, re.ambiguousAbbreviationOutOfScope(`git branch ${flag}`, BRANCH_ALLOWED))
    if (classified.kind === 'help') return fail(state, re.helpOutOfScope(`git branch ${flag}`, BRANCH_ALLOWED))
    return fail(state, re.optionOutOfScope(`git branch ${classified.resolved}`, BRANCH_ALLOWED))
  }
  if (args.length > 2) return fail(state, re.optionOutOfScope('git branch <имя> <доп. аргументы>', BRANCH_ALLOWED))
  const name = args[0]
  if (has(local.branches, name)) return fail(state, `fatal: a branch named '${name}' already exists`, null, 128)
  let startId: string
  if (args.length === 2) {
    const resolved = resolveRef(local, args[1])
    // Ссылка вне грамматики раздела 5 (HEAD~1, HEAD^, HEAD@{N}) и ветка слежения (origin/<ветка>)
    // git принимает, раздел 5 не разбирает: отказ, а не «not a valid object name».
    if (resolved === null && (classifyRefToken(args[1], REMOTE_REF_GRAMMAR) === 'foreign' || args[1].startsWith('origin/'))) {
      return fail(state, re.optionOutOfScope(`git branch ${name} ${args[1]}`, BRANCH_ALLOWED))
    }
    if (resolved === null) return fail(state, `fatal: not a valid object name: '${args[1]}'`, null, 128)
    startId = resolved
  } else {
    startId = local.branches[local.head]
  }
  const nextLocal: LocalRepo = { ...local, branches: { ...local.branches, [name]: startId }, branchOrder: [...local.branchOrder, name] }
  return ok({ ...state, local: nextLocal }, '')
}

// ---------- git checkout (упрощённая версия раздела 2 — только <ветка> и -b <имя>, target.md, «Локальная работа») ----------

const CHECKOUT_ALLOWED = 'git checkout <ветка>, git checkout -b <имя>'

function formatOverwriteError(block: SafetyBlock): string {
  const parts: string[] = []
  if (block.modified.length) {
    const list = block.modified.map((f) => `\t${f}`).join('\n')
    parts.push(`error: Your local changes to the following files would be overwritten by checkout:\n${list}\nPlease commit your changes or stash them before you switch branches.`)
  }
  if (block.untracked.length) {
    const list = block.untracked.map((f) => `\t${f}`).join('\n')
    parts.push(`error: The following untracked working tree files would be overwritten by checkout:\n${list}\nPlease move or remove them before you switch branches.`)
  }
  return `${parts.join('\n')}\nAborting`
}

function handleCheckout(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  if (!args.length) return fail(state, re.optionOutOfScope('git checkout (без аргументов)', CHECKOUT_ALLOWED))

  if (args[0] === '-b') {
    const name = args[1]
    if (name === undefined) return fail(state, "error: switch `b' requires a value")
    if (args.length > 2) return fail(state, re.optionOutOfScope('git checkout -b <имя> <доп. аргументы>', CHECKOUT_ALLOWED))
    if (has(local.branches, name)) return fail(state, `fatal: a branch named '${name}' already exists`, null, 128)
    const tip = local.branches[local.head]
    const nextLocal: LocalRepo = { ...local, branches: { ...local.branches, [name]: tip }, branchOrder: [...local.branchOrder, name], head: name }
    return ok({ ...state, local: nextLocal }, `Switched to a new branch '${name}'`)
  }

  if (args[0].startsWith('-')) {
    const classified = classifySection2Option('checkout', args[0])
    if (classified.kind === 'unknown' || classified.kind === 'noValue') return fail(state, classified.output, null, 129)
    if (classified.kind === 'ambiguous') return fail(state, re.ambiguousAbbreviationOutOfScope(`git checkout ${args[0]}`, CHECKOUT_ALLOWED))
    if (classified.kind === 'help') return fail(state, re.helpOutOfScope(`git checkout ${args[0]}`, CHECKOUT_ALLOWED))
    return fail(state, re.optionOutOfScope(`git checkout ${classified.resolved}`, CHECKOUT_ALLOWED))
  }
  if (args.length > 1) return fail(state, re.optionOutOfScope('git checkout <ветка> <доп. аргументы>', CHECKOUT_ALLOWED))

  const name = args[0]
  if (!has(local.branches, name)) return fail(state, re.optionOutOfScope(`git checkout ${name}`, CHECKOUT_ALLOWED))

  const headTree = commitTree(local.commits, local.branches[local.head])
  const targetTree = commitTree(local.commits, local.branches[name])
  const block = checkSafety(headTree, local.index, local.working, targetTree)
  if (block.modified.length || block.untracked.length) return fail(state, formatOverwriteError(block), null, 1)

  const wasCurrent = name === local.head
  const { index, working } = applyTreeChange(headTree, local.index, local.working, targetTree)
  const nextLocal: LocalRepo = { ...local, head: name, index, working }
  const header = wasCurrent ? `Already on '${name}'` : `Switched to branch '${name}'`
  return ok({ ...state, local: nextLocal }, header)
}

// ---------- git fetch ----------

const FETCH_ALLOWED = 'git fetch, git fetch origin'

function handleFetch(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  for (const t of args) {
    if (!t.startsWith('-')) continue
    const cls = classifySection5Option('fetch', [], t)
    if (cls === 'unknown') return fail(state, unknownFlagBlock(t, FETCH_USAGE), null, 129)
    if (cls === 'outOfScope') return fail(state, re.optionOutOfScope(`git fetch ${t}`, FETCH_ALLOWED))
  }
  const positionals = args.filter((a) => !a.startsWith('-'))
  // Код 128, как у push; у pull тот же текст даёт 1 (сверено на git 2.53.0, 26.09.2026).
  if (positionals.length && classifyRepositoryArgument(positionals[0]) !== 'plain') {
    return fail(state, re.optionOutOfScope(`git fetch ${positionals[0]}`, FETCH_ALLOWED))
  }
  if (positionals.length && positionals[0] !== 'origin') return fail(state, NOT_A_REPO_BLOCK(positionals[0]), null, 128)
  if (positionals.length > 1) return fail(state, re.optionOutOfScope(`git fetch origin ${positionals.slice(1).join(' ')}`, FETCH_ALLOWED))

  const { local: nextLocal, updates } = performFetch(local, state.server)
  const lines = formatFetchUpdates(updates)
  const nextState: RemoteState = { ...state, local: nextLocal }
  if (!lines.length) return ok(nextState, '')
  return ok(nextState, [`From ${SERVER_PATH}`, ...lines].join('\n'))
}

// ---------- git push ----------

const PUSH_ALLOWED = 'git push, git push origin, git push origin <ветка>, git push origin HEAD, -u/--set-upstream, -f/--force'

/** Отправляет одну ветку и, если outcome — успех, опционально ставит upstream (-u). Общее ядро для явной и неявной (по upstream текущей ветки) форм push. */
function doPush(state: RemoteState, branchName: string, opts: { force: boolean; setUpstream: boolean }): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  const outcome = pushBranch(local, state.server, branchName, opts.force)

  if (outcome.kind === 'rejected') {
    const hint = outcome.reason === 'fetch first' ? PUSH_FETCH_FIRST_HINT : PUSH_NON_FF_HINT
    const output = `To ${SERVER_PATH}\n ! [rejected]        ${branchName} -> ${branchName} (${outcome.reason})\nerror: failed to push some refs to '${SERVER_PATH}'\n${hint}`
    const progress = state.rejectPullPushProgress === 'none' ? 'rejected' : state.rejectPullPushProgress
    return fail({ ...state, rejectPullPushProgress: progress }, output, null, 1)
  }

  const lines: string[] = []
  let nextState = state
  if (outcome.kind === 'upToDate') {
    lines.push('Everything up-to-date')
  } else {
    nextState = { ...state, server: outcome.server, local: outcome.local }
    lines.push(`To ${SERVER_PATH}`, outcome.line)
    if (nextState.rejectPullPushProgress === 'pulled') nextState = { ...nextState, rejectPullPushProgress: 'done' }
  }
  if (opts.setUpstream) {
    nextState = { ...nextState, local: { ...nextState.local!, upstream: { ...nextState.local!.upstream, [branchName]: branchName } } }
    lines.push(`branch '${branchName}' set up to track 'origin/${branchName}'.`)
  }
  return ok(nextState, lines.join('\n'))
}

function pushCurrentBranchRequiringUpstream(state: RemoteState, opts: { force: boolean; setUpstream: boolean }): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  const branch = local.head
  if (!has(local.upstream, branch)) return fail(state, PUSH_NO_UPSTREAM_BLOCK(branch), null, 128)
  return doPush(state, branch, opts)
}

function handlePush(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  for (const t of args) {
    if (!t.startsWith('-')) continue
    const cls = classifySection5Option('push', PUSH_SCOPE_FLAGS, t)
    if (cls === 'unknown') return fail(state, unknownFlagBlock(t, PUSH_USAGE), null, 129)
    if (cls === 'outOfScope') return fail(state, re.optionOutOfScope(`git push ${t}`, PUSH_ALLOWED))
  }
  const force = args.includes('-f') || args.includes('--force')
  const setUpstream = args.includes('-u') || args.includes('--set-upstream')
  const positionals = args.filter((a) => !a.startsWith('-'))
  const opts = { force, setUpstream }

  if (!positionals.length) return pushCurrentBranchRequiringUpstream(state, opts)

  const repoArg = positionals[0]
  if (classifyRepositoryArgument(repoArg) !== 'plain') return fail(state, re.optionOutOfScope(`git push ${repoArg}`, PUSH_ALLOWED))
  if (repoArg !== 'origin') return fail(state, NOT_A_REPO_BLOCK(repoArg), null, 128)

  const branchPositionals = positionals.slice(1)
  // refspec (<src>:<dst>, :<dst>, +ветка, refs/…, выражения ревизий) git принимает, раздел 5 не разбирает.
  const foreignRefspec = branchPositionals.find((b) => classifyPushRefspec(b) === 'foreign')
  if (foreignRefspec !== undefined) return fail(state, re.optionOutOfScope(`git push origin ${foreignRefspec}`, PUSH_ALLOWED))
  if (!branchPositionals.length) return pushCurrentBranchRequiringUpstream(state, opts)

  const local = state.local!
  const resolved = branchPositionals.map((b) => (b === 'HEAD' ? local.head : b))

  if (resolved.length === 1) {
    const [name] = resolved
    if (!has(local.branches, name)) {
      return fail(state, `error: src refspec ${name} does not match any\nerror: failed to push some refs to '${SERVER_PATH}'`, null, 1)
    }
    return doPush(state, name, opts)
  }

  // target.md, часть VII, опасное место 8: только буквально сверенная форма "git push origin
  // <ветка> extra" — первый refspec валиден, остальные не найдены среди веток → каждый невалидный
  // получает свою строку "src refspec … does not match any", отправлено НИЧЕГО.
  const [first, ...rest] = resolved
  const missing = rest.filter((r) => !has(local.branches, r))
  if (has(local.branches, first) && missing.length === rest.length) {
    const lines = missing.map((m) => `error: src refspec ${m} does not match any`)
    lines.push(`error: failed to push some refs to '${SERVER_PATH}'`)
    return fail(state, lines.join('\n'), null, 1)
  }
  return fail(state, re.optionOutOfScope(`git push origin ${branchPositionals.join(' ')}`, PUSH_ALLOWED))
}

// ---------- git pull ----------

/** Имена, которые git отвергает как refspec («invalid refspec»): пробелы и управляющие, ~ ^ ? [ \ *, «..», «@{», «//», край «.» или «/», компонент с «.» впереди или «.lock» в конце. */
// eslint-disable-next-line no-control-regex
const INVALID_REF_NAME = /[\s~^?[\\*\x00-\x1f\x7f]|\.\.|@\{|\/\/|^[./]|[./]$|\/\.|\.lock(\/|$)/
const PULL_ALLOWED = 'git pull, git pull origin <ветка>, git pull --no-rebase, git pull --ff-only'

function mergeCommitMessage(branch: string): string {
  return `Merge branch '${branch}' of ${SERVER_PATH}`
}

/**
 * target.md, часть VII, миссия 5: холостой pull (`upToDate`) не двигает цепочку «отклонённый
 * push → успешный pull → push»; а вот И перемотка, И слияние — оба «успешный pull, который
 * что-то интегрировал» (формулировка миссии не сужает её до слияния — сужает её только
 * ЕСТЕСТВЕННЫЙ ход миссии, см. замечания к миссиям), поэтому оба продвигают 'rejected' → 'pulled'.
 */
function integrationResultText(state: RemoteState, outcome: ReturnType<typeof pullIntegrate>): { state: RemoteState; result: CommandResult } {
  if (outcome.kind === 'upToDate') return ok(state, 'Already up to date.', rx.pullIsFetchPlusIntegration)
  if (outcome.kind === 'fastForward') {
    const progress = state.rejectPullPushProgress === 'rejected' ? 'pulled' : state.rejectPullPushProgress
    const nextState: RemoteState = { ...state, local: outcome.local, rejectPullPushProgress: progress }
    return ok(nextState, [`Updating ${outcome.fromShort}..${outcome.toShort}`, 'Fast-forward', ru.remote.notes.pullStatOmitted].join('\n'), rx.pullIsFetchPlusIntegration)
  }
  if (outcome.kind === 'merged') {
    const progress = state.rejectPullPushProgress === 'rejected' ? 'pulled' : state.rejectPullPushProgress
    const nextState: RemoteState = { ...state, local: outcome.local, clock: outcome.clock, rejectPullPushProgress: progress }
    return ok(nextState, ["Merge made by the 'ort' strategy.", ru.remote.notes.pullStatOmitted].join('\n'), rx.pullIsFetchPlusIntegration)
  }
  if (outcome.kind === 'conflict') {
    return fail(state, re.pullConflictOutOfScope(outcome.conflicts), `${rx.pullIsFetchPlusIntegration} ${rx.pullConflictStopped}`)
  }
  if (outcome.kind === 'ffOnlyRefused') {
    return fail(state, PULL_FF_ONLY_DIVERGED_BLOCK, `${rx.pullIsFetchPlusIntegration} ${rx.pullFfOnlyRefused}`, 128)
  }
  // outcome.kind === 'needsChoice'
  return fail(state, PULL_DIVERGED_NEEDS_CHOICE_BLOCK, `${rx.pullIsFetchPlusIntegration} ${rx.pullDivergedNoChoice} ${rx.pullNeedsChoice}`, 128)
}

/** Общее ядро pull ПОСЛЕ fetch-части: считает opts из флагов/настроек и вызывает pullIntegrate (remoteRepo.ts). branch — то, что интегрируем (текущая ветка при bare pull; явно указанная при `pull origin <ветка>`). */
function integrate(state: RemoteState, branch: string, remoteTip: string, cliMerge: boolean, cliFfOnly: boolean): { state: RemoteState; result: CommandResult } {
  const local = state.local!
  // --no-rebase в командной строке отменяет pull.ff only из настроек; --ff-only в командной
  // строке действует всегда. Без флагов pull.ff only сильнее pull.rebase false (сверено на
  // git 2.53.0, 26.09.2026).
  const opts = { merge: cliMerge || local.pullRebaseFalse, ffOnly: cliFfOnly || (local.pullFfOnly && !cliMerge) }
  const outcome = pullIntegrate(local, branch, remoteTip, opts, state.clock, mergeCommitMessage(branch))
  return integrationResultText(state, outcome)
}

function handlePull(state: RemoteState, args: string[]): { state: RemoteState; result: CommandResult } {
  let noRebase = false
  let ffOnly = false
  const positionals: string[] = []
  for (const t of args) {
    if (t === '--no-rebase') {
      noRebase = true
      continue
    }
    if (t === '--ff-only') {
      ffOnly = true
      continue
    }
    if (t.startsWith('-')) {
      const cls = classifySection5Option('pull', PULL_SCOPE_FLAGS, t)
      if (cls === 'unknown') return fail(state, unknownFlagBlock(t, PULL_USAGE), null, 129)
      return fail(state, re.optionOutOfScope(`git pull ${t}`, PULL_ALLOWED))
    }
    positionals.push(t)
  }

  const local = state.local!

  if (!positionals.length) {
    const branch = local.head
    const upstreamName = has(local.upstream, branch) ? local.upstream[branch] : undefined
    if (upstreamName === undefined) return fail(state, PULL_NO_TRACKING_BLOCK(branch), null, 1)
    const { local: fetchedLocal, updates } = performFetch(local, state.server)
    const fetchLines = formatFetchUpdates(updates)
    const afterFetch: RemoteState = { ...state, local: fetchedLocal }
    const remoteTip = fetchedLocal.remoteBranches[upstreamName]
    const built = integrate(afterFetch, branch, remoteTip, noRebase, ffOnly)
    if (!fetchLines.length) return built
    return { state: built.state, result: { ...built.result, output: [`From ${SERVER_PATH}`, ...fetchLines, built.result.output].filter((s) => s !== '').join('\n') } }
  }

  const repoArg = positionals[0]
  if (classifyRepositoryArgument(repoArg) !== 'plain') return fail(state, re.optionOutOfScope(`git pull ${repoArg}`, PULL_ALLOWED))
  if (repoArg !== 'origin') return fail(state, NOT_A_REPO_BLOCK(repoArg), null, 1)
  const branchArg = positionals[1]
  if (branchArg !== undefined && classifyPushRefspec(branchArg) === 'foreign') {
    return fail(state, re.optionOutOfScope(`git pull origin ${branchArg}`, PULL_ALLOWED))
  }
  if (branchArg === undefined) {
    // `git pull origin` без ветки — как bare `git pull` (target.md: «выводят то же, что без аргумента» — тот же принцип для push origin/fetch origin; для pull origin явных прогонов без ветки нет, но это тот же самый refspec-механизм, что и pull без repo вовсе).
    return handlePull(state, args.filter((a) => a !== repoArg))
  }
  if (positionals.length > 2) return fail(state, re.optionOutOfScope(`git pull origin ${positionals.slice(1).join(' ')}`, PULL_ALLOWED))

  const targetBranch = branchArg === 'HEAD' ? local.head : branchArg
  const { local: fetchedLocal, updates, notFound } = performFetch(local, state.server, targetBranch)
  if (notFound) {
    // Имена вида heads/x, tags/x, refs/… git сопоставляет с полными именами ссылок на сервере (DWIM) и
    // находит ветку, которой по точному имени нет; как именно — раздел 5 не воспроизводит: честный отказ.
    // Сверено на git 2.53.0, 06.10.2026: pull origin heads/master — успех, origin/master — fatal.
    if (/^(refs|heads|tags)\//.test(branchArg)) return fail(state, re.optionOutOfScope(`git pull origin ${branchArg}`, PULL_ALLOWED))
    // Имя, нарушающее правила имён ссылок, git разбирает как refspec и отвечает «invalid refspec» (код 1),
    // а не «couldn't find remote ref»; правила имён раздел не воспроизводит — честный отказ. Сверено на
    // git 2.53.0, 06.10.2026: master/, /master, .master, master..x, master.lock, «a b», a^b, a?b, a*b, a@{b.
    if (INVALID_REF_NAME.test(branchArg)) return fail(state, re.refnameShapeOutOfScope(`git pull origin ${branchArg}`, PULL_ALLOWED))
    const otherCase = Object.keys(state.server.branches).find((b) => b.toLowerCase() === branchArg.toLowerCase()) ?? null
    // Подсказка про «локальную запись» верна, только если такая запись у игрока есть: для
    // origin/nosuch записи нет, и утверждать обратное нельзя.
    const localCopy = branchArg.startsWith('origin/') && Object.hasOwn(local.remoteBranches, branchArg.slice('origin/'.length))
    const hint = { localCopy, otherCase }
    return fail(state, `fatal: couldn't find remote ref ${branchArg}`, rx.pullRemoteRefMissing(branchArg, hint), 1)
  }

  const fetchLines = formatFetchUpdates(updates)
  const afterFetch: RemoteState = { ...state, local: fetchedLocal }
  const remoteTip = fetchedLocal.remoteBranches[targetBranch]
  const built = integrate(afterFetch, local.head, remoteTip, noRebase, ffOnly)
  // target.md, часть VII, опасное место 5: `git pull origin <ветка>` печатает строку FETCH_HEAD
  // ВСЕГДА (даже когда origin/<ветка> уже свежая), в отличие от bare pull, который эту часть
  // молчит целиком, если нечего обновлять. Ширина поля имени — та же формула, что и у fetch
  // (минимум 10, см. formatFetchUpdates) — здесь имя всего одно, поэтому width = max(10, длина).
  const fetchHeadWidth = Math.max(10, targetBranch.length)
  const header = [`From ${SERVER_PATH}`, ...fetchLines, refLine('*', 'branch', targetBranch, 'FETCH_HEAD', '', fetchHeadWidth)]
  return { state: built.state, result: { ...built.result, output: [...header, built.result.output].filter((s) => s !== '').join('\n') } }
}

// ---------- диспетчер ----------

function appendCommand(state: RemoteState, rawInput: string, result: CommandResult): RemoteState {
  return {
    ...state,
    history: [...state.history, { kind: 'command', input: rawInput, ok: result.ok, output: result.output, explanation: result.explanation }],
  }
}

/**
 * Выполняет одну строку терминала LOCAL раздела 5. Та же двухэтапная граница «шелл/git», что и в
 * разделах 1–4. Порядок проверок — тот же, что и в разделе 1 (commands.ts): имя подкоманды
 * классифицируется на три случая ДО того, есть ли репозиторий (target.md, A9/A10) — настоящий
 * git реагирует на неизвестную/нереализованную команду одинаково независимо от .git; только
 * ПОСЛЕ этой классификации проверяется repo (commandNeedsNoRepo — только clone).
 */
export function executeRemoteCommand(state: RemoteState, rawInput: string): { state: RemoteState; result: CommandResult | null } {
  if (!rawInput.trim()) return { state, result: null }

  const workingFiles = state.local ? Object.keys(state.local.working) : []
  const tokens = shellTokenize(rawInput, workingFiles)
  const words = tokens.map((t) => t.text)

  function respond(pair: { state: RemoteState; result: CommandResult }) {
    return { state: appendCommand(pair.state, rawInput, pair.result), result: pair.result }
  }

  const refusal = findShellRefusal(rawInput)
  if (refusal) return respond(fail(state, shellRefusalText(refusal)))

  if (words[0] !== 'git') return respond(fail(state, ru.errors.bashCommandNotFound(words[0] ?? '')))

  const badGlob = tokens.slice(1).find((t) => t.unsupportedGlob)
  if (badGlob) return respond(fail(state, ru.errors.shellGlobUnsupported(badGlob.text)))

  const sub = words[1]
  if (sub === undefined) return respond(fail(state, re.gitUsageNoArgs))
  if (isGlobalGitOption(sub)) return respond(fail(state, re.commandOutOfScope(sub)))

  if (!isSection5Command(sub)) {
    if (REAL_GIT_COMMANDS.has(sub)) return respond(fail(state, re.commandOutOfScope(sub)))
    return respond(fail(state, gitNotACommand(sub)))
  }

  if (!commandNeedsNoRepo(sub) && state.local === null) {
    return respond(fail(state, NOT_A_GIT_REPO, ru.explain.notAGitRepo, 128))
  }

  if (isSection2Command(sub)) {
    const misuse = completionHelperMisuse(sub, words.slice(2))
    if (misuse !== null) return respond(fail(state, misuse, null, 129))
  }

  let outcome: { state: RemoteState; result: CommandResult }
  switch (sub) {
    case 'clone':
      outcome = handleClone(state, words.slice(2))
      break
    case 'remote':
      outcome = handleRemote(state, words.slice(2))
      break
    case 'branch':
      outcome = handleBranch(state, words.slice(2))
      break
    case 'checkout':
      outcome = handleCheckout(state, words.slice(2))
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
    case 'fetch':
      outcome = handleFetch(state, words.slice(2))
      break
    case 'push':
      outcome = handlePush(state, words.slice(2))
      break
    case 'pull':
      outcome = handlePull(state, words.slice(2))
      break
    case 'config':
      outcome = handleConfig(state, words.slice(2))
      break
  }
  return respond(outcome)
}

// ---------- кнопка «Коллега пушит» ----------

export { performColleaguePush } from './remoteRepo'
