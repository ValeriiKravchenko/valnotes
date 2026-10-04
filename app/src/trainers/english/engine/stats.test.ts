import { describe, expect, it } from 'vitest'
import { getStats } from './stats'
import type { ProgressStore } from './types'

const TODAY = '2026-09-22'

describe('правило 8 — статистика', () => {
  it('считает новые, изучаемые, к повтору сегодня и выученные слова', () => {
    // new1, new2 намеренно отсутствуют в progress — для них ещё нет записи прогресса
    const progress: ProgressStore = {
      learning1: { box: 2, dueDate: '2026-09-25' }, // изучается, не к повтору сегодня
      due1: { box: 1, dueDate: '2026-09-20' }, // изучается и просрочено — к повтору
      learned1: { box: 5, dueDate: '2026-10-01' }, // выучено, не к повтору
      learnedDue: { box: 5, dueDate: TODAY }, // выучено И к повтору сегодня
    }
    const wordIds = ['new1', 'new2', 'learning1', 'due1', 'learned1', 'learnedDue']

    const stats = getStats(progress, wordIds, TODAY)

    expect(stats).toEqual({
      newCount: 2, // new1, new2 — записи прогресса нет
      learning: 2, // learning1, due1 — box < 5
      dueToday: 2, // due1, learnedDue — dueDate <= today
      learned: 2, // learned1, learnedDue — box === 5
    })
  })

  it('пустой список слов — все счётчики нулевые', () => {
    expect(getStats({}, [], TODAY)).toEqual({ newCount: 0, learning: 0, dueToday: 0, learned: 0 })
  })
})

describe('правило 10 — статистика не учитывает слова вне списка id', () => {
  it('запись прогресса для слова вне wordIds не влияет ни на один счётчик', () => {
    const progress: ProgressStore = { ghost: { box: 5, dueDate: '2020-01-01' } }
    const stats = getStats(progress, ['real'], TODAY)
    expect(stats).toEqual({ newCount: 1, learning: 0, dueToday: 0, learned: 0 })
  })
})
