import { beforeEach, describe, expect, it } from 'vitest'
import { SESSION_STORAGE_KEY, loadInitialSession, writeStoredSession } from './sessionStorage'
import { answerCurrent, createSession, currentWord, isSessionFinished } from './engine'
import type { ProgressStore } from './engine'

const TODAY = '2026-09-22'
const TOMORROW = '2026-09-23'

const identity = (items: readonly string[]): string[] => [...items]
const reversed = (items: readonly string[]): string[] => [...items].reverse()

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

describe('loadInitialSession — сохранение и восстановление сессии дня', () => {
  it('после ответа на карточки (F5-эмуляция) восстанавливает то же текущее слово и то же число оставшихся карточек', () => {
    const wordIds = ['a', 'b', 'c']
    let progress: ProgressStore = {}
    let session = createSession(progress, wordIds, TODAY, identity)

    // отвечаем на 2 карточки, сохраняя сессию после каждого ответа — как делает компонент
    const step1 = answerCurrent(session, progress, 'know', TODAY)
    session = step1.session
    progress = step1.progress
    writeStoredSession(TODAY, session)

    const step2 = answerCurrent(session, progress, 'know', TODAY)
    session = step2.session
    progress = step2.progress
    writeStoredSession(TODAY, session)

    const beforeReload = { current: currentWord(session), left: session.queue.length }

    // «перезагрузка страницы»: читаем сохранённое состояние заново
    const restored = loadInitialSession(progress, wordIds, TODAY, identity)

    expect(currentWord(restored)).toBe(beforeReload.current)
    expect(restored.queue.length).toBe(beforeReload.left)
    expect(restored).toEqual(session)
  })

  it('дневной лимит новых слов не обходится перезагрузкой: сессия не пересобирается заново на ту же дату', () => {
    const wordIds = Array.from({ length: 15 }, (_, i) => `w${i}`)
    const progress: ProgressStore = {}
    const session = createSession(progress, wordIds, TODAY, identity) // 10 новых слов — предел
    writeStoredSession(TODAY, session)

    const restored = loadInitialSession(progress, wordIds, TODAY, identity)

    expect(restored.queue.length).toBe(10)
    expect(restored).toEqual(session)
  })

  it('при смене даты собирается новая сессия, а не переиспользуется старая', () => {
    const wordIds = ['a', 'b', 'c']
    const progress: ProgressStore = {}
    const todaySession = createSession(progress, wordIds, TODAY, identity)
    writeStoredSession(TODAY, todaySession)

    // на новую дату используем другую функцию shuffle — если бы сессия переиспользовалась,
    // результат совпал бы с todaySession (identity), а не с ожидаемым для reversed
    const restored = loadInitialSession(progress, wordIds, TOMORROW, reversed)
    const expected = createSession(progress, wordIds, TOMORROW, reversed)

    expect(restored).toEqual(expected)
    expect(restored).not.toEqual(todaySession)
  })

  it('сессия, законченная сегодня, после восстановления остаётся законченной', () => {
    const wordIds = ['only']
    let progress: ProgressStore = {}
    let session = createSession(progress, wordIds, TODAY, identity)
    const result = answerCurrent(session, progress, 'know', TODAY)
    session = result.session
    progress = result.progress
    expect(isSessionFinished(session)).toBe(true)
    writeStoredSession(TODAY, session)

    const restored = loadInitialSession(progress, wordIds, TODAY, identity)

    expect(isSessionFinished(restored)).toBe(true)
    expect(restored.queue).toEqual([])
  })

  it('без сохранённой сессии строит новую через createSession движка', () => {
    const wordIds = ['a', 'b']
    const progress: ProgressStore = {}
    const restored = loadInitialSession(progress, wordIds, TODAY, identity)
    expect(restored).toEqual(createSession(progress, wordIds, TODAY, identity))
  })

  it('испорченная сохранённая сессия молча игнорируется — собирается новая, без исключений', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, 'это не json вообще')
    const wordIds = ['a', 'b']
    const progress: ProgressStore = {}

    expect(() => loadInitialSession(progress, wordIds, TODAY, identity)).not.toThrow()
    const restored = loadInitialSession(progress, wordIds, TODAY, identity)
    expect(restored).toEqual(createSession(progress, wordIds, TODAY, identity))
  })

  it('сессия неправильной формы (валидный JSON, но не тот формат) тоже молча игнорируется', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ date: TODAY, session: { queue: 'не массив' } }))
    const wordIds = ['a', 'b']
    const progress: ProgressStore = {}

    const restored = loadInitialSession(progress, wordIds, TODAY, identity)
    expect(restored).toEqual(createSession(progress, wordIds, TODAY, identity))
  })
})
