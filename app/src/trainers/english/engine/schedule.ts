// ============================================================
// Тренажёр английских слов: интервалы ящиков и арифметика дат.
// Дата «сегодня» всегда приходит параметром — модуль не читает системные часы.
// new Date(...) используется только для сложения календарных дней (чистая
// арифметика над переданным значением), а не для получения текущего момента.
// ============================================================
import type { Box } from './types'

/** Интервал до следующего показа для каждого ящика, в днях (правило 1). */
export const BOX_INTERVAL_DAYS: Record<Box, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
}

/** Переводит дату YYYY-MM-DD в номер дня от условной эпохи (UTC, без часового пояса). */
function toEpochDay(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

function fromEpochDay(epochDay: number): string {
  const date = new Date(epochDay * 86_400_000)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Прибавляет к дате YYYY-MM-DD заданное число дней (может быть отрицательным). */
export function addDays(dateStr: string, days: number): string {
  return fromEpochDay(toEpochDay(dateStr) + days)
}

/**
 * Срок показа "просрочен или сегодня". Формат YYYY-MM-DD имеет фиксированную
 * ширину полей, поэтому лексикографическое сравнение строк эквивалентно
 * сравнению дат — отдельный разбор в Date не нужен.
 */
export function isDueBy(dueDate: string, today: string): boolean {
  return dueDate <= today
}
