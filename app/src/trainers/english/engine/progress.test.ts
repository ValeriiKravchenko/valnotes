import { describe, expect, it } from 'vitest'
import { reviewWord } from './progress'

const TODAY = '2026-09-22'

describe('правило 2 — новое слово (нет записи прогресса)', () => {
  it('«знаю» — сразу ящик 2', () => {
    const result = reviewWord(undefined, 'know', TODAY)
    expect(result.box).toBe(2)
  })

  it('«не знаю» — ящик 1', () => {
    const result = reviewWord(undefined, 'dontKnow', TODAY)
    expect(result.box).toBe(1)
  })
})

describe('правило 3 — слово с записью прогресса', () => {
  it('«знаю» — ящик +1', () => {
    expect(reviewWord({ box: 1, dueDate: TODAY }, 'know', TODAY).box).toBe(2)
    expect(reviewWord({ box: 3, dueDate: TODAY }, 'know', TODAY).box).toBe(4)
  })

  it('«знаю» в ящике 5 не поднимает выше 5', () => {
    expect(reviewWord({ box: 5, dueDate: TODAY }, 'know', TODAY).box).toBe(5)
  })

  it('«не знаю» сбрасывает в ящик 1 из любого ящика', () => {
    expect(reviewWord({ box: 4, dueDate: TODAY }, 'dontKnow', TODAY).box).toBe(1)
    expect(reviewWord({ box: 1, dueDate: TODAY }, 'dontKnow', TODAY).box).toBe(1)
  })
})

describe('правило 4 — срок следующего показа = today + интервал нового ящика', () => {
  it('новое слово, «знаю» → ящик 2 → +3 дня', () => {
    expect(reviewWord(undefined, 'know', TODAY).dueDate).toBe('2026-09-25')
  })

  it('новое слово, «не знаю» → ящик 1 → +1 день', () => {
    expect(reviewWord(undefined, 'dontKnow', TODAY).dueDate).toBe('2026-09-23')
  })

  it('слово в ящике 4, «знаю» → ящик 5 → +30 дней', () => {
    expect(reviewWord({ box: 4, dueDate: TODAY }, 'know', TODAY).dueDate).toBe('2026-10-22')
  })

  it('интервал считается от переданного "сегодня", а не от старого срока показа', () => {
    // старый due был давно просрочен — пересчёт всё равно идёт от today
    const result = reviewWord({ box: 2, dueDate: '2026-01-01' }, 'know', TODAY)
    expect(result.dueDate).toBe('2026-09-29') // today + 7 (ящик 3)
  })
})
