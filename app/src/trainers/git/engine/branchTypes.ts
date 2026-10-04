// ============================================================
// Раздел 2 git-тренажёра («Ветвление кода»), шаг A: типы состояния.
//
// Раздел 1 (types.ts/repo.ts/commands.ts/section.ts) моделирует ОДНУ ветку —
// у него плоский массив коммитов и `branch: string | null` означает только
// «есть репозиторий или нет» (см. types.ts, комментарий у SectionState.branch:
// «раздел 1 не поддерживает другие ветки»). Раздел 2 требует по-настоящему
// другую модель данных — граф коммитов с несколькими указателями (ветками) и
// подвижным HEAD, у коммита может быть 0 (корневой), 1 (обычный) или
// 2 (слияние) родителя. Это новая форма данных, а не расширение старой,
// поэтому она живёт в отдельных файлах (branchTypes.ts/branchRepo.ts/
// branchCommands.ts/branchSection.ts), не трогая раздел 1 (задача прямо
// требует: поведение и файлы раздела 1 не меняются).
//
// Общие с разделом 1 куски reuse'ятся напрямую импортом (FileTree,
// CommandResult, HistoryEntry из types.ts — они не привязаны к одноветочной
// модели ничем, кроме соглашения об именах) — см. также util.ts (has),
// shell.ts (shellTokenize) и scope.ts (REAL_GIT_COMMANDS/isGlobalGitOption —
// это данные про настоящий git, а не про раздел 1).
// ============================================================
import type { CommandResult, FileTree, HistoryEntry } from './types'

export type { CommandResult, FileTree, HistoryEntry }

/** Один коммит графа раздела 2. 0 родителей — корневой коммит, 1 — обычный, 2 — коммит слияния. */
export interface BranchCommit {
  /** 7-значный хэш от содержимого (см. branchRepo.ts, branchCommitHash) — тот же принцип, что и в разделе 1 (target.md, A5). */
  id: string
  parents: string[]
  message: string
  tree: FileTree
}

/**
 * Идентификаторы миссий шага A (target.md, часть IV, «Миссии шага A») — порядок = порядок
 * показа. Устройство то же, что и MissionId/MISSION_IDS раздела 1 (types.ts) — отдельный тип
 * здесь, а не расширение MissionId раздела 1, потому что критерии зачёта разные (граф веток, а
 * не одна ветка) и это не должно менять раздел 1 (branchMissions.ts, комментарий к CHECKS).
 */
export type BranchMissionId = 'viewBranches' | 'createAndSwitch' | 'commitAndReturn' | 'fastForwardMerge' | 'divergedMerge' | 'deleteBranches'

export const BRANCH_MISSION_IDS: readonly BranchMissionId[] = [
  'viewBranches',
  'createAndSwitch',
  'commitAndReturn',
  'fastForwardMerge',
  'divergedMerge',
  'deleteBranches',
]

export interface BranchMissionView {
  id: BranchMissionId
  text: string
  hint: string
  done: boolean
}

/**
 * Вид последнего УСПЕШНОГО `git merge` (branchCommands.ts, handleMerge) — три исхода одной
 * команды, различает которую ветку кода handleMerge реально прошёл (перемотка / коммит слияния
 * / нечего сливать), а не текст вывода. Нужен миссии 4 (branchMissions.ts) — перемотка не создаёт
 * нового коммита, поэтому в графе коммитов её ничем не отличить от «ветки только что созданы и
 * ещё указывают на один и тот же коммит»; только сам факт «сейчас реально прошла перемотка»
 * это различает.
 */
export type MergeKind = 'fast-forward' | 'merge-commit' | 'up-to-date'

/**
 * Состояние раздела 2, шаг A. В отличие от раздела 1 репозиторий уже
 * инициализирован с самого начала (target.md, часть IV: спецификация
 * исходных данных раздела 2 — ветка master, готовый коммит) — состояния
 * Ш0 (NoRepo)/Ш1 (Empty) раздела 1 здесь не нужны, `git init` вне области
 * этого шага (см. branchScope.ts).
 *
 * HEAD в шаге A — всегда имя ветки (`head` — ключ в `branches`), отсоединённый
 * HEAD (checkout по хэшу) вне области (target.md, часть IV, «Что НЕ входит»).
 */
export interface BranchingState {
  /** Хранилище коммитов по id — граф, не список: у коммита слияния может быть 2 родителя. */
  commits: Record<string, BranchCommit>
  /** Имя ветки → id коммита, на который она указывает. */
  branches: Record<string, string>
  /**
   * Порядок создания веток: новое имя дописывается в конец, удалённое убирается.
   * Хранится отдельно от ключей `branches`: числовые имена веток («42») JS ставит
   * в начало ключей объекта независимо от порядка добавления.
   */
  branchOrder: string[]
  /** Имя текущей ветки (HEAD всегда указывает на ветку в шаге A). */
  head: string
  index: FileTree
  working: FileTree
  history: HistoryEntry[]
  /** Миссии шага A — тот же принцип «однажды true — навсегда true», что и в разделе 1 (target.md, п.2). */
  missionsDone: Record<BranchMissionId, boolean>
  /**
   * Вид последнего УСПЕШНОГО git merge — null, если merge ещё ни разу не выполнялся успешно
   * (см. MergeKind выше). Значение не сбрасывается остальными командами: единственный
   * потребитель — проверка миссии 4 (branchMissions.ts), которой достаточно, чтобы значение
   * было верным в момент СРАЗУ после самого merge — миссии, однажды засчитанные, остаются
   * засчитанными навсегда (target.md, п.2), поэтому «устаревшее» значение после более поздних
   * команд ни на что не влияет.
   */
  lastMerge: MergeKind | null
  /** Логические часы для хэша коммита (target.md, A5; util.ts, commitHashCore) — тот же
   * приём, что и в разделе 1 (types.ts, SectionState.clock): растут на единицу при каждом новом
   * коммите (обычном и коммите слияния), начиная с 0 у корневого коммита. Без этого поля
   * одинаковая правка с одинаковым сообщением в двух ветках получала бы один и тот же id — с
   * ним коммиты различаются по «моменту», как у настоящего git. */
  clock: number
}
