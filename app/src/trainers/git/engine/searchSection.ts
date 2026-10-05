// ============================================================
// Раздел 6 git-тренажёра («Поиск в репозитории»), ШАГ A — репозиторий
// «Проект»: публичная точка входа. Аналог inspectSection.ts (раздел 3) —
// интегратору достаточно импортировать отсюда (или из общего index.ts).
// Внутренние модули (searchRepo.ts/searchCommands.ts/searchGrep.ts/
// searchBlame.ts/searchScope.ts) напрямую снаружи пакета
// engine/ не импортируются.
//
// ШАГ B («Магазин», git bisect, target.md, часть VIII) этим модулем НЕ
// реализован — это отдельная задача (см. заметку в шапке searchTypes.ts).
// Здесь нет ни второго репозитория, ни отсоединённого HEAD, ни состояния
// bisect: `git bisect` в этом терминале отвечает по правилу области
// (searchScope.ts, isBisectCommand; ru.searching.errors.bisectOtherTerminal).
// ============================================================
import type { CommandResult, CommitDate, FileTree, SearchCommit, SearchMissionView, SearchState } from './searchTypes'
import { executeSearchCommand } from './searchCommands'
import { searchCommitId, getCommit as getCommitRaw, headTree as headTreeRaw } from './searchRepo'
import { getSearchMissions as getSearchMissionsRaw, initialSearchMissionsDone, updateSearchMissions } from './searchMissions'

export type { CommandResult, CommitDate, FileTree, HistoryEntry, SearchCommit, SearchMissionId, SearchMissionView, SearchState } from './searchTypes'

/** Один коммит исходной цепочки «Проекта» (target.md, часть VIII, «Исходное состояние») — состав задаёт интегратор/словарь (см. ru.searching.seed), а не этот модуль (тот же принцип, что и InspectCommitSeed, inspectSection.ts: движок не придумывает бизнес-контент сценария). */
export interface SearchCommitSeed {
  message: string
  tree: FileTree
  author: string
  email: string
  date: CommitDate
}

export interface SearchSeed {
  /** Цепочка коммитов «Проекта», корневой первым — минимум один (target.md: «три коммита», но модуль сам количество не фиксирует). */
  commits: readonly SearchCommitSeed[]
  /** Имя единственной ветки — по умолчанию 'master' (target.md, «Исходное состояние»). */
  branch?: string
}

/**
 * Начальное состояние репозитория «Проект»: готовая цепочка коммитов (с полными данными автора/
 * почты/даты — target.md, «Автор и дата в разделе 6»), ветка `branch` указывает на последний. Как
 * и раздел 3 (createInspectSection), не нуждается в отдельном параметре `clock`: коммиты раздела 6
 * заданы сценарием целиком заранее, а не рождаются по ходу игры (searchTypes.ts, SearchCommit) —
 * их id вычисляется из содержимого И данных сценария (searchCommitId, searchRepo.ts), а не из
 * порядкового номера шага.
 */
export function createSearchSection(seed: SearchSeed): SearchState {
  if (!seed.commits.length) throw new Error('invariant: раздел 6 (шаг A) требует хотя бы один коммит в seed.commits')
  const branch = seed.branch ?? 'master'
  const commits: SearchState['commits'] = {}
  let parentId: string | null = null
  let headId = ''
  for (const spec of seed.commits) {
    const id = searchCommitId(spec.message, spec.tree, parentId, spec.author, spec.email, spec.date)
    commits[id] = { id, parentId, message: spec.message, tree: spec.tree, author: spec.author, email: spec.email, date: spec.date }
    parentId = id
    headId = id
  }

  return {
    commits,
    branches: { [branch]: headId },
    head: branch,
    history: [],
    missionsDone: initialSearchMissionsDone(),
    grepFoundDebounceScenario: false,
    blameLine5WithAuthor: false,
    blameLine5Suppressed: false,
    shownDatasetCommit: false,
  }
}

/** Выполняет одну строку терминала «Проект» и сразу пересчитывает миссии (target.md, часть I, п.2 — «запоминаются»), тот же приём, что и runInspectCommand. Пустая/пробельная строка не меняет состояние и возвращает `result === null`. */
export function runSearchCommand(state: SearchState, rawInput: string): { state: SearchState; result: CommandResult | null } {
  const { state: afterCommand, result } = executeSearchCommand(state, rawInput)
  if (result === null) return { state, result: null }
  return { state: updateSearchMissions(afterCommand), result }
}

/** Список миссий шага A с флагом done, в порядке показа (target.md, часть VIII, «Миссии»). */
export function getSearchMissions(state: SearchState): SearchMissionView[] {
  return getSearchMissionsRaw(state)
}

/** Дерево файлов коммита, на который сейчас указывает единственная ветка (HEAD). Рабочее дерево репозитория «Проект» всегда совпадает с ним — правок файлов в разделе нет (target.md, «Что НЕ входит»). */
export function getHeadTree(state: SearchState): FileTree {
  return headTreeRaw(state)
}

/** Коммит по id — для графа коммитов на экране. */
export function getCommit(state: SearchState, id: string): SearchCommit | undefined {
  return getCommitRaw(state, id)
}

/** Все коммиты (для графа) — порядок не гарантирован, сортировка/раскладка — дело интерфейса. */
export function getAllCommits(state: SearchState): SearchCommit[] {
  return Object.values(state.commits)
}
