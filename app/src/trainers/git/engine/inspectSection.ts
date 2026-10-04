// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): публичная точка входа.
// Аналог section.ts/branchSection.ts — интегратору достаточно импортировать
// отсюда (или из общего index.ts, см. его шапку), внутренние модули
// (inspectRepo.ts/inspectCommands.ts/inspectDiff.ts/inspectScope.ts)
// напрямую снаружи пакета engine/ не импортируются.
// ============================================================
import type { FileTree, InspectCommit, InspectMissionView, InspectState, CommandResult } from './inspectTypes'
import { executeInspectCommand } from './inspectCommands'
import { inspectCommitHash, getCommit as getCommitRaw, headTree as headTreeRaw } from './inspectRepo'
import { getInspectMissions as getInspectMissionsRaw, initialInspectMissionsDone, updateInspectMissions } from './inspectMissions'
import { createFile as createFileRaw, deleteFile as deleteFileRaw, editFile as editFileRaw } from './inspectFileOps'

export type { CommandResult, FileTree, HistoryEntry, InspectCommit, InspectMissionId, InspectMissionView, InspectState } from './inspectTypes'

/** Один коммит исходной цепочки раздела 3 (target.md, часть V, «Исходное состояние») — сообщение и дерево, состав задаёт интегратор/словарь (сайта конкретной миссии), а не этот модуль (тот же принцип, что и у createBranchingSection, branchSection.ts: движок не придумывает бизнес-контент). */
export interface InspectCommitSeed {
  message: string
  tree: FileTree
}

export interface InspectSeed {
  /** Цепочка коммитов, корневой первым — минимум один (target.md, часть V: «три коммита», но
   * модуль сам количество не фиксирует, это дело интегратора). */
  commits: readonly InspectCommitSeed[]
  /** Индекс поверх дерева последнего коммита — какие файлы застейджены и с каким содержимым
   * (target.md, «Исходное состояние»: `style.css` изменён и подготовлен). По умолчанию равен
   * дереву последнего коммита (индекс чист). */
  index?: FileTree
  /** Рабочее дерево поверх индекса (target.md: `index.html` изменён и не подготовлен). По
   * умолчанию равно индексу (рабочее дерево чисто). */
  working?: FileTree
  /** Имя единственной ветки — по умолчанию 'master' (target.md, «Исходное состояние»). */
  branch?: string
}

/**
 * Начальное состояние раздела 3: готовая цепочка коммитов, ветка `branch` указывает на последний.
 * В отличие от разделов 1–2 сюда не нужен параметр clock/rootMessage по отдельности — вся
 * цепочка передаётся сразу целиком (раздел 3 никогда не добавляет новых коммитов во время
 * работы движка, add/commit вне области — inspectScope.ts, — поэтому «логические часы» существуют
 * только на момент построения этой цепочки, а не как поле состояния).
 */
export function createInspectSection(seed: InspectSeed): InspectState {
  if (!seed.commits.length) throw new Error('invariant: раздел 3 требует хотя бы один коммит в seed.commits')
  const branch = seed.branch ?? 'master'
  const commits: InspectState['commits'] = {}
  let parentId: string | null = null
  let headId = ''
  for (let i = 0; i < seed.commits.length; i++) {
    const spec = seed.commits[i]
    const id = inspectCommitHash(spec.message, spec.tree, parentId, i)
    commits[id] = { id, parentId, message: spec.message, tree: spec.tree }
    parentId = id
    headId = id
  }
  const headTreeSnapshot = commits[headId].tree
  const index = seed.index ?? { ...headTreeSnapshot }
  const working = seed.working ?? { ...index }

  return {
    commits,
    branches: { [branch]: headId },
    head: branch,
    index,
    working,
    history: [],
    missionsDone: initialInspectMissionsDone(),
  }
}

/**
 * Выполняет одну строку терминала раздела 3 и сразу пересчитывает миссии (target.md, п.2 —
 * «запоминаются»), тот же приём, что и runCommand/runBranchingCommand. Пустая/пробельная строка
 * не меняет состояние и возвращает result === null.
 */
export function runInspectCommand(state: InspectState, rawInput: string): { state: InspectState; result: CommandResult | null } {
  const { state: afterCommand, result } = executeInspectCommand(state, rawInput)
  if (result === null) return { state, result: null }
  return { state: updateInspectMissions(afterCommand), result }
}

/** Список миссий раздела 3 с флагом done, в порядке показа (target.md, часть V, «Миссии»). */
export function getInspectMissions(state: InspectState): InspectMissionView[] {
  return getInspectMissionsRaw(state)
}

/** Кнопка «✎ изменить» + пересчёт миссий. */
export function editFile(state: InspectState, file: string): InspectState {
  return updateInspectMissions(editFileRaw(state, file))
}

/** Кнопка «🗑 удалить из каталога» + пересчёт миссий. */
export function deleteFile(state: InspectState, file: string): InspectState {
  return updateInspectMissions(deleteFileRaw(state, file))
}

/** «создать файл» + пересчёт миссий. */
export function createFile(state: InspectState, name: string): InspectState {
  return updateInspectMissions(createFileRaw(state, name))
}

/** Дерево файлов коммита, на который сейчас указывает единственная ветка (HEAD). */
export function getHeadTree(state: InspectState): FileTree {
  return headTreeRaw(state)
}

/** Коммит по id — для графа коммитов на экране. */
export function getCommit(state: InspectState, id: string): InspectCommit | undefined {
  return getCommitRaw(state, id)
}

/** Все коммиты (для графа) — порядок не гарантирован, сортировка/раскладка — дело интерфейса. */
export function getAllCommits(state: InspectState): InspectCommit[] {
  return Object.values(state.commits)
}
