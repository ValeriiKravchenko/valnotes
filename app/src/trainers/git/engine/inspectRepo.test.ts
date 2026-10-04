// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): чистые операции над
// цепочкой коммитов — разбор ссылок, диапазоны, git status. Без разбора
// командной строки (см. inspectCommands.test.ts для сквозных проверок).
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  commitChain,
  commitTouchesFile,
  formatInspectStatus,
  formatInspectStatusShort,
  inspectStatus,
  rangeCommits,
  resolveRef,
  trackedWorking,
} from './inspectRepo'
import { createInspectSection, getAllCommits } from './inspectSection'
import type { InspectState } from './inspectTypes'

function baseState(): InspectState {
  return createInspectSection({
    commits: [
      { message: 'root', tree: { a: '1' } },
      { message: 'middle', tree: { a: '1', b: '1' } },
      { message: 'tip', tree: { a: '2', b: '1' } },
    ],
  })
}

function idOf(state: InspectState, message: string): string {
  const c = getAllCommits(state).find((x) => x.message === message)
  if (!c) throw new Error(`нет коммита «${message}»`)
  return c.id
}

describe('resolveRef — gitrevisions (target.md, часть V, «Ссылки на коммиты»; spec S3-41…S3-43)', () => {
  it('HEAD резолвится в последний коммит', () => {
    const s = baseState()
    expect(resolveRef(s, 'HEAD')).toBe(idOf(s, 'tip'))
  })

  it('имя ветки резолвится в её вершину', () => {
    const s = baseState()
    expect(resolveRef(s, 'master')).toBe(idOf(s, 'tip'))
  })

  it('HEAD^ и HEAD~ — первый родитель (одно и то же в линейной истории)', () => {
    const s = baseState()
    expect(resolveRef(s, 'HEAD^')).toBe(idOf(s, 'middle'))
    expect(resolveRef(s, 'HEAD~')).toBe(idOf(s, 'middle'))
    expect(resolveRef(s, 'HEAD~1')).toBe(idOf(s, 'middle'))
  })

  it('HEAD~~ === HEAD^^ === HEAD~2 === HEAD~1^ — второй родитель назад (target.md, «опасное место 5»)', () => {
    const s = baseState()
    const root = idOf(s, 'root')
    expect(resolveRef(s, 'HEAD~~')).toBe(root)
    expect(resolveRef(s, 'HEAD^^')).toBe(root)
    expect(resolveRef(s, 'HEAD~2')).toBe(root)
    expect(resolveRef(s, 'HEAD~1^')).toBe(root)
  })

  it('master~1 — ссылка по имени ветки с оператором', () => {
    const s = baseState()
    expect(resolveRef(s, 'master~1')).toBe(idOf(s, 'middle'))
  })

  it('начало хэша от 4 символов резолвится однозначно', () => {
    const s = baseState()
    const id = idOf(s, 'root')
    expect(resolveRef(s, id.slice(0, 4))).toBe(id)
    expect(resolveRef(s, id.slice(0, 5))).toBe(id)
  })

  it('HEAD@{0} — тривиальный частный случай синтаксиса, тот же коммит, что и HEAD (spec S3-43)', () => {
    const s = baseState()
    expect(resolveRef(s, 'HEAD@{0}')).toBe(idOf(s, 'tip'))
  })

  it('HEAD^2, HEAD~3 (за пределами корня), HEAD@{99}, "abc" — не найдено (spec S3-42)', () => {
    const s = baseState()
    expect(resolveRef(s, 'HEAD^2')).toBeNull()
    expect(resolveRef(s, 'HEAD~3')).toBeNull()
    expect(resolveRef(s, 'HEAD@{99}')).toBeNull()
    expect(resolveRef(s, 'abc')).toBeNull()
  })

  it('пустая строка, неизвестная ветка, слишком короткий хэш (<4) — не найдено', () => {
    const s = baseState()
    expect(resolveRef(s, '')).toBeNull()
    expect(resolveRef(s, 'nosuchbranch')).toBeNull()
    expect(resolveRef(s, idOf(s, 'root').slice(0, 3))).toBeNull()
  })
})

