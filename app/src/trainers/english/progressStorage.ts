// ============================================================
// Тренажёр английского: чтение и запись прогресса в localStorage, включая
// резервную копию испорченных данных. Это не engine/ — движок прогресс
// нигде не хранит и не читает сам, только принимает/отдаёт ProgressStore.
// Вынесено из EnglishTrainer.tsx отдельным модулем, чтобы работу с
// localStorage можно было проверить тестами без рендера React.
// ============================================================
import { parseProgress } from './engine'
import type { ParseProgressError, ProgressStore } from './engine'

export const PROGRESS_STORAGE_KEY = 'valnotes.english.progress'
/** Резервный ключ: сюда копируется сырая строка, если основной ключ не разобрался. */
export const BROKEN_PROGRESS_STORAGE_KEY = 'valnotes.english.progress.broken'

export function readStoredProgress(): string | null {
  try {
    return localStorage.getItem(PROGRESS_STORAGE_KEY)
  } catch {
    return null
  }
}

/** @param json уже сериализованный прогресс (serializeProgress из engine) */
export function writeStoredProgress(json: string): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, json)
  } catch {
    // приватный режим или переполненная квота — прогресс просто не сохранится в этом браузере
  }
}

/** Копирует сырую (не разобравшуюся) строку прогресса под отдельный ключ — до того,
 * как что-либо перезапишет основной ключ пустым/новым прогрессом. */
export function backupBrokenProgress(raw: string): void {
  try {
    localStorage.setItem(BROKEN_PROGRESS_STORAGE_KEY, raw)
  } catch {
    // тот же случай — резервную копию тоже не получится сохранить в этом браузере
  }
}

export function readBrokenProgress(): string | null {
  try {
    return localStorage.getItem(BROKEN_PROGRESS_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Имя файла и содержимое выгрузки испорченного прогресса. Чистая функция — без DOM,
 * поэтому тестируется напрямую (в отличие от самого скачивания через Blob/URL). */
export function brokenProgressExport(raw: string, today: string): { filename: string; content: string } {
  return { filename: `english-progress-broken-${today}.json`, content: raw }
}

export interface LoadedProgress {
  store: ProgressStore
  error: ParseProgressError | null
  /** сырая испорченная строка; заполнена только когда error !== null, уже скопирована в backup */
  brokenRaw: string | null
}

/**
 * Загружает прогресс из localStorage при старте страницы.
 * Если сохранённая строка не разбирается — копирует её в BROKEN_PROGRESS_STORAGE_KEY
 * (ещё не тронув основной ключ) и возвращает пустой прогресс на эту сессию: испорченные
 * данные сами по себе не подчищаются и не перезаписываются, пока игрок не предпримет
 * явное действие (ответит на карточку или загрузит свой файл прогресса).
 */
export function loadInitialProgress(): LoadedProgress {
  const raw = readStoredProgress()
  if (!raw) return { store: {}, error: null, brokenRaw: null }
  const result = parseProgress(raw)
  if (result.ok) return { store: result.store, error: null, brokenRaw: null }
  backupBrokenProgress(raw)
  return { store: {}, error: result.error, brokenRaw: raw }
}
