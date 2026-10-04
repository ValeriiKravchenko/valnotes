// ============================================================
// Тренажёр английских слов: пересчёт прогресса одного слова по ответу
// игрока (правила 2, 3, 4). Чистая функция без побочных эффектов.
// ============================================================
import { BOX_INTERVAL_DAYS, addDays } from './schedule'
import type { Answer, Box, WordProgress } from './types'

/**
 * Считает новый прогресс слова по ответу игрока.
 * - `existing` не задан (слова ещё нет в хранилище прогресса) — новое слово:
 *   «знаю» → сразу ящик 2, «не знаю» → ящик 1 (правило 2).
 * - `existing` задан — «знаю» → ящик +1 (не выше 5), «не знаю» → сброс в ящик 1 (правило 3).
 * Срок следующего показа = today + интервал нового ящика (правило 4).
 */
export function reviewWord(existing: WordProgress | undefined, answer: Answer, today: string): WordProgress {
  let nextBox: Box
  if (!existing) {
    nextBox = answer === 'know' ? 2 : 1
  } else {
    nextBox = answer === 'know' ? (Math.min(5, existing.box + 1) as Box) : 1
  }
  return { box: nextBox, dueDate: addDays(today, BOX_INTERVAL_DAYS[nextBox]) }
}
