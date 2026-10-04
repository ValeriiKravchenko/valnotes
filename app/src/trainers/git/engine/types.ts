// ============================================================
// Раздел 1 git-тренажёра («Знакомство с Git», режим friendly).
// Общие типы движка. Ничего в этом файле не знает про DOM/React —
// это чистые данные и объявления функций.
// ============================================================

/** Содержимое файла в рабочем дереве/индексе/коммите (в русских текстах «рабочее дерево» также называют «рабочий каталог» — это то же самое). */
export type FileContents = string
/** Карта «имя файла → содержимое» — снимок одной из трёх областей Git. */
export type FileTree = Record<string, FileContents>

/** Один коммит раздела 1. Раздел 1 не создаёт веток и слияний, поэтому у коммита не больше одного родителя. */
export interface Commit {
  /** 7-значный хэш, см. spec 2.3 (S1-18, S1-22): «[master (root-commit) <7 hex>] …». */
  id: string
  parentId: string | null
  message: string
  tree: FileTree
}

/**
 * Состояния репозитория раздела 1 (см. spec 2.3):
 * - NoRepo    — Ш0: репозитория нет.
 * - Empty     — Ш1: репозиторий создан, коммитов нет, индекс пуст.
 * - Staged    — Ш2: коммитов нет, в индексе что-то есть.
 * - Clean     — Ш3: есть коммит(ы), working === index === HEAD.
 * - Dirty     — Ш4: есть коммит(ы) и есть расхождения (staged/not staged/untracked/удалённые).
 */
export const Stage = {
  NoRepo: 'NoRepo',
  Empty: 'Empty',
  Staged: 'Staged',
  Clean: 'Clean',
  Dirty: 'Dirty',
} as const
export type Stage = (typeof Stage)[keyof typeof Stage]

/** Тип изменения файла в блоках «Changes to be committed» / «Changes not staged for commit» (буквальные слова git). */
export type FileChangeType = 'new file' | 'modified' | 'deleted'

export interface FileStatusEntry {
  file: string
  type: FileChangeType
}

/** Структурированный результат `git status` — без форматирования в текст. */
export interface StatusSnapshot {
  branch: string | null
  hasCommits: boolean
  staged: FileStatusEntry[]
  notStaged: FileStatusEntry[]
  untracked: string[]
}

/** Идентификаторы миссий раздела 1, см. spec 2.8 (S1-110..S1-114). Порядок = порядок показа. */
export type MissionId = 'init' | 'status' | 'addIndexHtml' | 'firstCommit' | 'secondCommit'

export const MISSION_IDS: readonly MissionId[] = ['init', 'status', 'addIndexHtml', 'firstCommit', 'secondCommit']

export interface MissionView {
  id: MissionId
  text: string
  hint: string
  done: boolean
}

/** Запись в истории терминала: либо выполненная команда, либо служебная заметка (файловая операция). */
export type HistoryEntry =
  | {
      kind: 'command'
      /** Ровно то, что ввёл человек (до trim и до замены «умных» кавычек) — нужно для точного воспроизведения в истории ↑/↓. */
      input: string
      ok: boolean
      output: string
      explanation: string | null
    }
  | {
      kind: 'note'
      text: string
    }

/** Результат выполнения одной команды — то, что нужно показать в терминале сразу после Enter. */
export interface CommandResult {
  ok: boolean
  output: string
  explanation: string | null
  /**
   * Код возврата git (0/1/128/129/…) — общее (target.md, часть VII, «Общий код разделов»)
   * необязательное поле: разделы 1–4 различали только успех/отказ (`ok`), им хватало этого для
   * всех своих проверок. Раздел 5 («Командная работа») ВПЕРВЫЕ должен различать РАЗНЫЕ отказы
   * (push без upstream — 128, `src refspec … does not match any` — 1, неизвестный ключ — 129,
   * см. target.md, часть VII, таблицу кодов возврата) — этого не выразить одним булевым `ok`.
   * Поле добавлено сюда, а не как отдельный тип CommandResult у раздела 5, чтобы не дублировать
   * общий тип (см. branchTypes.ts/inspectTypes.ts/undoTypes.ts — все они делают `export type
   * { CommandResult } from './types'` БЕЗ изменений полей). Не заполняется разделами 1–4
   * (остаётся `undefined` — существующие тесты, сравнивающие результат через `toEqual`, его не
   * замечают: `toEqual` игнорирует свойства со значением `undefined`). Закреплено тестами
   * раздела 5 (remoteCommands.test.ts) — коды сверены прогоном git 2.53.0, 26.09.2026 (см.
   * docs/git-trainer/reports/section5-git-runs.txt).
   */
  exitCode?: number
}

/** Полное состояние раздела 1. Immutable: каждая функция движка возвращает новый объект. */
export interface SectionState {
  initialized: boolean
  /** 'master' после init, иначе null. Раздел 1 не поддерживает другие ветки и detached HEAD. */
  branch: string | null
  commits: Commit[]
  index: FileTree
  working: FileTree
  history: HistoryEntry[]
  missionsDone: Record<MissionId, boolean>
  /** Счётчик версий файла для кнопки «✎ изменить» (см. spec 2.9). */
  fileVersionIndex: Record<string, number>
  /** Логические часы для хэша коммита (target.md, A5; util.ts, commitHashCore) — растут на
   * единицу при каждом новом коммите, начиная с 0. Не системное время и не счётчик коммитов
   * в UI-смысле — единственная роль этого поля: отличать по «моменту» два коммита с одинаковым
   * содержимым, как это делает настоящий git через committer date. */
  clock: number
}
