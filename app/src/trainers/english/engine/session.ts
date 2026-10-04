// ============================================================
// Тренажёр английских слов: сессия повторения на «сегодня» (правила 5, 6, 10).
// Сессия — это очередь id слов; движок не решает, как её показывать —
// только формирует порядок и обрабатывает ответ на текущее слово.
// Источник случайности (shuffle) передаётся снаружи — см. правило 7.
// ============================================================
import { isDueBy } from './schedule'
import { reviewWord } from './progress'
import type { Answer, ProgressStore } from './types'

/** Сколько новых слов (без записи прогресса) добавляется в сессию максимум (правило 6). */
export const MAX_NEW_WORDS_PER_SESSION = 10

/** Функция перемешивания массива, передаётся снаружи. Модуль не генерирует случайность сам. */
export type Shuffle = (items: readonly string[]) => string[]

/** Один элемент очереди сессии.
 * `isRepeat: true` — это повторный показ, добавленный ответом «не знаю» в этой
 * же сессии (правило 5): ответ на него уже не меняет ящик/срок слова. */
export interface SessionEntry {
  wordId: string
  isRepeat: boolean
}

/** Состояние сессии — очередь показов на сегодня. */
export interface SessionState {
  queue: SessionEntry[]
}

/**
 * Формирует сессию на сегодня (правило 6): все слова с прогрессом, чей срок
 * показа <= today, плюс до MAX_NEW_WORDS_PER_SESSION новых слов (без записи
 * прогресса) в порядке исходного списка wordIds. Получившийся набор
 * перемешивается функцией `shuffle`.
 *
 * Слова, которых нет в `wordIds`, в сессию не попадают, даже если для них
 * есть запись в `progress` (правило 10).
 */
export function createSession(
  progress: ProgressStore,
  wordIds: readonly string[],
  today: string,
  shuffle: Shuffle,
): SessionState {
  const due: string[] = []
  const fresh: string[] = []
  for (const id of wordIds) {
    const entry = progress[id]
    if (!entry) {
      if (fresh.length < MAX_NEW_WORDS_PER_SESSION) fresh.push(id)
    } else if (isDueBy(entry.dueDate, today)) {
      due.push(id)
    }
  }
  const shuffled = shuffle([...due, ...fresh])
  return { queue: shuffled.map((wordId) => ({ wordId, isRepeat: false })) }
}

/** id слова, которое нужно показать сейчас, или null, если сессия закончена. */
export function currentWord(session: SessionState): string | null {
  return session.queue[0]?.wordId ?? null
}

/** Сессия пройдена целиком — очередь пуста. */
export function isSessionFinished(session: SessionState): boolean {
  return session.queue.length === 0
}

/**
 * Обрабатывает ответ игрока на текущее (первое в очереди) слово сессии.
 * - Если это первый показ слова в сессии: прогресс пересчитывается
 *   (см. `reviewWord`), и при ответе «не знаю» слово ставится в конец
 *   очереди повторным показом (правило 5).
 * - Если это повторный показ (`isRepeat: true`): прогресс не трогается,
 *   слово просто убирается из очереди — независимо от ответа (правило 5:
 *   «расписание уже не меняет»; повторный показ, в свою очередь, не
 *   порождает ещё один повтор — иначе при постоянном «не знаю» сессия
 *   никогда бы не заканчивалась).
 * Если очередь уже пуста — no-op, возвращает те же объекты.
 */
export function answerCurrent(
  session: SessionState,
  progress: ProgressStore,
  answer: Answer,
  today: string,
): { session: SessionState; progress: ProgressStore } {
  const [entry, ...rest] = session.queue
  if (!entry) return { session, progress }

  if (entry.isRepeat) {
    return { session: { queue: rest }, progress }
  }

  const nextProgress: ProgressStore = {
    ...progress,
    [entry.wordId]: reviewWord(progress[entry.wordId], answer, today),
  }
  const nextQueue = answer === 'dontKnow' ? [...rest, { wordId: entry.wordId, isRepeat: true }] : rest
  return { session: { queue: nextQueue }, progress: nextProgress }
}
