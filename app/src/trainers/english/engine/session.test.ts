import { describe, expect, it } from 'vitest'
import { MAX_NEW_WORDS_PER_SESSION, answerCurrent, createSession, currentWord, isSessionFinished } from './session'
import type { ProgressStore } from './types'

const TODAY = '2026-09-22'

/** Перемешивание-заглушка: не меняет порядок — удобно проверять состав набора. */
const identity = (items: readonly string[]): string[] => [...items]

/** Перемешивание-заглушка: разворачивает порядок — доказывает, что порядок
 * в очереди сессии полностью определяется переданной функцией, а не чем-то
 * внутренним движка (правило 7). */
const reversed = (items: readonly string[]): string[] => [...items].reverse()

describe('правило 6 — формирование сессии на сегодня', () => {
  it('в сессию попадают слова с due <= today и слова без прогресса (новые)', () => {
    const progress: ProgressStore = {
      due1: { box: 1, dueDate: '2026-09-20' }, // просрочено — входит
      dueToday: { box: 2, dueDate: TODAY }, // ровно сегодня — входит
      future: { box: 1, dueDate: '2026-09-23' }, // завтра — не входит
    }
    const wordIds = ['due1', 'dueToday', 'future', 'new1', 'new2']
    const session = createSession(progress, wordIds, TODAY, identity)
    const ids = session.queue.map((e) => e.wordId)
    expect(ids).toEqual(['due1', 'dueToday', 'new1', 'new2'])
  })

  it('новых слов берётся не больше MAX_NEW_WORDS_PER_SESSION, в порядке исходного списка id', () => {
    expect(MAX_NEW_WORDS_PER_SESSION).toBe(10)
    const wordIds = Array.from({ length: 12 }, (_, i) => `w${i}`)
    const session = createSession({}, wordIds, TODAY, identity)
    expect(session.queue).toHaveLength(10)
    expect(session.queue.map((e) => e.wordId)).toEqual(wordIds.slice(0, 10))
  })

  it('итоговый набор перемешивается переданной функцией shuffle (детерминированно, без Math.random)', () => {
    const wordIds = ['a', 'b', 'c']
    const progress: ProgressStore = { a: { box: 1, dueDate: TODAY } }
    const session = createSession(progress, wordIds, TODAY, reversed)
    // без due-b/c: due=[a], fresh=[b,c] -> combined=[a,b,c] -> reversed=[c,b,a]
    expect(session.queue.map((e) => e.wordId)).toEqual(['c', 'b', 'a'])
  })

  it('одинаковый вход и одна и та же функция shuffle всегда дают одинаковый результат (детерминизм)', () => {
    const wordIds = ['a', 'b', 'c', 'd']
    const progress: ProgressStore = { a: { box: 1, dueDate: TODAY } }
    const s1 = createSession(progress, wordIds, TODAY, reversed)
    const s2 = createSession(progress, wordIds, TODAY, reversed)
    expect(s1).toEqual(s2)
  })
})

describe('правило 5 — повторный показ после «не знаю» в той же сессии', () => {
  it('«не знаю» меняет прогресс и ставит слово в конец очереди на повтор', () => {
    const session = createSession({}, ['a', 'b'], TODAY, identity)
    const step1 = answerCurrent(session, {}, 'dontKnow', TODAY)
    expect(currentWord(step1.session)).toBe('b')
    expect(step1.progress.a).toEqual({ box: 1, dueDate: '2026-09-23' })
    expect(step1.session.queue.map((e) => e.wordId)).toEqual(['b', 'a'])
    expect(step1.session.queue[1]).toEqual({ wordId: 'a', isRepeat: true })
  })

  it('ответ на повторный показ уже не меняет ящик/срок слова', () => {
    const session = createSession({}, ['a'], TODAY, identity)
    const afterFirst = answerCurrent(session, {}, 'dontKnow', TODAY)
    expect(currentWord(afterFirst.session)).toBe('a') // повтор снова в очереди
    const progressAfterFirst = afterFirst.progress.a

    const afterRepeat = answerCurrent(afterFirst.session, afterFirst.progress, 'know', TODAY)
    expect(afterRepeat.progress.a).toEqual(progressAfterFirst) // не изменилось
    expect(isSessionFinished(afterRepeat.session)).toBe(true)
  })

  it('«знаю» с первого раза прогресс меняет, но повтор не добавляет', () => {
    const session = createSession({}, ['a'], TODAY, identity)
    const result = answerCurrent(session, {}, 'know', TODAY)
    expect(result.progress.a.box).toBe(2)
    expect(isSessionFinished(result.session)).toBe(true)
  })

  it('answerCurrent на пустой сессии — no-op, не бросает', () => {
    const session = createSession({}, [], TODAY, identity)
    expect(() => answerCurrent(session, {}, 'know', TODAY)).not.toThrow()
    const result = answerCurrent(session, {}, 'know', TODAY)
    expect(result.session).toBe(session)
  })
})

describe('правило 10 — слова вне текущего списка id не попадают в сессию', () => {
  it('запись прогресса для слова, отсутствующего в wordIds, игнорируется при построении сессии', () => {
    const progress: ProgressStore = {
      ghost: { box: 1, dueDate: '2026-01-01' }, // сильно просрочено, но не входит в список
      real: { box: 1, dueDate: '2026-01-01' },
    }
    const session = createSession(progress, ['real'], TODAY, identity)
    expect(session.queue.map((e) => e.wordId)).toEqual(['real'])
  })

  it('запись такого слова не удаляется и не портится — она просто не участвует', () => {
    const progress: ProgressStore = { ghost: { box: 3, dueDate: '2026-01-01' } }
    createSession(progress, ['real'], TODAY, identity)
    expect(progress.ghost).toEqual({ box: 3, dueDate: '2026-01-01' })
  })
})
