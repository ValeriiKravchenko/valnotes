// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): типы состояния.
//
// По архитектуре — прямой аналог branchTypes.ts раздела 2: своя, отдельная
// форма данных (не расширение BranchingState и не импорт из branchTypes.ts),
// потому что критерии этого раздела другие (история коммитов, диапазоны
// ссылок, диффы) — раздел 2 (branch*.ts) не трогается (задача прямо требует
// новые модули РЯДОМ, не правки в branch*.ts).
//
// В отличие от раздела 2 здесь нет команд, создающих ветки или слияния
// (branch/checkout/merge вне области раздела 3, см. inspectScope.ts) — но
// поле `branches` всё равно нужно как модель данных: `git log master` и
// `master~1` (target.md, часть V, «Что входит» — ссылки на коммиты по имени
// ветки) требуют уметь найти коммит по имени ветки. У коммита не больше
// одного родителя — раздел 3 не создаёт коммитов слияния (их вообще не
// существует в исходных данных раздела, target.md часть V, «Что НЕ входит»,
// `HEAD^2`).
// ============================================================
import type { CommandResult, FileTree, HistoryEntry } from './types'

export type { CommandResult, FileTree, HistoryEntry }

/** Один коммит раздела 3. 0 родителей — корневой коммит, 1 — обычный. Слияний в этом разделе не бывает. */
export interface InspectCommit {
  /** 7-значный хэш от содержимого (см. util.ts, commitHashCore) — тот же принцип, что и в разделах 1–2 (target.md, A5). */
  id: string
  /** null у корневого коммита, иначе id родителя. */
  parentId: string | null
  message: string
  tree: FileTree
}

/** Идентификаторы миссий раздела 3 (target.md, часть V, «Миссии») — порядок = порядок показа.
 * Все четыре засчитываются «по событию»: успешный вызов команды именно этой формы, а не
 * устойчивое состояние репозитория (target.md: «Засчитываются по событию (суть миссии — в
 * действии)») — см. inspectMissions.ts. */
export type InspectMissionId = 'log' | 'logOneline' | 'diff' | 'diffStaged'

export const INSPECT_MISSION_IDS: readonly InspectMissionId[] = ['log', 'logOneline', 'diff', 'diffStaged']

export interface InspectMissionView {
  id: InspectMissionId
  text: string
  hint: string
  done: boolean
}

/**
 * Состояние раздела 3. Репозиторий уже инициализирован и полон истории с самого начала
 * (target.md, часть V, «Исходное состояние») — состояний NoRepo/Empty раздела 1 здесь не нужно,
 * `git init` вне области этого раздела (inspectScope.ts).
 *
 * HEAD всегда указывает на ветку (ключ в `branches`) — детач HEAD вне области (раздел 3 не
 * переключает ветки вовсе, checkout/branch не входят в SECTION3_COMMANDS).
 */
export interface InspectState {
  /** Хранилище коммитов по id — цепочка (не граф: у коммита раздела 3 не больше одного родителя). */
  commits: Record<string, InspectCommit>
  /** Имя ветки → id коммита-вершины. В разделе 3 обычно ровно одна ветка ('master'). */
  branches: Record<string, string>
  /** Имя текущей ветки (HEAD). */
  head: string
  index: FileTree
  working: FileTree
  history: HistoryEntry[]
  /** Миссии раздела 3 — тот же принцип «однажды true — навсегда true» (target.md, п.2). */
  missionsDone: Record<InspectMissionId, boolean>
}
