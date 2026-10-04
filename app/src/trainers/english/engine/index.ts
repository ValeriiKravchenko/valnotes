// ============================================================
// Публичная точка входа движка тренажёра английских слов (интервальное
// повторение). Интегратору достаточно импортировать из этого файла —
// внутренние модули (schedule.ts, progress.ts, session.ts, stats.ts,
// serialize.ts) не рассчитаны на прямой импорт снаружи пакета engine/.
// ============================================================
export { BOX_INTERVAL_DAYS, addDays, isDueBy } from './schedule'
export { reviewWord } from './progress'
export { createSession, currentWord, isSessionFinished, answerCurrent, MAX_NEW_WORDS_PER_SESSION } from './session'
export { getStats } from './stats'
export { serializeProgress, parseProgress, PROGRESS_FORMAT_VERSION } from './serialize'

export type { Box, Answer, WordProgress, ProgressStore } from './types'
export type { Shuffle, SessionEntry, SessionState } from './session'
export type { Stats } from './stats'
export type { ParseProgressResult, ParseProgressError } from './serialize'
