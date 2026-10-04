// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): публичная точка входа. Аналог
// branchSection.ts/undoSection.ts — интегратору достаточно импортировать
// отсюда (или из общего index.ts), внутренние модули (remoteRepo.ts/
// remoteCommands.ts/remoteScope.ts) напрямую снаружи пакета engine/ не
// импортируются.
// ============================================================
import type { CommandResult, FileTree, RemoteCommit, RemoteMissionView, RemoteState, ServerState } from './remoteTypes'
import { REMOTE_MISSION_IDS } from './remoteTypes'
import { executeRemoteCommand, performColleaguePush } from './remoteCommands'
import { remoteCommitHash } from './remoteRepo'
import { getRemoteMissions as getRemoteMissionsRaw, initialRemoteMissionsDone, updateRemoteMissions } from './remoteMissions'
import { createFile as createFileRaw, deleteFile as deleteFileRaw, editFile as editFileRaw } from './remoteFileOps'

export type { CommandResult, FileTree, HistoryEntry, RemoteCommit, RemoteMissionId, RemoteMissionView, RemoteState } from './remoteTypes'

/** Исходное состояние сервера (target.md, часть VII, «Исходное состояние»): один коммит, одна ветка — бизнес-контент (сообщение/файлы) задаёт интегратор/словарь, а не этот модуль (тот же принцип, что и в разделах 2–4). */
export interface RemoteServerSeed {
  rootMessage: string
  rootTree: FileTree
  /** Ветка по умолчанию сервера — по умолчанию 'master'. */
  branch?: string
}

/**
 * Тексты кнопки «Коллега пушит» (target.md, часть VII, «Кнопка «Коллега пушит»») — бизнес-контент,
 * этот модуль его не придумывает. `nextChangelogLine`/`nextCommitMessage` принимают номер правки
 * (n ≥ 2 — первая правка использует `firstChangelogContent`/`firstCommitMessage`). `noteText` —
 * речь тренажёра в терминале SERVER, ей передаётся сообщение реального коммита (для показа
 * человеку, не для сравнения с выводом git).
 */
export interface RemoteColleagueSeed {
  firstChangelogContent: string
  nextChangelogLine: (n: number) => string
  firstCommitMessage: string
  nextCommitMessage: (n: number) => string
  noteText: (commitMessage: string) => string
}

export interface RemoteSeed {
  server: RemoteServerSeed
}

/** Создаёт исходное состояние раздела 5: сервер с одним коммитом, копии ещё нет (`local === null`, `location: 'outside'`) — до `git clone` любая другая команда отвечает "not a git repository" (target.md, часть VII, «Исходное состояние»). */
export function createRemoteSection(seed: RemoteSeed): RemoteState {
  const branch = seed.server.branch ?? 'master'
  const id = remoteCommitHash(seed.server.rootMessage, seed.server.rootTree, [], 0)
  const commit: RemoteCommit = { id, parents: [], message: seed.server.rootMessage, tree: seed.server.rootTree }
  const server: ServerState = { commits: { [id]: commit }, branches: { [branch]: id }, branchOrder: [branch], defaultBranch: branch }
  return {
    location: 'outside',
    server,
    local: null,
    clock: 1,
    history: [],
    serverNotes: [],
    colleaguePushCount: 0,
    missionsDone: initialRemoteMissionsDone(),
    commitAfterColleagueEvent: false,
    rejectPullPushProgress: 'none',
  }
}

/** Выполняет одну строку терминала LOCAL и пересчитывает миссии (тот же приём, что и run*Command остальных разделов). Пустая/пробельная строка не меняет состояние и возвращает result === null. */
export function runRemoteCommand(state: RemoteState, rawInput: string): { state: RemoteState; result: CommandResult | null } {
  const { state: afterCommand, result } = executeRemoteCommand(state, rawInput)
  if (result === null) return { state, result: null }
  return { state: updateRemoteMissions(afterCommand), result }
}

function buildChangelogContent(seed: RemoteColleagueSeed, n: number, previous: string | undefined): string {
  if (n === 1) return seed.firstChangelogContent
  return `${previous ?? seed.firstChangelogContent}\n${seed.nextChangelogLine(n)}`
}

