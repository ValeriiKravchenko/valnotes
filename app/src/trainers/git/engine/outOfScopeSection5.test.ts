// ============================================================
// Раздел 5: формы, которые настоящий git принимает, а раздел 5 не разбирает, получают отказ с
// TRAINER_MARKER; настоящие ошибки git остаются. При отказе не меняются ни копия, ни сервер, ни
// миссии. Формы и ответы сверены на git 2.53.0 (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createRemoteSection, getRemoteMissions, runRemoteCommand } from './remoteSection'
import type { RemoteState } from './remoteTypes'
import { VERIFIED_SECTION5_OPTIONS } from './remoteScope'
import { ru } from '../locales/ru'

const MARKER = '[тренажёр]'

function baseState(): RemoteState {
  return createRemoteSection({ server: ru.remote.seed.server })
}

function clonedState(): RemoteState {
  return runRemoteCommand(baseState(), 'git clone origin local').state
}

function out(state: RemoteState, line: string): string {
  return runRemoteCommand(state, line).result?.output ?? ''
}

function expectRefusal(state: RemoteState, line: string) {
  const snapshot = (s: RemoteState) => JSON.stringify({ ...s, history: [] })
  const missions = (s: RemoteState) => JSON.stringify(getRemoteMissions(s))
  const { state: next, result } = runRemoteCommand(state, line)
  expect(result?.ok, line).toBe(false)
  expect(result?.output.startsWith(MARKER), line).toBe(true)
  expect(result?.output, line).not.toMatch(/^(fatal|error|usage):/)
  expect(JSON.stringify(next.server), line).toBe(JSON.stringify(state.server))
  expect(snapshot(next), line).toBe(snapshot(state))
  expect(missions(next), line).toBe(missions(state))
}

describe('адрес сервера как путь в clone, fetch, push, pull — отказ (B4)', () => {
  it('git clone /team/origin local и другие пути (#13)', () => {
    for (const repo of ['/team/origin', './origin', 'origin/', '../team/origin', '/tmp/zzz']) {
      expectRefusal(baseState(), `git clone ${repo} local`)
    }
  })

  it('fetch, push, pull с путём сервера (#24)', () => {
    for (const line of ['git fetch /team/origin', 'git push /team/origin master', 'git pull /team/origin master', 'git fetch ./origin', 'git pull ../team/origin']) {
      expectRefusal(clonedState(), line)
    }
  })

  it('обратный набор: именованный origin работает, настоящие ошибки остаются', () => {
    expect(runRemoteCommand(baseState(), 'git clone origin local').result?.ok).toBe(true)
    expect(out(baseState(), 'git clone nosuch local')).toBe("fatal: repository 'nosuch' does not exist")
    expect(out(clonedState(), 'git clone origin local')).toBe("fatal: repository 'origin' does not exist")
    expect(out(clonedState(), 'git fetch nosuch')).toContain("'nosuch' does not appear to be a git repository")
    expect(out(clonedState(), 'git push nosuch master')).toContain("'nosuch' does not appear to be a git repository")
    expect(out(clonedState(), 'git pull nosuch master')).toContain("'nosuch' does not appear to be a git repository")
    expect(runRemoteCommand(clonedState(), 'git fetch origin').result?.ok).toBe(true)
  })
})

describe('git push: refspec — отказ', () => {
  it('<src>:<dst>, HEAD:other, :ветка, +ветка, refs/…, ревизии', () => {
    for (const ref of ['master:master', 'HEAD:other', ':master', ':other', '+master', 'refs/heads/master', 'HEAD~1', 'HEAD^']) {
      expectRefusal(clonedState(), `git push origin ${ref}`)
    }
  })

  it('обратный набор: настоящие ошибки и рабочие формы остаются', () => {
    const s = clonedState()
    expect(out(s, 'git push origin nosuch')).toContain('error: src refspec nosuch does not match any')
    expect(out(s, 'git push origin master extra')).toContain('error: src refspec extra does not match any')
  })

  it('git pull origin a:b — отказ', () => {
    expectRefusal(clonedState(), 'git pull origin master:master')
  })
})

