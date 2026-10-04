// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): публичная точка входа. Аналог
// branchSection.ts/inspectSection.ts — интегратору достаточно импортировать
// отсюда (или из общего index.ts, см. его шапку), внутренние модули
// (undoRepo.ts/undoCommands.ts/undoScope.ts) напрямую снаружи пакета
// engine/ не импортируются.
// ============================================================
import type { FileTree, UndoCommit, UndoMissionView, UndoState, CommandResult } from './undoTypes'
import { executeUndoCommand } from './undoCommands'
import { undoCommitHash, headTree as headTreeRaw, getCommit as getCommitRaw, getOrphanCommits as getOrphanCommitsRaw } from './undoRepo'
import { getUndoMissions as getUndoMissionsRaw, initialUndoMissionsDone, updateUndoMissions } from './undoMissions'
import { createFile as createFileRaw, deleteFile as deleteFileRaw, editFile as editFileRaw } from './undoFileOps'

export type { CommandResult, FileTree, HistoryEntry, UndoCommit, UndoMissionId, UndoMissionView, UndoState } from './undoTypes'

/** Один коммит исходной цепочки раздела 4 (target.md, часть VI, «Исходное состояние») — сообщение и дерево; состав задаёт интегратор/словарь (ru.undo.seed), а не этот модуль (тот же принцип, что и InspectCommitSeed, inspectSection.ts). */
export interface UndoCommitSeed {
  message: string
  tree: FileTree
}

export interface UndoSeed {
  /** Цепочка коммитов, корневой первым — минимум один. */
  commits: readonly UndoCommitSeed[]
  /** Имя единственной ветки на старте — по умолчанию 'master'. */
  branch?: string
}

/**
 * Начальное состояние раздела 4: готовая цепочка коммитов, ветка `branch` указывает на последний.
 * Индекс и рабочее дерево на старте совпадают с последним коммитом (target.md, часть VI,
 * «Исходное состояние» не описывает несохранённых правок — их создают миссии/сценарии через
 * editFile).
 */
export function createUndoSection(seed: UndoSeed): UndoState {
  if (!seed.commits.length) throw new Error('invariant: раздел 4 требует хотя бы один коммит в seed.commits')
  const branch = seed.branch ?? 'master'
  const commits: UndoState['commits'] = {}
  let parentId: string | null = null
  let headId = ''
  for (let i = 0; i < seed.commits.length; i++) {
    const spec = seed.commits[i]
    const id = undoCommitHash(spec.message, spec.tree, parentId, i)
    commits[id] = { id, parentId, message: spec.message, tree: spec.tree }
    parentId = id
    headId = id
  }
  const headTreeSnapshot = commits[headId].tree

  return {
    commits,
    branches: { [branch]: headId },
    branchOrder: [branch],
    head: branch,
    index: { ...headTreeSnapshot },
    working: { ...headTreeSnapshot },
    history: [],
    missionsDone: initialUndoMissionsDone(),
    clock: seed.commits.length,
  }
}

/**
 * Выполняет одну строку терминала раздела 4 и сразу пересчитывает миссии (target.md, п.2 —
 * «запоминаются»), тот же приём, что и runBranchingCommand/runInspectCommand. Пустая/пробельная
 * строка не меняет состояние и возвращает result === null.
 */
export function runUndoCommand(state: UndoState, rawInput: string): { state: UndoState; result: CommandResult | null } {
  const { state: afterCommand, result } = executeUndoCommand(state, rawInput)
  if (result === null) return { state, result: null }
  return { state: updateUndoMissions(afterCommand), result }
}

/** Список миссий раздела 4 с флагом done, в порядке показа (target.md, часть VI, «Миссии»). */
export function getUndoMissions(state: UndoState): UndoMissionView[] {
  return getUndoMissionsRaw(state)
}

/** Кнопка «✎ изменить» + пересчёт миссий. */
export function editFile(state: UndoState, file: string): UndoState {
  return updateUndoMissions(editFileRaw(state, file))
}

/** Кнопка «🗑 удалить из каталога» + пересчёт миссий. */
export function deleteFile(state: UndoState, file: string): UndoState {
  return updateUndoMissions(deleteFileRaw(state, file))
}

/** «создать файл» + пересчёт миссий. */
export function createFile(state: UndoState, name: string): UndoState {
  return updateUndoMissions(createFileRaw(state, name))
}

/** Дерево файлов коммита, на который сейчас указывает HEAD. */
export function getHeadTree(state: UndoState): FileTree {
  return headTreeRaw(state)
}

/** Коммит по id — для графа коммитов на экране. */
export function getCommit(state: UndoState, id: string): UndoCommit | undefined {
  return getCommitRaw(state, id)
}

/** Все когда-либо созданные коммиты (для графа) — порядок не гарантирован, сортировка/раскладка — дело интерфейса. */
export function getAllCommits(state: UndoState): UndoCommit[] {
  return Object.values(state.commits)
}

/**
 * Коммиты, не достижимые ни из одной ветки (target.md, часть VI, «Недостижимые коммиты на
 * графе» — задача, п.4: «движок отдаёт их отдельным списком, чтобы интерфейс мог показать их
 * бледными»). Пусто в начальном состоянии раздела и после `git branch <имя> <хэш>`, указавшей на
 * ранее отброшенный коммит.
 */
export function getOrphanCommits(state: UndoState): UndoCommit[] {
  return getOrphanCommitsRaw(state)
}

/** Список веток в алфавитном порядке — тот же порядок, что печатает `git branch`. */
export function getBranchNames(state: UndoState): string[] {
  return Object.keys(state.branches).sort()
}

/** Имя ветки, на которую сейчас указывает HEAD. */
export function getCurrentBranch(state: UndoState): string {
  return state.head
}
