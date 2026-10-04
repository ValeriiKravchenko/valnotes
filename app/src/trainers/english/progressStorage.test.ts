import { beforeEach, describe, expect, it } from 'vitest'
import {
  BROKEN_PROGRESS_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  brokenProgressExport,
  loadInitialProgress,
  readBrokenProgress,
  readStoredProgress,
  writeStoredProgress,
} from './progressStorage'
import { serializeProgress } from './engine'
import type { ProgressStore } from './engine'

/** Простейший in-memory localStorage — в vitest (окружение node) глобального localStorage нет. */
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
})

describe('loadInitialProgress — резервная копия испорченного прогресса', () => {
  it('если сохранённая строка не разбирается — копирует её в BROKEN_PROGRESS_STORAGE_KEY', () => {
    const raw = 'вот такая совсем не json строка'
    localStorage.setItem(PROGRESS_STORAGE_KEY, raw)

    const result = loadInitialProgress()

    expect(result.error).toBe('invalid-json')
    expect(result.brokenRaw).toBe(raw)
    expect(readBrokenProgress()).toBe(raw)
    expect(localStorage.getItem(BROKEN_PROGRESS_STORAGE_KEY)).toBe(raw)
  })

  it('копирование происходит ДО любой перезаписи основного ключа — он остаётся тем же испорченным значением', () => {
    const raw = '{"version": 999, "entries": {}}' // валидный JSON, но неподдерживаемая версия
    localStorage.setItem(PROGRESS_STORAGE_KEY, raw)

    loadInitialProgress()

    expect(readStoredProgress()).toBe(raw)
  })

  it('возвращает пустой прогресс на эту сессию, когда сохранённые данные испорчены', () => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, 'не json')
    const result = loadInitialProgress()
    expect(result.store).toEqual({})
  })

  it('при валидном сохранённом прогрессе резервная копия не создаётся', () => {
    const store: ProgressStore = { verify: { box: 2, dueDate: '2026-09-25' } }
    localStorage.setItem(PROGRESS_STORAGE_KEY, serializeProgress(store))

    const result = loadInitialProgress()

    expect(result.error).toBeNull()
    expect(result.brokenRaw).toBeNull()
    expect(readBrokenProgress()).toBeNull()
  })

  it('при отсутствии сохранённого прогресса резервная копия не создаётся', () => {
    const result = loadInitialProgress()
    expect(result.error).toBeNull()
    expect(readBrokenProgress()).toBeNull()
  })
})

describe('brokenProgressExport — содержимое файла выгрузки испорченных данных', () => {
  it('имя файла содержит переданную дату, содержимое — сырую строку как есть', () => {
    const raw = '{"broken": true, "оставь как есть": "тест"}'
    const result = brokenProgressExport(raw, '2026-09-22')
    expect(result.filename).toBe('english-progress-broken-2026-09-22.json')
    expect(result.content).toBe(raw)
  })
})

describe('writeStoredProgress / readStoredProgress — обычная запись и чтение', () => {
  it('round-trip: записанное значение читается обратно как есть', () => {
    writeStoredProgress('{"version":1,"entries":{}}')
    expect(readStoredProgress()).toBe('{"version":1,"entries":{}}')
  })
})
