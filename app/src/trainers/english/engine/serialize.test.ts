import { describe, expect, it } from 'vitest'
import { PROGRESS_FORMAT_VERSION, parseProgress, serializeProgress } from './serialize'
import type { ProgressStore } from './types'

describe('правило 9 — сериализация прогресса', () => {
  it('serializeProgress → parseProgress восстанавливает исходное хранилище', () => {
    const store: ProgressStore = {
      hello: { box: 2, dueDate: '2026-09-25' },
      world: { box: 5, dueDate: '2026-10-22' },
    }
    const json = serializeProgress(store)
    const result = parseProgress(json)
    expect(result).toEqual({ ok: true, store })
  })

  it('в JSON есть поле версии формата', () => {
    const json = serializeProgress({})
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(PROGRESS_FORMAT_VERSION)
  })

  it('пустое хранилище сериализуется и разбирается корректно', () => {
    expect(parseProgress(serializeProgress({}))).toEqual({ ok: true, store: {} })
  })

  it('синтаксически некорректный JSON — ok: false, без исключения', () => {
    expect(() => parseProgress('{not valid json')).not.toThrow()
    expect(parseProgress('{not valid json')).toEqual({ ok: false, error: 'invalid-json' })
  })

  it('JSON не объект (например массив или число) — ok: false', () => {
    expect(parseProgress('42')).toEqual({ ok: false, error: 'not-an-object' })
    expect(parseProgress('[1,2,3]').ok).toBe(false)
  })

  it('неизвестная/несовпадающая версия формата — ok: false', () => {
    const json = JSON.stringify({ version: 999, entries: {} })
    expect(parseProgress(json)).toEqual({ ok: false, error: 'unsupported-version' })
  })

  it('отсутствует поле entries — ok: false', () => {
    const json = JSON.stringify({ version: PROGRESS_FORMAT_VERSION })
    expect(parseProgress(json)).toEqual({ ok: false, error: 'missing-entries' })
  })

  it('запись слова с некорректным box или dueDate — ok: false, не бросает и не теряет данные молча', () => {
    const badBox = JSON.stringify({ version: PROGRESS_FORMAT_VERSION, entries: { w: { box: 9, dueDate: '2026-09-22' } } })
    expect(parseProgress(badBox)).toEqual({ ok: false, error: 'invalid-entry' })

    const badDate = JSON.stringify({ version: PROGRESS_FORMAT_VERSION, entries: { w: { box: 1, dueDate: 'not-a-date' } } })
    expect(parseProgress(badDate)).toEqual({ ok: false, error: 'invalid-entry' })
  })

  it('произвольный посторонний JSON (не наш формат вообще) не бросает исключение', () => {
    expect(() => parseProgress('{"hello":"world"}')).not.toThrow()
    expect(parseProgress('{"hello":"world"}').ok).toBe(false)
  })
})
