// ============================================================
// Раздел 6 git-тренажёра («Поиск в репозитории»), шаг A — репозиторий «Проект»
// (target.md, часть VIII). Только шаг A: git grep, git blame, git show, git log
// на репозитории с тремя коммитами app.js/utils.js/README.md. Шаг B
// («Магазин», git bisect) этим модулем НЕ реализуется — см. заметку в шапке
// searchSection.ts.
//
// По архитектуре — аналог inspectTypes.ts (раздел 3, линейная цепочка
// коммитов, не граф): своя, отдельная форма данных, разделы 1–5 не трогаются
// ни строкой. Отличия от раздела 3:
//  - у коммита есть автор/почта/дата (target.md, часть VIII, «Автор и дата
//    в разделе 6» — коммиты заданы сценарием заранее, поэтому печатать их
//    не значит выдумывать действия игрока, см. CommitDate ниже);
//  - id коммита — 40 шестнадцатеричных знаков, не 7 (target.md, «Движок»:
//    «Только в движке раздела 6»; util.ts и разделы 3–5 не трогаются) —
//    см. searchCommitId (searchRepo.ts);
//  - в разделе нет команд, создающих коммиты или меняющих файлы (target.md,
//    «Что НЕ входит»: «правки файлов» — рабочие каталоги всегда чистые),
//    поэтому здесь нет index/working отдельно от дерева коммита.
// ============================================================
import type { CommandResult, FileTree, HistoryEntry } from './types'

export type { CommandResult, FileTree, HistoryEntry }

/**
 * Дата коммита раздела 6 — данные сценария, не «логические часы» (target.md, «Автор и дата в
 * разделе 6»: «Их автор, почта и дата — часть сценария… одинаковы при каждом запуске»). Хранится
 * разобранной на поля, а не единой строкой, потому что печатается в ДВУХ разных форматах
 * (`git blame` — `ГГГГ-ММ-ДД ЧЧ:ММ:СС +ЗЗЗЗ`; `git show`/`git log` — `Thu Mar 12 10:00:00 2026
 * +0300`, target.md, «Форматы») — единый источник данных исключает риск, что два формата разойдутся
 * между собой. `month`/`day` — как в календаре (1–12, 1–31), не индексы с нуля. `tzOffsetMinutes` —
 * смещение от UTC в минутах (везде `+0300` в данных раздела, то есть 180).
 */
export interface CommitDate {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  tzOffsetMinutes: number
}

/** Один коммит раздела 6. 0 родителей — корневой (граничный, помечается `^` в blame), 1 — обычный. Коммитов слияния в разделе не бывает (target.md, «Движок»: коммиты заданы заранее, игрок их не создаёт). */
export interface SearchCommit {
  /** 40 шестнадцатеричных знаков (target.md, «Движок») — см. searchCommitId, searchRepo.ts. */
  id: string
  parentId: string | null
  message: string
  tree: FileTree
  author: string
  email: string
  date: CommitDate
}

/** Идентификаторы миссий шага A (target.md, часть VIII, «Миссии» — миссии 1–2 из трёх; миссия 3 относится к шагу B и здесь не определена). */
export type SearchMissionId = 'grepDebounce' | 'blameDatasetId'

export const SEARCH_MISSION_IDS: readonly SearchMissionId[] = ['grepDebounce', 'blameDatasetId']

export interface SearchMissionView {
  id: SearchMissionId
  text: string
  hint: string
  done: boolean
}

/**
 * Состояние репозитория «Проект» (шаг A). Единственная ветка (`master`), HEAD всегда указывает на
 * неё — отсоединённого HEAD в этом репозитории не бывает (target.md: «Отсоединённый HEAD… нужны
 * только шагу B»). Рабочее дерево коммитов не изменяется игроком (нет add/commit/checkout —
 * searchScope.ts), поэтому отдельных `index`/`working` не нужно: «сейчас на диске» — это всегда
 * дерево коммита, на который указывает `branches[head]`.
 */
export interface SearchState {
  commits: Record<string, SearchCommit>
  branches: Record<string, string>
  head: string
  history: HistoryEntry[]
  missionsDone: Record<SearchMissionId, boolean>
  /**
   * Побочные каналы миссий (тот же приём, что и `commitAfterColleagueEvent` раздела 5,
   * remoteTypes.ts — по истории команд не различить, ЧТО именно было найдено/показано, не
   * перечитывая вывод, а формат вывода зависит от флагов, см. searchCommands.ts). Все четыре —
   * монотонные: команда только устанавливает `true`, никогда не сбрасывает (target.md, п.2:
   * «Засчитанная миссия остаётся засчитанной»).
   *
   * - `grepFoundDebounceScenario` — миссия 1: успешный `git grep` БЕЗ ссылки на коммит, чьи
   *   совпадения включают и `README.md:4`, и `utils.js:5` (target.md, «Миссии», п.1).
   * - `blameLine5WithAuthor` — успешный `git blame app.js` БЕЗ `-s`, чей диапазон включает строку 5
   *   (первый вариант зачёта миссии 2).
   * - `blameLine5Suppressed` / `shownDatasetCommit` — второй вариант зачёта миссии 2: `-s`-версия
   *   blame показала строку 5, а ЗАТЕМ успешный `git show` коммита «Сохранять id товара…» —
   *   упрощение (см. отчёт о переносе): порядок «затем» не проверяется по факту (оба флага
   *   монотонны, без временной метки), только то, что оба события когда-либо произошли.
   */
  grepFoundDebounceScenario: boolean
  blameLine5WithAuthor: boolean
  blameLine5Suppressed: boolean
  shownDatasetCommit: boolean
}