describe('git remote', () => {
  it('remote -v -v и --verbose -v — отказ', () => {
    expectRefusal(clonedState(), 'git remote -v -v')
    expectRefusal(clonedState(), 'git remote -v --verbose')
  })

  it('remote -v origin — настоящая ошибка git (unknown subcommand), код 129', () => {
    const { result } = runRemoteCommand(clonedState(), 'git remote -v origin')
    expect(result?.output.startsWith("error: unknown subcommand: `origin'")).toBe(true)
    expect(result?.exitCode).toBe(129)
  })

  it('remote --no-verbose — отказ; remote -x остаётся ошибкой git', () => {
    expectRefusal(clonedState(), 'git remote --no-verbose')
    expect(out(clonedState(), 'git remote -x')).toContain("error: unknown switch `x'")
  })

  it('обратный набор: remote и remote -v работают', () => {
    expect(out(clonedState(), 'git remote')).toBe('origin')
    expect(out(clonedState(), 'git remote -v')).toContain('(fetch)')
  })
})

describe('git branch, git add', () => {
  it('branch <имя> origin/master, HEAD~1, HEAD^, HEAD@{1} — отказ', () => {
    for (const line of ['git branch x origin/master', 'git branch y HEAD~1', 'git branch z HEAD^', 'git branch w HEAD@{1}']) {
      expectRefusal(clonedState(), line)
    }
  })

  it('branch: обратный набор', () => {
    expect(out(clonedState(), 'git branch x nosuch')).toBe("fatal: not a valid object name: 'nosuch'")
    expect(runRemoteCommand(clonedState(), 'git branch x HEAD').result?.ok).toBe(true)
  })

  it('add: ./файл, ../x, глоб, магия pathspec — отказ', () => {
    for (const line of ['git add ./README.md', 'git add ../x', "git add 'RE*'", "git add ':(glob)*.md'", 'git add -- ./README.md']) {
      expectRefusal(clonedState(), line)
    }
  })

  it('add: обратный набор', () => {
    expect(out(clonedState(), 'git add nosuch')).toBe("fatal: pathspec 'nosuch' did not match any files")
    expect(runRemoteCommand(clonedState(), 'git add README.md').result?.ok).toBe(true)
  })
})

describe('B9: опции clone, fetch, push, pull, remote', () => {
  const skip = new Set(['-h', '--help', '-u', '--set-upstream', '-f', '--force', '--no-rebase', '--ff-only', '-v', '--verbose'])

  for (const cmd of ['clone', 'fetch', 'push', 'pull', 'remote'] as const) {
    it(`git ${cmd}: ни одна сверенная опция не даёт поддельного unknown`, () => {
      for (const opt of VERIFIED_SECTION5_OPTIONS[cmd]) {
        if (skip.has(opt)) continue
        const state = cmd === 'clone' ? baseState() : clonedState()
        const o = out(state, `git ${cmd} ${opt}`)
        expect(o, `git ${cmd} ${opt}`).not.toMatch(/unknown (option|switch)/)
      }
    })
  }

  it('принимаемые git опции дают отказ с маркером', () => {
    for (const line of ['git clone --quiet origin local', 'git fetch -q', 'git push --no-verify', 'git pull --stat', 'git pull -q']) {
      expectRefusal(line.startsWith('git clone') ? baseState() : clonedState(), line)
    }
  })

  it('заведомо несуществующие остаются ошибкой git с usage и кодом 129', () => {
    for (const line of ['git clone -x origin local', 'git fetch -x', 'git push -x', 'git pull -x', 'git push --bogus', 'git fetch -Z9']) {
      const state = line.startsWith('git clone') ? baseState() : clonedState()
      const { result } = runRemoteCommand(state, line)
      expect(result?.output, line).toMatch(/^error: unknown (option|switch)/)
      expect(result?.exitCode, line).toBe(129)
    }
  })
})
