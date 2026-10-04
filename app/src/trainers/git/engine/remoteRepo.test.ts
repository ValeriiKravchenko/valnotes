// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): проверки чистых функций
// remoteRepo.ts — граф коммитов, merge-base, «было бы затёрто»,
// collectReachable (передача объектов), формат ref-строк push/fetch.
// Сквозные проверки команд терминала — в remoteCommands.test.ts.
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  aheadBehindCounts,
  applyTreeChange,
  checkSafety,
  collectReachable,
  isAncestor,
  mergeBase,
  refLine,
  remoteCommitHash,
} from './remoteRepo'
import type { RemoteCommit } from './remoteTypes'

function commit(id: string, parents: string[], tree: Record<string, string> = {}): RemoteCommit {
  return { id, parents, message: id, tree }
}

/** Линейная история A -> B -> C (A корневой). */
function linearGraph(): Record<string, RemoteCommit> {
  return { A: commit('A', []), B: commit('B', ['A']), C: commit('C', ['B']) }
}

describe('isAncestor/mergeBase (портировано из branchRepo.ts под явную карту коммитов)', () => {
  it('корневой коммит — предок всех остальных, коммит — предок самого себя', () => {
    const g = linearGraph()
    expect(isAncestor(g, 'A', 'C')).toBe(true)
    expect(isAncestor(g, 'C', 'C')).toBe(true)
    expect(isAncestor(g, 'C', 'A')).toBe(false)
  })

  it('mergeBase линейной истории — более ранний коммит', () => {
    const g = linearGraph()
    const result = mergeBase(g, 'B', 'C')
    expect(result).toEqual({ ambiguous: false, base: 'B' })
  })

  it('mergeBase расходящихся веток — общий корень', () => {
    const g = { ...linearGraph(), D: commit('D', ['A']) } // B и D — сёстры от A
    const result = mergeBase(g, 'C', 'D')
    expect(result).toEqual({ ambiguous: false, base: 'A' })
  })
})

describe('aheadBehindCounts (target.md, часть VII, опасное место 1 — числа для "ahead of"/"behind"/"have diverged")', () => {
  it('одинаковые коммиты — 0 и 0', () => {
    const g = linearGraph()
    expect(aheadBehindCounts(g, 'C', 'C')).toEqual({ ahead: 0, behind: 0 })
  })

  it('a впереди b на 1 коммит — ahead:1, behind:0', () => {
    const g = linearGraph()
    expect(aheadBehindCounts(g, 'C', 'B')).toEqual({ ahead: 1, behind: 0 })
  })

  it('a позади b на 1 коммит — ahead:0, behind:1', () => {
    const g = linearGraph()
    expect(aheadBehindCounts(g, 'B', 'C')).toEqual({ ahead: 0, behind: 1 })
  })

  it('ветки разошлись по одному коммиту каждая — ahead:1, behind:1 (сверено прогоном: "have 1 and 1 different commits each")', () => {
    const g = { ...linearGraph(), D: commit('D', ['B']) } // C и D — сёстры от B
    expect(aheadBehindCounts(g, 'C', 'D')).toEqual({ ahead: 1, behind: 1 })
  })
})

describe('collectReachable (передача объектов clone/fetch/push — у сервера и копии своя объектная база)', () => {
  it('копирует всю цепочку предков, которых не было в target', () => {
    const source = linearGraph()
    const target = collectReachable(source, {}, 'C')
    expect(Object.keys(target).sort()).toEqual(['A', 'B', 'C'])
  })

  it('не трогает target, если коммит уже есть (и не обходит его родителей повторно)', () => {
    const source = linearGraph()
    const target = collectReachable(source, { C: source.C }, 'C')
    // Родители C (B, A) реально недостижимы из переданного target, но раз сам "C" уже там —
    // функция должна остановиться сразу (реальный git не перекачивает объекты, которые уже есть).
    expect(Object.keys(target)).toEqual(['C'])
  })

  it('частичная копия — докачивает только недостающих предков', () => {
    const source = linearGraph()
    const target = collectReachable(source, { A: source.A }, 'C')
    expect(Object.keys(target).sort()).toEqual(['A', 'B', 'C'])
  })
})

describe('checkSafety/applyTreeChange (портировано из branchRepo.ts под явные деревья, а не BranchingState)', () => {
  it('чистое дерево — переключение проходит, дерево меняется целиком', () => {
    const head = { 'a.txt': '1' }
    const target = { 'a.txt': '2' }
    const block = checkSafety(head, head, head, target)
    expect(block).toEqual({ modified: [], untracked: [] })
    const { index, working } = applyTreeChange(head, head, head, target)
    expect(index).toEqual(target)
    expect(working).toEqual(target)
  })

  it('незастейджённая правка файла, который цель тоже меняет — блокирует (было бы затёрто)', () => {
    const head = { 'a.txt': '1' }
    const target = { 'a.txt': '2' }
    const working = { 'a.txt': 'моя правка' }
    const block = checkSafety(head, head, working, target)
    expect(block.modified).toEqual(['a.txt'])
  })

  it('неотслеживаемый файл (не в head/индексе) переживает переключение как есть', () => {
    const head = { 'a.txt': '1' }
    const working = { 'a.txt': '1', 'notes.txt': 'мои заметки' }
    const target = { 'a.txt': '2' }
    const block = checkSafety(head, head, working, target)
    expect(block).toEqual({ modified: [], untracked: [] })
    const { working: nextWorking } = applyTreeChange(head, head, working, target)
    expect(nextWorking['notes.txt']).toBe('мои заметки')
    expect(nextWorking['a.txt']).toBe('2')
  })
})

describe('refLine (target.md, часть VII, опасное место 3 — формат строк push/fetch)', () => {
  it('обычная строка обновления (push, без выравнивания имени)', () => {
    expect(refLine(' ', 'df95a30..fe1c704', 'master', 'master')).toBe('   df95a30..fe1c704  master -> master')
  })

  it('новая ветка (fetch, с выравниванием имени до ширины 13)', () => {
    expect(refLine('*', '[new branch]', 'feature', 'origin/feature', '', 13)).toBe(' * [new branch]      feature       -> origin/feature')
  })

  it('форс-обновление с суффиксом', () => {
    expect(refLine('+', '1dce8e5...a3ec707', 'master', 'master', ' (forced update)')).toBe(' + 1dce8e5...a3ec707 master -> master (forced update)')
  })

  it('отказ (push)', () => {
    expect(refLine('!', '[rejected]', 'master', 'master', ' (fetch first)')).toBe(' ! [rejected]        master -> master (fetch first)')
  })
})

describe('remoteCommitHash (util.ts, commitHashCore — общая функция, A5)', () => {
  it('одинаковый вход даёт одинаковый id; разные родители/clock — разные id', () => {
    const a = remoteCommitHash('m', { f: '1' }, [], 0)
    const b = remoteCommitHash('m', { f: '1' }, [], 0)
    const c = remoteCommitHash('m', { f: '1' }, [], 1)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toHaveLength(7)
  })
})
