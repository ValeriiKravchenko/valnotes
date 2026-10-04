// ============================================================
// Раздел 2 git-тренажёра, шаг A: публичная точка входа. Аналог section.ts
// раздела 1 — интегратору достаточно импортировать отсюда (или из общего
// index.ts, см. его шапку), внутренние модули (branchRepo.ts/
// branchCommands.ts/branchScope.ts) напрямую снаружи не импортируются.
// ============================================================
import type { BranchCommit, BranchingState, BranchMissionView, CommandResult, FileTree } from './branchTypes'
import { executeBranchingCommand } from './branchCommands'
import { branchCommitHash, headTree as headTreeRaw, isAncestor as isAncestorRaw } from './branchRepo'
import { getBranchMissions as getBranchMissionsRaw, initialBranchMissionsDone, updateBranchMissions } from './branchMissions'
import { createFile as createFileRaw, deleteFile as deleteFileRaw, editFile as editFileRaw } from './branchFileOps'

export type { BranchCommit, BranchingState, BranchMissionId, BranchMissionView, CommandResult, FileTree, HistoryEntry } from './branchTypes'

/**
 * Начальное состояние шага A: одна ветка (по умолчанию `master`) с одним
 * корневым коммитом. Раздел 2 (в отличие от раздела 1) начинается уже
 * инициализированным (target.md, часть IV — «Откуда берётся правда» +
 * исходные данные раздела 2 в spec.md: готовый репозиторий с одним
 * коммитом) — состояние NoRepo/Empty раздела 1 здесь не нужно, `git init`
 * вне области этого шага (branchScope.ts).
 *
 * Содержимое корневого коммита и его сообщение — дело интегратора/словаря
 * (сайта конкретной миссии), а не этого модуля: он не должен придумывать
 * бизнес-контент («style.css» и т.п.), поэтому оба параметра обязательны.
 */
export function createBranchingSection(rootMessage: string, rootFiles: FileTree, initialBranch = 'master'): BranchingState {
  // Корневой коммит — шаг логических часов 0 (target.md, A5; util.ts, commitHashCore);
  // следующий коммит (обычный или слияния) получит шаг 1 и т.д. — см. clock ниже.
  const id = branchCommitHash(rootMessage, rootFiles, [], 0)
  const commit: BranchCommit = { id, parents: [], message: rootMessage, tree: rootFiles }
  return {
    commits: { [id]: commit },
    branches: { [initialBranch]: id },
    branchOrder: [initialBranch],
    head: initialBranch,
    index: { ...rootFiles },
    working: { ...rootFiles },
    history: [],
    missionsDone: initialBranchMissionsDone(),
    lastMerge: null,
    clock: 1,
  }
}

/**
 * Выполняет одну строку терминала и сразу пересчитывает миссии (target.md, п.2 —
 * «запоминаются»), тот же приём, что и runCommand раздела 1 (section.ts). Пустая/пробельная
 * строка не меняет состояние и возвращает result === null.
 */
export function runBranchingCommand(state: BranchingState, rawInput: string): { state: BranchingState; result: CommandResult | null } {
  const { state: afterCommand, result } = executeBranchingCommand(state, rawInput)
  if (result === null) return { state, result: null }
  return { state: updateBranchMissions(afterCommand), result }
}

/** Список миссий шага A с флагом done, в порядке показа (target.md, часть IV, «Миссии шага A»). */
export function getBranchMissions(state: BranchingState): BranchMissionView[] {
  return getBranchMissionsRaw(state)
}

/**
 * Кнопка «✎ изменить» + пересчёт миссий — аналог editFile раздела 1 (section.ts), но для
 * BranchingState (branchFileOps.ts). Без этих трёх функций миссии 3, 5 и 6 недостижимы через
 * публичный набор движка: интегратору нечем менять рабочее дерево раздела 2, а fileOps.ts
 * раздела 1 принимает SectionState, а не BranchingState.
 */
export function editFile(state: BranchingState, file: string): BranchingState {
  return updateBranchMissions(editFileRaw(state, file))
}

/** Кнопка «🗑 удалить из каталога» + пересчёт миссий (аналог deleteFile раздела 1). */
export function deleteFile(state: BranchingState, file: string): BranchingState {
  return updateBranchMissions(deleteFileRaw(state, file))
}

/** «создать файл» (кнопка или Enter в поле имени) + пересчёт миссий (аналог createFile раздела 1). */
export function createFile(state: BranchingState, name: string): BranchingState {
  return updateBranchMissions(createFileRaw(state, name))
}

/** Список веток в алфавитном порядке — тот же порядок, что печатает `git branch` (сверено на git 2.53.0). */
export function getBranchNames(state: BranchingState): string[] {
  return Object.keys(state.branches).sort()
}

/** Имя ветки, на которую сейчас указывает HEAD. */
export function getCurrentBranch(state: BranchingState): string {
  return state.head
}

/** Дерево файлов коммита, на который указывает текущая ветка (HEAD). */
export function getHeadTree(state: BranchingState): FileTree {
  return headTreeRaw(state)
}

/** Коммит по id — для графа коммитов на экране (родители → рисуем рёбра). */
export function getCommit(state: BranchingState, id: string): BranchCommit | undefined {
  return state.commits[id]
}

/** Все коммиты (для графа) — порядок не гарантирован, сортировка/раскладка — дело интерфейса. */
export function getAllCommits(state: BranchingState): BranchCommit[] {
  return Object.values(state.commits)
}

/** Является ли ветка `name` «слитой» в текущий HEAD — то же условие, что проверяет `git branch -d`. */
export function isBranchMerged(state: BranchingState, name: string): boolean {
  const tip = state.branches[name]
  if (tip === undefined) return false
  return isAncestorRaw(state, tip, state.branches[state.head])
}
