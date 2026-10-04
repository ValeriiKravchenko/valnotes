// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): типы состояния. По устройству —
// аналог branchTypes.ts/undoTypes.ts (граф коммитов раздела 2), но с ДВУМЯ
// репозиториями сразу: СЕРВЕР (bare, без индекса и рабочего каталога — target.md,
// часть VII, «Движок») и ЛОКАЛЬНАЯ КОПИЯ (полноценный BranchingState-подобный
// репозиторий + отдельные данные о сервере: origin/<ветка>, origin/HEAD,
// upstream, настройки pull). Раздел 2 не трогается ни строкой.
//
// «Коллега» отдельным репозиторием не моделируется (target.md, часть VII,
// «Кнопка «Коллега пушит»»: «Вторая копия целиком не моделируется») — нажатие
// кнопки просто двигает server.branches.master, как если бы коллега уже
// сделал pull→commit→push и никогда не получал отказов.
//
// Коммит раздела 5 — тот же объект (тот же id, содержимое-адресуемый хэш) и на
// сервере, и в копии: копия хранит СВОЙ экземпляр (см. remoteRepo.ts,
// collectReachable) — как настоящий git с двумя разными объектными базами,
// синхронизируемыми clone/fetch/push, а не общую ссылку на одну структуру.
// ============================================================
import type { CommandResult, FileTree, HistoryEntry } from './types'

export type { CommandResult, FileTree, HistoryEntry }

/** Один коммит раздела 5 — 0 родителей (корневой), 1 (обычный/коммит коллеги) или 2 (слияние при `git pull --no-rebase`). */
export interface RemoteCommit {
  id: string
  parents: string[]
  message: string
  tree: FileTree
}

/**
 * Сервер — bare-репозиторий (target.md, часть VII, «Движок»): коммиты и ветки, БЕЗ индекса и
 * рабочего каталога. `branchOrder` — тот же приём, что и `BranchingState.branchOrder`
 * (branchTypes.ts): порядок для детерминированного вывода `git fetch` (несколько веток сразу) —
 * не гарантирован порядком ключей обычного объекта.
 */
export interface ServerState {
  commits: Record<string, RemoteCommit>
  branches: Record<string, string>
  branchOrder: string[]
  /** Ветка по умолчанию (`HEAD` сервера) — та, что получает локальную ветку при `git clone`. */
  defaultBranch: string
}

/**
 * Локальная копия. Поля `commits`/`branches`/`branchOrder`/`head`/`index`/`working` — то же самое,
 * что у `BranchingState` (раздел 2), СВОЙ экземпляр объектной базы (не общий с сервером — см.
 * шапку файла). Остальные поля — то, что добавляет раздел 5 (target.md, часть VII, «Движок»,
 * таблица «Что хранит»).
 */
export interface LocalRepo {
  commits: Record<string, RemoteCommit>
  branches: Record<string, string>
  branchOrder: string[]
  head: string
  index: FileTree
  working: FileTree
  /** `origin/<ветка>` → id коммита — запись о сервере на момент ПОСЛЕДНЕГО контакта (target.md,
   * часть VII: «Меняют её только clone, fetch… и успешный push»). */
  remoteBranches: Record<string, string>
  /** `origin/HEAD` → имя ветки (ставит только clone). `null`, если клона ещё не было (не
   * используется — LocalRepo целиком создаётся только при клоне), оставлено на будущее (target.md
   * не описывает сценария, где origin/HEAD меняется после clone). */
  remoteHeadBranch: string
  /** Локальная ветка → имя ветки сервера, за которой она следит (upstream). Ставят clone (для
   * ветки по умолчанию) и `push -u` (target.md, часть VII, «Движок»). Ветки без записи здесь —
   * «без upstream» (опасное место 7): у `git status` для них нет строк про сервер. */
  upstream: Record<string, string>
  /** `git config pull.rebase false` выполнена (target.md, «Что входит», «Настройка pull»). */
  pullRebaseFalse: boolean
  /** `git config pull.ff only` выполнена. */
  pullFfOnly: boolean
}