describe('commitChain / rangeCommits (target.md, «История»/«История части»)', () => {
  it('commitChain — от коммита назад по родителям, новые сверху', () => {
    const s = baseState()
    expect(commitChain(s, idOf(s, 'tip'))).toEqual([idOf(s, 'tip'), idOf(s, 'middle'), idOf(s, 'root')])
  })

  it('rangeCommits(A,B) — коммиты из B, но не из A; сам A не входит (target.md, «опасное место 4»)', () => {
    const s = baseState()
    const range = rangeCommits(s, idOf(s, 'root'), idOf(s, 'tip'))
    expect(range).toEqual([idOf(s, 'tip'), idOf(s, 'middle')])
    expect(range).not.toContain(idOf(s, 'root'))
  })

  it('rangeCommits(A,A) — пусто (сам A не входит никуда)', () => {
    const s = baseState()
    expect(rangeCommits(s, idOf(s, 'tip'), idOf(s, 'tip'))).toEqual([])
  })
})

describe('commitTouchesFile (target.md, «История файла»)', () => {
  it('корневой коммит — появление файла считается изменением', () => {
    const s = baseState()
    expect(commitTouchesFile(s, idOf(s, 'root'), 'a')).toBe(true)
  })

  it('коммит, не менявший файл, — false', () => {
    const s = baseState()
    expect(commitTouchesFile(s, idOf(s, 'middle'), 'a')).toBe(false)
  })

  it('коммит, изменивший файл, — true', () => {
    const s = baseState()
    expect(commitTouchesFile(s, idOf(s, 'tip'), 'a')).toBe(true)
    expect(commitTouchesFile(s, idOf(s, 'middle'), 'b')).toBe(true)
  })
})

describe('inspectStatus / trackedWorking (target.md, A1/A3 — те же три области, что и в разделах 1–2)', () => {
  function dirtyState(): InspectState {
    const s = baseState()
    return {
      ...s,
      index: { ...s.index, b: '2' }, // b изменён и подготовлен
      working: { ...s.index, b: '2', a: '3', todo: 'x' }, // a изменён и НЕ подготовлен; todo — неотслеживаемый
    }
  }

  it('staged/notStaged/untracked считаются раздельно (индекс vs HEAD, рабочее дерево vs индекс)', () => {
    const s = dirtyState()
    const snap = inspectStatus(s)
    expect(snap.staged).toEqual([{ file: 'b', type: 'modified' }])
    expect(snap.notStaged).toEqual([{ file: 'a', type: 'modified' }])
    expect(snap.untracked).toEqual(['todo'])
  })

  it('trackedWorking исключает неотслеживаемые файлы из рабочего дерева (target.md, «опасное место 2»)', () => {
    const s = dirtyState()
    const tracked = trackedWorking(s)
    expect(tracked).toEqual({ a: '3', b: '2' })
    expect(tracked).not.toHaveProperty('todo')
  })

  it('formatInspectStatusShort — " M"/"M "/"??" (target.md, «Короткий статус»)', () => {
    const s = dirtyState()
    const lines = formatInspectStatusShort(s).split('\n')
    expect(lines).toContain(' M a')
    expect(lines).toContain('M  b')
    expect(lines).toContain('?? todo')
  })

  it('formatInspectStatus — "On branch master" и оба блока изменений', () => {
    const s = dirtyState()
    const text = formatInspectStatus(s)
    expect(text).toContain('On branch master')
    expect(text).toContain('Changes to be committed:')
    expect(text).toContain('Changes not staged for commit:')
    expect(text).toContain('Untracked files:')
  })

  it('чистое дерево — "nothing to commit, working tree clean"', () => {
    const s = baseState()
    expect(formatInspectStatus(s)).toBe('On branch master\nnothing to commit, working tree clean')
    expect(formatInspectStatusShort(s)).toBe('')
  })
})
