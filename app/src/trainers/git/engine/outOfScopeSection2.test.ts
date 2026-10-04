// ============================================================
// Раздел 2 (шаг A): формы, которые настоящий git принимает, а шаг A не разбирает, получают отказ
// с TRAINER_MARKER, а не выдуманную ошибку git. Обратный набор — настоящие ошибки git.
// Формы и ответы сверены на git 2.53.0 (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createBranchingSection, getBranchMissions, runBranchingCommand } from './branchSection'
import type { BranchingState } from './branchTypes'

const MARKER = '[тренажёр]'

function run(state: BranchingState, ...lines: string[]): BranchingState {
  return lines.reduce((s, line) => runBranchingCommand(s, line).state, state)
}

function ready(): BranchingState {
  return run(createBranchingSection('Начальный коммит', { 'style.css': 'x', 'index.html': 'y' }), 'git branch feat')
}

function expectRefusal(state: BranchingState, line: string) {
  const snapshot = (s: BranchingState) => JSON.stringify({ ...s, history: [] })
  const missions = (s: BranchingState) => JSON.stringify(getBranchMissions(s))
  const { state: next, result } = runBranchingCommand(state, line)
  expect(result?.ok, line).toBe(false)
  expect(result?.output.startsWith(MARKER), line).toBe(true)
  expect(result?.output, line).not.toMatch(/^(fatal|error):/)
  expect(snapshot(next), line).toBe(snapshot(state))
  expect(missions(next), line).toBe(missions(state))
}

function output(state: BranchingState, line: string): string {
  return runBranchingCommand(state, line).result?.output ?? ''
}

describe('git add: формы путей, которые git принимает, — отказ', () => {
  const forms = [
    'git add ./index.html',
    'git add ../x',
    "git add '*.html'",
    "git add 'in?ex.html'",
    "git add ':(glob)*.html'",
    "git add ':!index.html'",
    'git add -- ./index.html',
    'git add index.html ./style.css',
  ]

  it('отказ с маркером, без fatal/error, состояние и миссии не меняются', () => {
    for (const line of forms) expectRefusal(ready(), line)
  })

  it('обратный набор: настоящие ошибки и рабочие формы остаются', () => {
    expect(output(ready(), 'git add nosuch')).toBe("fatal: pathspec 'nosuch' did not match any files")
    expect(output(ready(), 'git add index.html nosuch')).toBe("fatal: pathspec 'nosuch' did not match any files")
    expect(runBranchingCommand(ready(), 'git add index.html').result?.ok).toBe(true)
    expect(runBranchingCommand(ready(), 'git add .').result?.ok).toBe(true)
    expect(runBranchingCommand(ready(), 'git add -- index.html').result?.ok).toBe(true)
  })
})

describe('git checkout: формы путей и ревизий', () => {
  it('./файл, ../x, глоб, магия pathspec, <ревизия>:<путь> — отказ', () => {
    for (const line of [
      'git checkout ./index.html',
      'git checkout -- ./index.html',
      "git checkout -- '*.css'",
      "git checkout ':(glob)*.css'",
      'git checkout master:style.css',
      'git checkout -- ../x',
    ]) {
      expectRefusal(ready(), line)
    }
  })

  it('выражения ревизий — отказ (прежнее поведение сохранено)', () => {
    for (const line of ['git checkout HEAD@{1}', 'git checkout master^', 'git checkout HEAD~1', 'git checkout -b y HEAD~1', 'git checkout -']) {
      expectRefusal(ready(), line)
    }
  })

  it('обратный набор: настоящие ошибки и рабочие формы остаются', () => {
    expect(output(ready(), 'git checkout nosuch')).toBe("error: pathspec 'nosuch' did not match any file(s) known to git")
    expect(output(ready(), 'git checkout -- nosuch')).toBe("error: pathspec 'nosuch' did not match any file(s) known to git")
    expect(output(ready(), 'git checkout feat..master')).toBe("error: pathspec 'feat..master' did not match any file(s) known to git")
    expect(output(ready(), 'git checkout feat')).toBe("Switched to branch 'feat'")
    expect(runBranchingCommand(ready(), 'git checkout style.css').result?.ok).toBe(true)
  })
})

describe('git merge и git branch: ревизии', () => {
  it('merge: ветка~N, HEAD, <ревизия>:<путь> — отказ', () => {
    for (const line of ['git merge feat~0', 'git merge HEAD~1', 'git merge HEAD@{1}', 'git merge master:style.css']) {
      expectRefusal(ready(), line)
    }
  })

  it('branch и checkout -b с начальной точкой — отказ', () => {
    for (const line of ['git branch x feat', 'git branch x master~1', 'git branch x HEAD@{1}']) expectRefusal(ready(), line)
  })

  it('обратный набор: настоящие ошибки git остаются', () => {
    expect(output(ready(), 'git merge nosuch')).toBe('merge: nosuch - not something we can merge')
    expect(output(ready(), 'git merge a..b')).toBe('merge: a..b - not something we can merge')
    expect(output(ready(), 'git branch HEAD@{1}').split('\n')[0]).toBe("fatal: 'HEAD@{1}' is not a valid branch name")
    expect(output(ready(), 'git branch -d ./x')).toBe("error: branch './x' not found")
  })
})

describe('B9: опции раздела 2 — списки исчерпывающие', () => {
  it('заведомо несуществующие остаются ошибкой git', () => {
    expect(output(ready(), 'git add -x')).toBe("error: unknown switch `x'")
    expect(output(ready(), 'git checkout --bogus')).toBe("error: unknown option `bogus'")
    expect(output(ready(), 'git merge --bogus feat')).toBe("error: unknown option `bogus'")
    expect(output(ready(), 'git status -Z9')).toBe("error: unknown switch `Z'")
  })

  it('принимаемые git, но не разбираемые — отказ', () => {
    for (const line of ['git add --no-verbose x', 'git branch --no-color', 'git checkout --no-guess feat', 'git merge --no-ff feat', 'git commit --no-verify -m x', 'git status --no-ahead-behind']) {
      expectRefusal(ready(), line)
    }
  })
})
