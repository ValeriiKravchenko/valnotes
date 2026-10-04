// ============================================================
// Раздел 3: формы, которые настоящий git принимает, а раздел 3 не разбирает, получают отказ с
// TRAINER_MARKER; заведомо несуществующие опции — текст настоящего git; настоящие ошибки git
// остаются. Формы и ответы сверены на git 2.53.0 (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createInspectSection, getInspectMissions, runInspectCommand } from './inspectSection'
import type { InspectState } from './inspectTypes'
import { VERIFIED_SECTION3_OPTIONS } from './inspectScope'

const MARKER = '[тренажёр]'

function baseState(): InspectState {
  return createInspectSection({
    commits: [
      { message: 'Первый', tree: { 'index.html': 'a' } },
      { message: 'Стили', tree: { 'index.html': 'a', 'style.css': 'b' } },
      { message: 'Обо мне', tree: { 'index.html': 'a\nb', 'style.css': 'b' } },
    ],
    index: { 'index.html': 'a\nb', 'style.css': 'b' },
    working: { 'index.html': 'a\nb', 'style.css': 'b' },
  })
}

function out(line: string, state = baseState()): string {
  return runInspectCommand(state, line).result?.output ?? ''
}

function expectRefusal(line: string) {
  const state = baseState()
  const snapshot = (s: InspectState) => JSON.stringify({ ...s, history: [] })
  const missions = (s: InspectState) => JSON.stringify(getInspectMissions(s))
  const { state: next, result } = runInspectCommand(state, line)
  expect(result?.ok, line).toBe(false)
  expect(result?.output.startsWith(MARKER), line).toBe(true)
  expect(result?.output, line).not.toMatch(/^(fatal|error):/)
  expect(snapshot(next), line).toBe(snapshot(state))
  expect(missions(next), line).toBe(missions(state))
}

describe('ссылки вне грамматики раздела 3 — отказ', () => {
  it('HEAD@{N}, HEAD^2, HEAD~1.., ..HEAD, ревизия:путь в log/diff/show', () => {
    for (const cmd of ['log', 'diff', 'show']) {
      for (const ref of ['HEAD@{1}', 'HEAD@{99}', 'HEAD^2', 'HEAD~1..', '..HEAD', 'HEAD:index.html']) {
        expectRefusal(`git ${cmd} ${ref}`)
      }
    }
  })

  it('git diff HEAD@{1} --stat и git log --oneline HEAD@{1} — тоже отказ', () => {
    expectRefusal('git diff HEAD@{1} --stat')
    expectRefusal('git log --oneline HEAD@{1}')
  })

  it('обратный набор: настоящие ошибки git и рабочие формы остаются', () => {
    expect(out('git log HEAD~3')).toContain("fatal: ambiguous argument 'HEAD~3'")
    expect(out('git log nosuch')).toContain("fatal: ambiguous argument 'nosuch'")
    expect(out('git log a..b')).toContain("fatal: ambiguous argument 'a..b'")
    expect(out('git show nosuch')).toContain("fatal: ambiguous argument 'nosuch'")
    expect(out('git diff nosuch')).toContain("ambiguous argument 'nosuch'")
    expect(runInspectCommand(baseState(), 'git log HEAD@{0}').result?.ok).toBe(true)
    expect(runInspectCommand(baseState(), 'git log HEAD~2..HEAD').result?.ok).toBe(true)
  })
})

describe('формы путей — отказ', () => {
  it('./файл, ../x, глоб, магия pathspec в log/diff/show и после --', () => {
    for (const line of [
      'git log ./index.html',
      'git log -- ./index.html',
      "git log -- '*.css'",
      'git diff ./index.html',
      'git diff -- ./index.html',
      "git diff ':(glob)*.css'",
      'git show ./index.html',
    ]) {
      expectRefusal(line)
    }
  })

  it('git status с любым путём — отказ (в том числе ./, ../, магия)', () => {
    for (const line of ['git status ./index.html', 'git status ../x', "git status ':(glob)*.html'", "git status '*.html'"]) {
      expectRefusal(line)
    }
  })

  it('обратный набор: обычное имя файла работает', () => {
    expect(runInspectCommand(baseState(), 'git log index.html').result?.ok).toBe(true)
    expect(runInspectCommand(baseState(), 'git log -- style.css').result?.ok).toBe(true)
  })
})

describe('опции', () => {
  it('git show -1 — отказ (git принимает)', () => {
    expectRefusal('git show -1')
  })

  it('все сверенные принимаемые git опции log/show/diff/status не дают поддельной ошибки', () => {
    const skip = new Set(['-h', '--help', '--oneline', '--stat', '--staged', '--cached', '--name-only', '-s', '--short', '-n', '-1'])
    for (const [cmd, list] of Object.entries(VERIFIED_SECTION3_OPTIONS)) {
      for (const opt of list) {
        if (skip.has(opt) && !(cmd === 'show' && opt === '-s')) continue
        const o = out(`git ${cmd} ${opt}`)
        expect(o, `git ${cmd} ${opt}`).not.toMatch(/unrecognized argument|invalid option|unknown (option|switch)/)
      }
    }
  })

  it('--no-<известная опция> — отказ', () => {
    for (const line of ['git log --no-color', 'git diff --no-prefix', 'git status --no-ahead-behind', 'git show --no-patch']) {
      expectRefusal(line)
    }
  })

  it('B5: git log --one и git show --one — дословный текст git, не отказ', () => {
    expect(out('git log --one')).toBe('fatal: unrecognized argument: --one')
    expect(out('git show --bogus')).toBe('fatal: unrecognized argument: --bogus')
    expect(out('git log -x')).toBe('fatal: unrecognized argument: -x')
    expect(out('git show -Z9')).toBe('fatal: unrecognized argument: -Z9')
  })

  it('git diff --bogus — текст git "invalid option"', () => {
    expect(out('git diff --bogus').split('\n')[0]).toBe('error: invalid option: --bogus')
    expect(out('git diff -x').split('\n')[0]).toBe('error: invalid option: -x')
  })

  it('git status: исчерпывающий список — несуществующие остаются ошибкой git', () => {
    expect(out('git status -x')).toBe("error: unknown switch `x'")
    expect(out('git status --bogus')).toBe("error: unknown option `bogus'")
  })

  it('обратный набор: опции в области работают', () => {
    expect(runInspectCommand(baseState(), 'git log --oneline').result?.ok).toBe(true)
    expect(runInspectCommand(baseState(), 'git status -s').result?.ok).toBe(true)
  })
})
