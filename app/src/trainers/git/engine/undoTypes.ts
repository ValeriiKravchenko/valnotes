// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): типы состояния.
//
// По архитектуре — прямой аналог branchTypes.ts/inspectTypes.ts: своя,
// отдельная форма данных (не расширение BranchingState/InspectState и не
// импорт из них) — раздел 2 (branch*.ts) не трогается, раздел 3 (inspect*.ts)
// тоже (задача прямо требует новые модули РЯДОМ).
//
// В отличие от раздела 3 здесь у коммита не больше одного родителя, КАК и в
// разделе 3 (revert/reset этого раздела не создают коммитов слияния), но, в
// отличие от раздела 3, история НЕ статична: revert добавляет коммиты, reset
// двигает ветку — а branchOrder/`branches` нужны, потому что `git branch
// rescue <хэш>` (target.md, часть VI, «Недостижимые коммиты на графе») может
// завести ВТОРУЮ ветку, указывающую на отброшенный после reset коммит.
//
// `commits` хранит ВСЕ когда-либо созданные коммиты, включая недостижимые ни
// из одной ветки после reset — ровно как настоящий git не удаляет объект
// коммита при `git reset` (target.md, часть VI, опасное место 3: «коммит не
// уничтожен»). «Осиротевшие» коммиты поэтому не отдельное поле состояния, а
// вычисляются на лету (undoRepo.ts, getOrphanCommits) — тот же коммит,
// однажды переставший быть достижимым, показывается на графе бледным, пока
// на него снова не укажет какая-нибудь ветка.
// ============================================================
import type { CommandResult, FileTree, HistoryEntry } from './types'

export type { CommandResult, FileTree, HistoryEntry }

/** Один коммит раздела 4. 0 родителей — корневой коммит, 1 — обычный (revert/commit). Слияний в этом разделе не бывает. */
export interface UndoCommit {
  /** 7-значный хэш от содержимого (см. util.ts, commitHashCore) — тот же приём, что и в разделах 1–3 (target.md, A5). */
  id: string
  parentId: string | null
  message: string
  tree: FileTree
}

/**
 * Идентификаторы миссий раздела 4 (target.md, часть VI, «Миссии» — из spec.md, S4-31/S4-32,
 * формулировки из source.html, ch4.missions). Все четыре — «по событию» (успешный вызов команды
 * нужной формы, а не устойчивое состояние — кроме revertComicSans, которая смотрит на факт
 * существования нужного коммита в истории: тот же результат, что и «по событию», потому что
 * коммиты этот раздел не удаляет).
 */
export type UndoMissionId = 'findComicSans' | 'revertComicSans' | 'resetSoft' | 'resetHard'

export const UNDO_MISSION_IDS: readonly UndoMissionId[] = ['findComicSans', 'revertComicSans', 'resetSoft', 'resetHard']

export interface UndoMissionView {
  id: UndoMissionId
  text: string
  hint: string
  done: boolean
}

/**
 * Состояние раздела 4 (repl). Репозиторий уже инициализирован и полон истории с самого начала
 * (target.md, часть VI, «Исходное состояние») — `git init` вне области (undoScope.ts).
 *
 * HEAD всегда указывает на ветку (ключ в `branches`) — detached HEAD, как и в разделах 2–3, вне
 * области; но, в отличие от разделов 2–3, веток может стать больше одной (`git branch rescue
 * <хэш>`) без переключения на них — HEAD остаётся на исходной ветке.
 */
export interface UndoState {
  /** Хранилище коммитов по id — ВСЕ когда-либо созданные, включая недостижимые ни из одной ветки. */
  commits: Record<string, UndoCommit>
  /** Имя ветки → id коммита-вершины. */
  branches: Record<string, string>
  /** Порядок создания веток — тот же приём, что и BranchingState.branchOrder (числовые имена веток иначе ломают порядок ключей объекта). */
  branchOrder: string[]
  /** Имя текущей ветки (HEAD). */
  head: string
  index: FileTree
  working: FileTree
  history: HistoryEntry[]
  /** Миссии раздела 4 — тот же принцип «однажды true — навсегда true» (target.md, п.2). */
  missionsDone: Record<UndoMissionId, boolean>
  /** Логические часы для хэша коммита (target.md, A5; util.ts, commitHashCore) — растут на единицу при каждом новом коммите (revert или commit). */
  clock: number
}