/**
 * Идентификаторы пяти миссий раздела 5 (target.md, часть VII, «Миссии», формулировки 1–4 из
 * source.html, миссия 5 — переписана под опасные места 2 и 5). Порядок = порядок показа.
 */
export type RemoteMissionId = 'cloneRepo' | 'commitLocally' | 'pushCommit' | 'commitAfterColleague' | 'rejectPullPush'

export const REMOTE_MISSION_IDS: readonly RemoteMissionId[] = ['cloneRepo', 'commitLocally', 'pushCommit', 'commitAfterColleague', 'rejectPullPush']

export interface RemoteMissionView {
  id: RemoteMissionId
  text: string
  hint: string
  done: boolean
}

/**
 * Полное состояние раздела 5. `location` — где сейчас стоит терминал LOCAL (target.md, часть VII,
 * опасное место 11: до `clone` — рядом с сервером, `/team`; после — внутри копии, `/team/local` —
 * это меняет, что отвечает повторный `git clone origin local`). `local === null` до первого
 * успешного `clone` — тогда `location` всегда `'outside'`.
 *
 * `clock` — ОДНИ логические часы на весь раздел (target.md, часть VII, «Движок»: «Логические часы
 * одни на весь раздел: сервер, копия и коллега») — растут на 1 при КАЖДОМ новом коммите, откуда бы
 * он ни появился (свой commit, коллега, коммит слияния при pull), см. util.ts, commitHashCore.
 *
 * `serverNotes` — речь тренажёра в терминале SERVER («коллега сделал(а) коммит …», target.md,
 * часть VII: «оформлена как речь», не вывод git) — отдельно от `history` (это только терминал
 * LOCAL).
 */
export interface RemoteState {
  location: 'outside' | 'local'
  server: ServerState
  local: LocalRepo | null
  clock: number
  history: HistoryEntry[]
  serverNotes: string[]
  /** Сколько раз нажали «Коллега пушит» — нужно для текста файла/сообщения (target.md, часть VII: «n-е… дописывает строку… №<n>»). */
  colleaguePushCount: number
  /**
   * Побочный канал для миссии 4 (target.md, часть VII, «Миссии»: «commit до нажатия не
   * считается») — тот же приём, что и `lastMerge` раздела 2 (branchTypes.ts): по одному только
   * графу коммитов «коммит сделан ДО или ПОСЛЕ клика коллеги» не различить (коллега коммитит на
   * СЕРВЕР, локальный граф коммита коллеги вообще не видит до fetch/pull) — момент решает сам
   * обработчик `git commit` (remoteCommands.ts, handleCommit), проверяя `colleaguePushCount > 0`
   * в момент коммита. Монотонный флаг: команда только устанавливает `true`, никогда не сбрасывает.
   */
  commitAfterColleagueEvent: boolean
  /**
   * Побочный канал для миссии 5 (target.md, часть VII, «Миссии», формулировка 5: цепочка
   * «отклонённый push → успешный pull → push, который что-то отправил»; «холостые pull и push не
   * засчитывают»). Продвигают его сами обработчики push/pull (remoteCommands.ts) — тот же приём,
   * что и `commitAfterColleagueEvent` выше: 'none' → 'rejected' (push отклонён) → 'pulled'
   * (последующий pull реально что-то интегрировал — перемотка или слияние, НЕ холостой) →
   * 'done' (последующий push реально что-то отправил, НЕ холостой). Правильный порядок — часть
   * определения; событие, случившееся не на своём шаге (например push, который что-то отправил,
   * без предшествующего отказа), прогресс не двигает.
   */
  rejectPullPushProgress: 'none' | 'rejected' | 'pulled' | 'done'
  missionsDone: Record<RemoteMissionId, boolean>
}
