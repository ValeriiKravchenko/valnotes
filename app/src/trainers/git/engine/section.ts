// ============================================================
// Раздел 1 git-тренажёра: публичная точка входа движка.
// Это единственный файл, который имеет смысл импортировать снаружи —
// он объединяет команды, файловые операции и миссии в согласованные
// переходы состояния. React/DOM здесь нет и быть не должно.
// ============================================================
import type { CommandResult, FileTree, MissionView, SectionState, StatusSnapshot } from './types'
import { Stage } from './types'
import { executeCommand as runCommandRaw } from './commands'
import { createFile as createFileRaw, deleteFile as deleteFileRaw, editFile as editFileRaw } from './fileOps'
import { getMissions as getMissionsRaw, initialMissionsDone, updateMissions } from './missions'
import {
  getStage as getStageRaw,
  getStatus as getStatusRaw,
  headTree as headTreeRaw,
  repoHasNoFiles as repoHasNoFilesRaw,
  SEED_FILE,
} from './repo'
import { ru } from '../locales/ru'

export type { CommandResult, FileTree, HistoryEntry, MissionId, MissionView, SectionState, StatusSnapshot } from './types'
export { Stage } from './types'

/**
 * Начальное состояние раздела 1 (Ш0, spec 2.2): репозитория нет, в рабочем дереве
 * лежит index.html, индекса и коммитов нет.
 */
export function createSection(): SectionState {
  return {
    initialized: false,
    branch: null,
    commits: [],
    index: {},
    working: { [SEED_FILE]: ru.fileOps.indexHtmlSeed },
    history: [],
    missionsDone: initialMissionsDone(),
    fileVersionIndex: {},
    clock: 0,
  }
}

/**
 * Кнопка «↺ Начать раздел заново» (S1-26): репозиторий и терминал возвращаются к Ш0,
 * все миссии снимаются. Ответы квиза раздел 1 в этом модуле не хранит.
 */
export function resetSection(): SectionState {
  return createSection()
}

/**
 * Выполняет одну строку терминала и сразу пересчитывает миссии (target.md, п.2 — «запоминаются»).
 * Пустая/пробельная строка не меняет состояние и возвращает result === null (spec S1-73).
 */
export function runCommand(state: SectionState, rawInput: string): { state: SectionState; result: CommandResult | null } {
  const { state: afterCommand, result } = runCommandRaw(state, rawInput)
  if (result === null) return { state, result: null }
  return { state: updateMissions(afterCommand), result }
}

/** Кнопка «✎ изменить» + пересчёт миссий. */
export function editFile(state: SectionState, file: string): SectionState {
  return updateMissions(editFileRaw(state, file))
}

/** Кнопка «🗑 удалить из каталога» + пересчёт миссий. */
export function deleteFile(state: SectionState, file: string): SectionState {
  return updateMissions(deleteFileRaw(state, file))
}

/** «создать файл» (кнопка или Enter в поле имени) + пересчёт миссий. */
export function createFile(state: SectionState, name: string): SectionState {
  return updateMissions(createFileRaw(state, name))
}

/** Ш0–Ш4 — см. spec 2.3. */
export function getStage(state: SectionState): Stage {
  return getStageRaw(state)
}

/**
 * target.md, п.3: различает внутри Stage.Empty «нет ни одного файла» (подпись «пусто») от
 * «есть неотслеживаемый файл, индекса/коммитов ещё нет» — см. repo.ts, repoHasNoFiles.
 */
export function repoHasNoFiles(state: SectionState): boolean {
  return repoHasNoFilesRaw(state)
}

/** Структурированный git status (для панелей/тестов — без форматирования в текст). */
export function getStatus(state: SectionState): StatusSnapshot {
  return getStatusRaw(state)
}

/**
 * Дерево HEAD — последнего коммита. Пустой объект, если коммитов ещё нет.
 *
 * Инкапсулирует правило «HEAD — последний коммит из state.commits»: оно верно, пока в разделе
 * нет веток (см. types.ts, SectionState.branch), и перестанет быть верным, когда они появятся
 * (раздел 3). До этого геттера интерфейс читал `state.commits[state.commits.length - 1]?.tree`
 * напрямую — переход на этот геттер в компонентах делает интегратор отдельно, здесь только
 * публикуется сама функция.
 */
export function getHeadTree(state: SectionState): FileTree {
  return headTreeRaw(state)
}

/** Список миссий с флагом done, в порядке показа (spec 2.8). */
export function getMissions(state: SectionState): MissionView[] {
  return getMissionsRaw(state)
}
