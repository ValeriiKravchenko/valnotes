// ============================================================
// Тренажёр английских слов: статистика по списку слов (правило 8).
// ============================================================
import { isDueBy } from './schedule'
import type { ProgressStore } from './types'

export interface Stats {
  /** Слова из списка, у которых ещё нет записи прогресса. */
  newCount: number
  /** Слова с прогрессом, ящик < 5. */
  learning: number
  /** Слова, чей срок показа <= today (независимо от ящика). */
  dueToday: number
  /** Слова в ящике 5. */
  learned: number
}

/**
 * Считает статистику только по словам из `wordIds` (правило 10: записи
 * прогресса для слов вне списка не учитываются).
 */
export function getStats(progress: ProgressStore, wordIds: readonly string[], today: string): Stats {
  let newCount = 0
  let learning = 0
  let dueToday = 0
  let learned = 0
  for (const id of wordIds) {
    const entry = progress[id]
    if (!entry) {
      newCount += 1
      continue
    }
    if (entry.box < 5) learning += 1
    if (entry.box === 5) learned += 1
    if (isDueBy(entry.dueDate, today)) dueToday += 1
  }
  return { newCount, learning, dueToday, learned }
}
