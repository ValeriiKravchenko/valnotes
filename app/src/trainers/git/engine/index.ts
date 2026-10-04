// ============================================================
// Публичная точка входа движка git-тренажёра.
// Интегратору достаточно импортировать из этого файла — внутренние
// модули (commands.ts, repo.ts, missions.ts, fileOps.ts и их аналоги
// раздела 2: branchRepo.ts, branchCommands.ts, branchScope.ts) не
// рассчитаны на прямой импорт снаружи пакета engine/.
//
// Раздел 1 экспортируется как обычно (createSection/runCommand/…).
// Раздел 2, шаг A (branchSection.ts) экспортируется отдельным набором
// имён (createBranchingSection/runBranchingCommand/…) — состояния и
// команды двух разделов несовместимы (одна ветка против графа веток,
// см. types.ts и branchTypes.ts), поэтому у них разные типы State и
// разные функции, а не общий runCommand с ветвлением поведения внутри.
//
// Раздел 3 (inspectSection.ts) — по тому же принципу, свой набор имён
// (createInspectSection/runInspectCommand/…): своя модель данных
// (inspectTypes.ts — линейная цепочка коммитов с разбором ссылок и
// диффами, не граф веток раздела 2 и не одна ветка без истории раздела 1).
//
// Раздел 4 (undoSection.ts) — по тому же принципу, свой набор имён
// (createUndoSection/runUndoCommand/…): своя модель данных (undoTypes.ts —
// цепочка коммитов, которая, в отличие от раздела 3, растёт (revert) и может
// обзавестись второй веткой (git branch rescue <хэш>, после reset), а
// коммиты никогда не удаляются — недостижимые ни из одной ветки остаются в
// состоянии и отдаются отдельным списком, getOrphanCommits).
// ============================================================
export {
  createSection,
  resetSection,
  runCommand,
  editFile,
  deleteFile,
  createFile,
  getStage,
  getStatus,
  getHeadTree,
  getMissions,
  repoHasNoFiles,
  Stage,
} from './section'
export type { CommandResult, FileTree, HistoryEntry, MissionId, MissionView, SectionState, StatusSnapshot } from './section'

export {
  createBranchingSection,
  runBranchingCommand,
  editFile as editBranchingFile,
  deleteFile as deleteBranchingFile,
  createFile as createBranchingFile,
  getBranchNames,
  getCurrentBranch,
  getHeadTree as getBranchingHeadTree,
  getCommit as getBranchingCommit,
  getAllCommits as getAllBranchingCommits,
  isBranchMerged,
} from './branchSection'
export type { BranchCommit, BranchingState } from './branchSection'

export {
  createInspectSection,
  runInspectCommand,
  editFile as editInspectFile,
  deleteFile as deleteInspectFile,
  createFile as createInspectFile,
  getInspectMissions,
  getHeadTree as getInspectHeadTree,
  getCommit as getInspectCommit,
  getAllCommits as getAllInspectCommits,
} from './inspectSection'
export type { InspectCommit, InspectCommitSeed, InspectSeed, InspectState } from './inspectSection'

export {
  createUndoSection,
  runUndoCommand,
  editFile as editUndoFile,
  deleteFile as deleteUndoFile,
  createFile as createUndoFile,
  getUndoMissions,
  getHeadTree as getUndoHeadTree,
  getCommit as getUndoCommit,
  getAllCommits as getAllUndoCommits,
  getOrphanCommits,
  getBranchNames as getUndoBranchNames,
  getCurrentBranch as getUndoCurrentBranch,
} from './undoSection'
export type { UndoCommit, UndoCommitSeed, UndoSeed, UndoState } from './undoSection'

// Раздел 5 (remoteSection.ts) — по тому же принципу, свой набор имён
// (createRemoteSection/runRemoteCommand/…): своя модель данных (remoteTypes.ts —
// ДВА репозитория, сервер (bare, без индекса/рабочего каталога) и локальная
// копия (граф коммитов как в разделе 2 + origin/*, upstream, настройки pull),
// см. её шапку). Раздел 2 не трогается ни строкой.
export {
  createRemoteSection,
  runRemoteCommand,
  colleaguePush,
  editFile as editRemoteFile,
  deleteFile as deleteRemoteFile,
  createFile as createRemoteFile,
  getRemoteMissions,
  isCloned,
  getLocalHeadTree,
  getLocalBranchNames,
  getLocalCurrentBranch,
  getLocalCommit,
  getAllLocalCommits,
  getRemoteBranchNames,
  getServerCommit,
  getAllServerCommits,
  getServerNotes,
} from './remoteSection'
export type { RemoteCommit, RemoteColleagueSeed, RemoteMissionId, RemoteMissionView, RemoteSeed, RemoteServerSeed, RemoteState } from './remoteSection'

// Раздел 6 (searchSection.ts), ШАГ A — репозиторий «Проект» (grep/blame/show/log): по тому же
// принципу, свой набор имён (createSearchSection/runSearchCommand/…): своя модель данных
// (searchTypes.ts — линейная цепочка коммитов, как раздел 3, но с автором/почтой/датой у каждого
// коммита и 40-значным id, target.md, часть VIII, «Движок»). Раздел 3 не трогается ни строкой.
// ШАГ B («Магазин», git bisect) этой версией движка не реализован — см. шапку searchTypes.ts.
export {
  createSearchSection,
  runSearchCommand,
  getSearchMissions,
  getHeadTree as getSearchHeadTree,
  getCommit as getSearchCommit,
  getAllCommits as getAllSearchCommits,
} from './searchSection'
export type { CommitDate, SearchCommit, SearchCommitSeed, SearchMissionId, SearchMissionView, SearchSeed, SearchState } from './searchSection'