function buildCommitMessage(seed: RemoteColleagueSeed, n: number): string {
  return n === 1 ? seed.firstCommitMessage : seed.nextCommitMessage(n)
}

/**
 * Кнопка «Коллега пушит» (target.md, часть VII, «Кнопка «Коллега пушит»») — двигает `master`
 * сервера, локальную копию не трогает вовсе (опасное место 1: `git status` сразу после нажатия
 * всё равно пишет "up to date"). `colleague` — тексты кнопки, задаёт интегратор/словарь.
 */
export function colleaguePush(state: RemoteState, colleague: RemoteColleagueSeed): RemoteState {
  const n = state.colleaguePushCount + 1
  const { server, commit, clock } = performColleaguePush(
    state.server,
    state.clock,
    n,
    (previous) => buildChangelogContent(colleague, n, previous),
    () => buildCommitMessage(colleague, n),
  )
  const note = colleague.noteText(commit.message)
  return updateRemoteMissions({ ...state, server, clock, colleaguePushCount: n, serverNotes: [...state.serverNotes, note] })
}

/** Список миссий раздела 5 с флагом done, в порядке показа (target.md, часть VII, «Миссии»). */
export function getRemoteMissions(state: RemoteState): RemoteMissionView[] {
  return getRemoteMissionsRaw(state)
}

export { REMOTE_MISSION_IDS }

/** Кнопка «✎ изменить» + пересчёт миссий. До clone (`local === null`) ничего не делает. */
export function editFile(state: RemoteState, file: string): RemoteState {
  return updateRemoteMissions(editFileRaw(state, file))
}

/** Кнопка «🗑 удалить из каталога» + пересчёт миссий. */
export function deleteFile(state: RemoteState, file: string): RemoteState {
  return updateRemoteMissions(deleteFileRaw(state, file))
}

/** «создать файл» + пересчёт миссий. */
export function createFile(state: RemoteState, name: string): RemoteState {
  return updateRemoteMissions(createFileRaw(state, name))
}

/** Есть ли уже локальная копия (после успешного `git clone`) — интегратору решать, показывать ли терминал/файлы LOCAL. */
export function isCloned(state: RemoteState): boolean {
  return state.local !== null
}

/** Дерево файлов коммита, на который сейчас указывает HEAD локальной копии. `null`, если клона ещё не было. */
export function getLocalHeadTree(state: RemoteState): FileTree | null {
  if (!state.local) return null
  return state.local.commits[state.local.branches[state.local.head]]?.tree ?? {}
}

/** Список локальных веток копии в алфавитном порядке (тот же порядок, что печатает `git branch`). */
export function getLocalBranchNames(state: RemoteState): string[] {
  return state.local ? Object.keys(state.local.branches).sort() : []
}

/** Имя ветки, на которую сейчас указывает HEAD копии. `null` до clone. */
export function getLocalCurrentBranch(state: RemoteState): string | null {
  return state.local?.head ?? null
}

/** Коммит копии по id — для графа коммитов на экране. */
export function getLocalCommit(state: RemoteState, id: string): RemoteCommit | undefined {
  return state.local?.commits[id]
}

/** Все коммиты, известные копии (для графа), включая унаследованные из origin/* через fetch — порядок не гарантирован. */
export function getAllLocalCommits(state: RemoteState): RemoteCommit[] {
  return state.local ? Object.values(state.local.commits) : []
}

/** Имена удалённых веток копии (`origin/<имя>`, без префикса) — то, что печатает `git branch -r` без строки origin/HEAD. */
export function getRemoteBranchNames(state: RemoteState): string[] {
  return state.local ? Object.keys(state.local.remoteBranches).sort() : []
}

/** Коммит сервера по id — терминал SERVER читает и рисует свой граф отдельно от локального. */
export function getServerCommit(state: RemoteState, id: string): RemoteCommit | undefined {
  return state.server.commits[id]
}

/** Все коммиты сервера — порядок не гарантирован. */
export function getAllServerCommits(state: RemoteState): RemoteCommit[] {
  return Object.values(state.server.commits)
}

/** Заметки терминала SERVER («коллега сделал(а) коммит …» — речь тренажёра, не вывод git, target.md часть VII). */
export function getServerNotes(state: RemoteState): string[] {
  return state.serverNotes
}
