// ============================================================
// Тренажёр английских слов: сериализация прогресса в JSON и обратно
// (правило 9). Разбор чужого/испорченного JSON не бросает исключение —
// возвращает результат с явным полем ok.
// ============================================================
import type { Box, ProgressStore, WordProgress } from './types'

/** Текущая версия формата хранения. Меняется при несовместимой правке структуры. */
export const PROGRESS_FORMAT_VERSION = 1 as const

interface ProgressFile {
  version: typeof PROGRESS_FORMAT_VERSION
  entries: ProgressStore
}

/** Результат разбора: либо успех со store, либо ошибка с машиночитаемым кодом
 * (это не пользовательская строка — движок не знает про интерфейс и словарь,
 * текст для показа игроку — дело интегратора). */
export type ParseProgressResult =
  | { ok: true; store: ProgressStore }
  | { ok: false; error: ParseProgressError }

export type ParseProgressError =
  | 'invalid-json'
  | 'not-an-object'
  | 'unsupported-version'
  | 'missing-entries'
  | 'invalid-entry'

export function serializeProgress(store: ProgressStore): string {
  const file: ProgressFile = { version: PROGRESS_FORMAT_VERSION, entries: store }
  return JSON.stringify(file)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidBox(value: unknown): value is Box {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

function isValidWordProgress(value: unknown): value is WordProgress {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return isValidBox(v.box) && typeof v.dueDate === 'string' && DATE_RE.test(v.dueDate)
}

/**
 * Разбирает JSON, полученный из `serializeProgress` (или произвольный чужой
 * JSON). Никогда не бросает исключение — ошибки парсинга и рассинхронизации
 * формата возвращаются как `{ ok: false, error }`.
 */
export function parseProgress(json: string): ParseProgressResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'invalid-json' }
  }

  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not-an-object' }
  const obj = raw as Record<string, unknown>

  if (obj.version !== PROGRESS_FORMAT_VERSION) return { ok: false, error: 'unsupported-version' }
  if (typeof obj.entries !== 'object' || obj.entries === null) return { ok: false, error: 'missing-entries' }

  const rawEntries = obj.entries as Record<string, unknown>
  const store: ProgressStore = {}
  for (const [id, value] of Object.entries(rawEntries)) {
    if (!isValidWordProgress(value)) return { ok: false, error: 'invalid-entry' }
    store[id] = value
  }
  return { ok: true, store }
}
