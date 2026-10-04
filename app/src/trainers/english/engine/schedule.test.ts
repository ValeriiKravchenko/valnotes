import { describe, expect, it } from 'vitest'
import { BOX_INTERVAL_DAYS, addDays, isDueBy } from './schedule'

describe('правило 1 — интервалы ящиков 1..5', () => {
  it('интервалы в днях заданы для всех пяти ящиков', () => {
    expect(BOX_INTERVAL_DAYS).toEqual({ 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 })
  })
})

describe('addDays — арифметика дат без обращения к системным часам', () => {
  it('прибавляет дни в пределах месяца', () => {
    expect(addDays('2026-09-22', 1)).toBe('2026-09-23')
    expect(addDays('2026-09-22', 7)).toBe('2026-09-29')
  })

  it('переносит через границу месяца и года', () => {
    expect(addDays('2026-09-25', 7)).toBe('2026-10-02')
    expect(addDays('2026-12-28', 14)).toBe('2027-01-11')
  })

  it('корректно обрабатывает високосный февраль', () => {
    expect(addDays('2028-02-27', 3)).toBe('2028-03-01')
  })
})

describe('isDueBy — срок показа "сегодня или раньше"', () => {
  it('true, когда срок в прошлом или сегодня; false — в будущем', () => {
    expect(isDueBy('2026-09-20', '2026-09-22')).toBe(true)
    expect(isDueBy('2026-09-22', '2026-09-22')).toBe(true)
    expect(isDueBy('2026-09-23', '2026-09-22')).toBe(false)
  })
})
