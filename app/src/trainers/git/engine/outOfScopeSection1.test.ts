// ============================================================
// Раздел 1: границы области (target.md, часть III, правило 1) — формы, которые настоящий git
// принимает, а раздел 1 не разбирает, получают отказ с TRAINER_MARKER, а не выдуманную ошибку git.
// Обратный набор — настоящие ошибки git, они остаются как есть. Формы и ответы сверены на
// git 2.53.0 (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createSection, getMissions, runCommand } from './index'
import type { SectionState } from './index'
import { ru } from '../locales/ru'

const MARKER = '[тренажёр]'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

function ready(): SectionState {
  return run(createSection(), 'git init')
}

function expectRefusal(state: SectionState, line: string) {
  const before = JSON.stringify({ ...state, history: [] })
  const missionsBefore = JSON.stringify(getMissions(state))
  const { state: next, result } = runCommand(state, line)
  expect(result?.ok, line).toBe(false)
  expect(result?.output.startsWith(MARKER), line).toBe(true)
  expect(result?.output, line).not.toMatch(/^(fatal|error):/)
  expect(JSON.stringify({ ...next, history: [] }), line).toBe(before)
  expect(JSON.stringify(getMissions(next)), line).toBe(missionsBefore)
  return result!
}

describe('git init с аргументами — отказ', () => {
  const forms = ['git init --bare', 'git init extra', 'git init -b main', 'git init -q', 'git init .']

  it('на свежем состоянии: репозиторий не создаётся, миссии не меняются', () => {
    for (const line of forms) expectRefusal(createSection(), line)
  })

  it('на уже созданном репозитории: то же', () => {
    for (const line of forms) expectRefusal(ready(), line)
  })

  it('текст — ключ словаря с введённой формой', () => {
    const { result } = runCommand(createSection(), 'git init extra')
    expect(result?.output).toBe(ru.errors.initArgumentsOutOfScope('git init extra'))
  })

  it('обратный набор: git init без аргументов работает как прежде', () => {
    const { result } = runCommand(createSection(), 'git init')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe('Initialized empty Git repository in site/.git/')
  })
})

describe('git add: формы путей, которые git принимает, — отказ', () => {
  const forms = ['git add ./index.html', 'git add ../x', "git add ':(glob)*.html'", "git add ':!index.html'", 'git add -- ./index.html']

  it('отказ с маркером, без fatal/error, состояние и миссии не меняются', () => {
    for (const line of forms) expectRefusal(ready(), line)
  })

  it('текст — ключ словаря с введённой формой и списком возможностей раздела', () => {
    const { result } = runCommand(ready(), 'git add ./index.html')
    expect(result?.output.startsWith(`${MARKER} git add ./index.html`)).toBe(true)
    expect(result?.output).toContain('git add .')
  })

  it('git commit -m x ./index.html — тот же отказ, коммит не создаётся', () => {
    const state = run(ready(), 'git add index.html')
    expectRefusal(state, 'git commit -m x ./index.html')
  })

  it('обратный набор: настоящие ошибки git остаются', () => {
    const { result } = runCommand(ready(), 'git add nosuch')
    expect(result?.output).toBe("fatal: pathspec 'nosuch' did not match any files")
    const bad = runCommand(run(ready(), 'git add index.html'), 'git commit -m x nosuch.txt')
    expect(bad.result?.output).toBe("error: pathspec 'nosuch.txt' did not match any file(s) known to git")
  })

  it("обратный набор: глоб в кавычках раздел 1 разбирает сам, git add '*.html' работает", () => {
    const { state, result } = runCommand(ready(), "git add '*.html'")
    expect(result?.ok).toBe(true)
    expect(state.index['index.html']).toBeDefined()
  })

  it('обратный набор: обычное имя и точка работают', () => {
    expect(runCommand(ready(), 'git add index.html').result?.ok).toBe(true)
    expect(runCommand(ready(), 'git add .').result?.ok).toBe(true)
  })
})

describe('B9: опции команд раздела 1 вне сверенного списка — отказ, заведомо несуществующие — ошибка git', () => {
  // git 2.53.0 принимает все эти формы (git <команда> <опция>).
  const accepted: Record<string, string[]> = {
    add: ['--no-chmod', '--no-dry-run', '--no-edit', '--no-force', '--no-ignore-errors', '--no-ignore-missing', '--no-ignore-removal', '--no-intent-to-add', '--no-interactive', '--no-patch', '--no-pathspec-file-nul', '--no-pathspec-from-file', '--no-refresh', '--no-renormalize', '--no-sparse', '--no-update', '--no-verbose'],
    commit: ['--ahead-behind', '--interactive', '--no-ahead-behind', '--no-all', '--no-amend', '--no-author', '--no-branch', '--no-cleanup', '--no-date', '--no-dry-run', '--no-file', '--no-fixup', '--no-include', '--no-interactive', '--no-long', '--no-message', '--no-null', '--no-only', '--no-patch', '--no-pathspec-file-nul', '--no-pathspec-from-file', '--no-porcelain', '--no-quiet', '--no-reedit-message', '--no-reset-author', '--no-reuse-message', '--no-short', '--no-squash', '--no-template', '--no-untracked-files', '--no-verbose', '--post-rewrite'],
    status: ['--no-ahead-behind', '--no-branch', '--no-column', '--no-ignore-submodules', '--no-ignored', '--no-long', '--no-null', '--no-porcelain', '--no-short', '--no-show-stash', '--no-untracked-files', '--no-verbose'],
  }

  for (const [cmd, flags] of Object.entries(accepted)) {
    it(`git ${cmd}: ${flags.length} принимаемых git опций дают отказ`, () => {
      for (const f of flags) expectRefusal(ready(), `git ${cmd} ${f}`)
    })
  }

  it('заведомо несуществующие остаются ошибкой git', () => {
    expect(runCommand(ready(), 'git add -x').result?.output).toBe("error: unknown switch `x'")
    expect(runCommand(ready(), 'git add --bogus').result?.output).toBe("error: unknown option `bogus'")
    expect(runCommand(ready(), 'git status -Z9').result?.output).toBe("error: unknown switch `Z'")
    expect(runCommand(ready(), 'git status --no-bogus').result?.output).toBe("error: unknown option `no-bogus'")
    expect(runCommand(ready(), 'git commit --bogus').result?.output).toBe("error: unknown option `bogus'")
  })
})
