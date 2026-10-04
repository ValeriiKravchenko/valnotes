// ============================================================
// Тренажёр английского: сохранение сессии дня в localStorage. Это не engine/ —
// движок сессию нигде не хранит, только строит её (createSession) и обновляет
// по ответам (answerCurrent); чем и на сколько дней её запомнить — решает
// интерфейс.
//
// SessionState движка — обычный сериализуемый объект ({ queue: {wordId, isRepeat}[] },
// см. engine/session.ts) без функций/Map/Set/ссылок, поэтому кладём его в JSON как есть,
// вместе с датой, на которую сессия была собрана — сериализацию движка не придумываем.
// ============================================================
import { createSession } from './engine'
import type { ProgressStore, SessionEntry, SessionState, Shuffle } from './engine'

export const SESSION_STORAGE_KEY = 'valnotes.english.session'

interface StoredSessionFile {
  date: string
  session: SessionState
}

function isValidSessionEntry(value: unknown): value is SessionEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.wordId === 'string' && typeof v.isRepeat === 'boolean'
}

function isValidSessionState(value: unknown): value is SessionState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.queue) && v.queue.every(isValidSessionEntry)
}

function isValidSessionFile(value: unknown): value is StoredSessionFile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.date === 'string' && isValidSessionState(v.session)
}

/** Читает сохранённую сессию дня. Любая порча (не JSON, не тот формат) — тихо
 * возвращает null, без сообщений об ошибке: это дело сессии, прогресс не затрагивается. */
function readStoredSession(): StoredSessionFile | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  return isValidSessionFile(parsed) ? parsed : null
}

/** Сохраняет сессию дня вместе с датой, на которую она собрана. */
export function writeStoredSession(date: string, session: SessionState): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ date, session }))
  } catch {
    // приватный режим или переполненная квота — сессия просто не сохранится в этом браузере
  }
}

/**
 * Сессия дня при открытии страницы: если сохранённая сессия есть и собрана
 * ровно на сегодняшнюю (локальную) дату — восстанавливает её как есть, без
 * повторного вызова createSession (иначе дневной лимит новых слов обходился бы
 * перезагрузкой страницы). Иначе — как и раньше, строит новую сессию движком.
 */
export function loadInitialSession(
  progress: ProgressStore,
  wordIds: readonly string[],
  today: string,
  shuffle: Shuffle,
): SessionState {
  const stored = readStoredSession()
  if (stored && stored.date === today) return stored.session
  return createSession(progress, wordIds, today, shuffle)
}
