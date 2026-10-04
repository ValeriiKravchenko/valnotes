// ============================================================
// Раздел 6 git-тренажёра, шаг A: id коммита (40 знаков), форматирование даты,
// разбор ссылок (searchRepo.ts). target.md, часть VIII, «Движок»/«Форматы».
// ============================================================
import { describe, expect, it } from 'vitest'
import { formatBlameDate, formatGitLongDate, resolveSearchRef, searchCommitId } from './searchRepo'
import { createSearchSection } from './searchSection'
import { ru } from '../locales/ru'

describe('searchCommitId — 40 шестнадцатеричных знаков (target.md, «Движок»)', () => {
  const tree = { 'a.txt': 'x' }
  const date = { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0, tzOffsetMinutes: 180 }

  it('ровно 40 hex-знаков', () => {
    const id = searchCommitId('msg', tree, null, 'A', 'a@example.com', date)
    expect(id).toMatch(/^[0-9a-f]{40}$/)
  })

  it('детерминирован: одинаковые входные данные — одинаковый id', () => {
    const a = searchCommitId('msg', tree, null, 'A', 'a@example.com', date)
    const b = searchCommitId('msg', tree, null, 'A', 'a@example.com', date)
    expect(a).toBe(b)
  })

  it('разное сообщение/дерево/автор/дата — разный id', () => {
    const base = searchCommitId('msg', tree, null, 'A', 'a@example.com', date)
    expect(searchCommitId('other', tree, null, 'A', 'a@example.com', date)).not.toBe(base)
    expect(searchCommitId('msg', { 'a.txt': 'y' }, null, 'A', 'a@example.com', date)).not.toBe(base)
    expect(searchCommitId('msg', tree, null, 'B', 'a@example.com', date)).not.toBe(base)
    expect(searchCommitId('msg', tree, null, 'A', 'a@example.com', { ...date, day: 2 })).not.toBe(base)
  })
})

describe('formatGitLongDate — target.md, «Форматы»: git show/log', () => {
  it('Thu Mar 12 10:00:00 2026 +0300 (день недели вычисляется правильно)', () => {
    expect(formatGitLongDate({ year: 2026, month: 3, day: 12, hour: 10, minute: 0, second: 0, tzOffsetMinutes: 180 })).toBe(
      'Thu Mar 12 10:00:00 2026 +0300',
    )
  })

  it('однозначный день — БЕЗ ведущего нуля/пробела (сверено прогоном: "Fri May 1 10:00:00 2026 +0300")', () => {
    expect(formatGitLongDate({ year: 2026, month: 5, day: 1, hour: 10, minute: 0, second: 0, tzOffsetMinutes: 180 })).toBe(
      'Fri May 1 10:00:00 2026 +0300',
    )
  })

  it('коммиты «Проекта» — все три даты (докстрока сверена с Д11)', () => {
    expect(formatGitLongDate({ year: 2026, month: 3, day: 18, hour: 11, minute: 0, second: 0, tzOffsetMinutes: 180 })).toBe(
      'Wed Mar 18 11:00:00 2026 +0300',
    )
    expect(formatGitLongDate({ year: 2026, month: 4, day: 2, hour: 12, minute: 0, second: 0, tzOffsetMinutes: 180 })).toBe(
      'Thu Apr 2 12:00:00 2026 +0300',
    )
  })
})

describe('formatBlameDate — target.md, «Форматы»: git blame', () => {
  it('2026-04-02 12:00:00 +0300 (все поля с ведущими нулями)', () => {
    expect(formatBlameDate({ year: 2026, month: 4, day: 2, hour: 12, minute: 0, second: 0, tzOffsetMinutes: 180 })).toBe('2026-04-02 12:00:00 +0300')
  })
})

describe('resolveSearchRef — HEAD/ветка/хэш с ^/~ (target.md, «Поиск в коммите»)', () => {
  function makeState() {
    return createSearchSection({ commits: ru.searching.seed.commits })
  }

  it('HEAD и master указывают на один и тот же (последний) коммит', () => {
    const state = makeState()
    const head = state.branches[state.head]
    expect(resolveSearchRef(state, 'HEAD')).toBe(head)
    expect(resolveSearchRef(state, 'master')).toBe(head)
  })

  it('HEAD~2 указывает на корневой коммит (три коммита в цепочке)', () => {
    const state = makeState()
    const root = Object.values(state.commits).find((c) => c.parentId === null)!.id
    expect(resolveSearchRef(state, 'HEAD~2')).toBe(root)
    expect(resolveSearchRef(state, 'HEAD^^')).toBe(root)
  })

  it('короткий хэш (>=4 знаков), однозначно совпавший с одним коммитом, разрешается', () => {
    const state = makeState()
    const head = state.branches[state.head]
    expect(resolveSearchRef(state, head.slice(0, 7))).toBe(head)
    expect(resolveSearchRef(state, head.slice(0, 40))).toBe(head)
  })

  it('уход за пределы корня (HEAD~3 при трёх коммитах) — не найдено', () => {
    const state = makeState()
    expect(resolveSearchRef(state, 'HEAD~3')).toBeNull()
  })

  it('несуществующая ссылка — не найдено', () => {
    const state = makeState()
    expect(resolveSearchRef(state, 'nosuchbranch')).toBeNull()
  })
})
