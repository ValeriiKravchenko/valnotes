// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): миссии «Что попробовать»
// (target.md, часть V, «Миссии»; spec S3-38 — засчитываются по событию).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createInspectSection, getInspectMissions, runInspectCommand } from './inspectSection'
import type { InspectState } from './inspectTypes'

function baseState(): InspectState {
  return createInspectSection({
    commits: [
      { message: 'root', tree: { a: '1' } },
      { message: 'tip', tree: { a: '2', b: '1' } },
    ],
    index: { a: '2', b: '2' },
    working: { a: '3', b: '2' },
  })
}

function run(state: InspectState, input: string) {
  return runInspectCommand(state, input).state
}

function doneMap(state: InspectState): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  getInspectMissions(state).forEach((m) => (map[m.id] = m.done))
  return map
}

describe('миссии раздела 3 — засчитываются по событию (S3-38)', () => {
  it('изначально ни одна миссия не выполнена', () => {
    expect(doneMap(baseState())).toEqual({ log: false, logOneline: false, diff: false, diffStaged: false })
  })

  it('голый "git log" засчитывает миссию log, но не остальные', () => {
    const s = run(baseState(), 'git log')
    expect(doneMap(s)).toEqual({ log: true, logOneline: false, diff: false, diffStaged: false })
  })

  it('"git log --oneline" засчитывает миссию logOneline, но НЕ миссию log (другая форма)', () => {
    const s = run(baseState(), 'git log --oneline')
    expect(doneMap(s)).toEqual({ log: false, logOneline: true, diff: false, diffStaged: false })
  })

  it('другие формы log/diff (не входящие в текст миссии) не засчитывают эти четыре миссии', () => {
    let s = baseState()
    s = run(s, 'git log -1')
    s = run(s, 'git diff HEAD')
    expect(doneMap(s)).toEqual({ log: false, logOneline: false, diff: false, diffStaged: false })
  })

  it('голый "git diff" засчитывает миссию diff', () => {
    const s = run(baseState(), 'git diff')
    expect(doneMap(s).diff).toBe(true)
  })

  it('"git diff --staged" и "git diff --cached" обе засчитывают миссию diffStaged', () => {
    expect(doneMap(run(baseState(), 'git diff --staged')).diffStaged).toBe(true)
    expect(doneMap(run(baseState(), 'git diff --cached')).diffStaged).toBe(true)
  })

  it('неудачная команда миссию не засчитывает', () => {
    const s = run(baseState(), 'git log --graph')
    expect(doneMap(s).log).toBe(false)
  })

  it('однажды засчитанная миссия остаётся засчитанной (target.md, п.2)', () => {
    let s = baseState()
    s = run(s, 'git log')
    s = run(s, 'git status') // другая команда не сбрасывает
    expect(doneMap(s).log).toBe(true)
  })

  it('все четыре миссии одновременно — сквозной сценарий S3-38', () => {
    let s = baseState()
    s = run(s, 'git log')
    s = run(s, 'git log --oneline')
    s = run(s, 'git diff')
    s = run(s, 'git diff --staged')
    expect(doneMap(s)).toEqual({ log: true, logOneline: true, diff: true, diffStaged: true })
  })

  it('ведущие пробелы не мешают зачёту (target.md, п. B1)', () => {
    const s = run(baseState(), '  git log ')
    expect(doneMap(s).log).toBe(true)
  })
})
