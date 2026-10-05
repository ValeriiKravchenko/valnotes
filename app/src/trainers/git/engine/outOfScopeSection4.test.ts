// ============================================================
// Раздел 4: формы, которые настоящий git принимает, а раздел 4 не разбирает, получают отказ с
// TRAINER_MARKER; настоящие ошибки git остаются. Для reset/revert отказ не двигает HEAD и не
// создаёт коммитов. Формы и ответы сверены на git 2.53.0 (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createUndoSection, getUndoMissions, runUndoCommand } from './undoSection'
import type { UndoState } from './undoTypes'
import { ru } from '../locales/ru'

const MARKER = '[тренажёр]'

function baseState(): UndoState {
  return createUndoSection({ commits: ru.undo.seed.commits })
}

function out(line: string): string {
  return runUndoCommand(baseState(), line).result?.output ?? ''
}

function expectRefusal(line: string) {
  const state = baseState()
  const snapshot = (s: UndoState) => JSON.stringify({ ...s, history: [] })
  const missions = (s: UndoState) => JSON.stringify(getUndoMissions(s))
  const { state: next, result } = runUndoCommand(state, line)
  expect(result?.ok, line).toBe(false)
  expect(result?.output.startsWith(MARKER), line).toBe(true)
  expect(result?.output, line).not.toMatch(/^(fatal|error|usage):/)
  expect(next.head, line).toBe(state.head)
  expect(next.branches, line).toEqual(state.branches)
  expect(Object.keys(next.commits), line).toEqual(Object.keys(state.commits))
  expect(snapshot(next), line).toBe(snapshot(state))
  expect(missions(next), line).toBe(missions(state))
}

describe('git reset: ссылки и пути вне грамматики раздела 4 — отказ', () => {
  it('HEAD^, HEAD~~, ветка~N, HEAD@{N} (включая HEAD@{0}) со всеми режимами', () => {
    for (const mode of ['', '--soft ', '--mixed ', '--hard ']) {
      for (const ref of ['HEAD^', 'HEAD~~', 'master~1', 'HEAD@{0}', 'HEAD@{1}', 'HEAD~1^']) {
        expectRefusal(`git reset ${mode}${ref}`)
      }
    }
  })

  it('./файл, ../x, глоб и магия pathspec — отказ', () => {
    for (const line of ['git reset ./style.css', 'git reset HEAD ../x', "git reset -- '*.css'", "git reset ':(glob)*.css'", 'git reset -- ./style.css']) {
      expectRefusal(line)
    }
  })

  it('обратный набор: настоящие ошибки и рабочие формы остаются', () => {
    expect(out('git reset nosuch')).toContain("ambiguous argument 'nosuch'")
    expect(out('git reset --hard HEAD~3')).toContain("ambiguous argument 'HEAD~3'")
    expect(runUndoCommand(baseState(), 'git reset --soft HEAD~1').result?.ok).toBe(true)
    expect(runUndoCommand(baseState(), 'git reset --hard HEAD~1').result?.ok).toBe(true)
    expect(runUndoCommand(baseState(), 'git reset HEAD style.css').result?.ok).toBe(true)
  })
})

describe('git reset: опции (B9)', () => {
  const accepted = [
    '--intent-to-add', '--inter-hunk-context', '--no-intent-to-add', '--no-patch', '--no-pathspec-file-nul', '--no-pathspec-from-file',
    '--no-quiet', '--no-recurse-submodules', '--no-refresh', '--patch', '--pathspec-file-nul', '--pathspec-from-file',
    '--recurse-submodules', '--refresh', '--unified', '-N', '-U', '-p',
  ]

  it('все 18 принимаемых git опций, не разбираемых разделом, — отказ', () => {
    for (const f of accepted) expectRefusal(`git reset ${f}`)
  })

  it('заведомо несуществующие остаются ошибкой git с usage', () => {
    for (const f of ['--bogus', '-Z9', '-x']) {
      const o = out(`git reset ${f}`)
      expect(o, f).toMatch(/^error: unknown (option|switch)/)
      expect(o, f).toContain('usage: git reset')
    }
  })
})

describe('git revert: ссылки', () => {
  it('master~1, HEAD~~, HEAD^, HEAD@{0} — отказ, коммит не создаётся', () => {
    for (const ref of ['master~1', 'HEAD~~', 'HEAD^', 'HEAD@{0}']) expectRefusal(`git revert ${ref}`)
  })

  it('обратный набор: настоящие ошибки и рабочие формы остаются', () => {
    expect(out('git revert nosuch')).toBe("fatal: bad revision 'nosuch'")
    expect(runUndoCommand(baseState(), 'git revert --no-edit HEAD').result?.ok).toBe(true)
  })
})

describe('git revert: флаги (B10)', () => {
  const accepted = [
    '--cleanup', '--commit', '--edit', '--gpg-sign', '--no-cleanup', '--no-gpg-sign', '--no-mainline', '--no-reference',
    '--no-rerere-autoupdate', '--no-signoff', '--no-strategy', '--no-strategy-option', '--reference', '--rerere-autoupdate',
    '--signoff', '--strategy', '--strategy-option', '-S', '-X', '-e', '-s',
  ]

  it('все 21 принимаемый git флаг вместе с коммитом — отказ, а не usage', () => {
    for (const f of accepted) expectRefusal(`git revert ${f} HEAD`)
  })

  it('значение флага и коммит: -X ours HEAD, --strategy ort HEAD — отказ', () => {
    expectRefusal('git revert -X ours HEAD')
    expectRefusal('git revert --strategy ort HEAD')
  })

  it('без коммита usage остаётся, как у git', () => {
    for (const f of ['-e', '-s', '--signoff', '--bogus']) {
      expect(out(`git revert ${f}`), f).toContain('usage: git revert')
    }
  })

  it('заведомо несуществующий флаг с коммитом — usage, как у git', () => {
    expect(out('git revert --bogus HEAD')).toContain('usage: git revert')
  })
})

describe('git log (#9, #10)', () => {
  it('log -n 1 и log -- style.css — отказ, а не unknown switch', () => {
    for (const line of ['git log -n 1 --oneline', 'git log -n 1', 'git log -- style.css', 'git log --oneline -- style.css', 'git log -- nosuch.css']) {
      expectRefusal(line)
    }
  })

  it('несуществующая опция — текст git; обратный набор', () => {
    expect(out('git log --one')).toBe('fatal: unrecognized argument: --one')
    expect(runUndoCommand(baseState(), 'git log --oneline').result?.ok).toBe(true)
  })
})

describe('git add и git branch', () => {
  it('add: ./файл, ../x, глоб, магия pathspec — отказ', () => {
    for (const line of ['git add ./style.css', 'git add ../x', "git add '*.css'", "git add ':(glob)*.css'", 'git add -- ./style.css']) {
      expectRefusal(line)
    }
  })

  it('add: обратный набор', () => {
    expect(out('git add nosuch')).toBe("fatal: pathspec 'nosuch' did not match any files")
    expect(runUndoCommand(baseState(), 'git add style.css').result?.ok).toBe(true)
  })

  it('branch <имя> <ревизия вне грамматики> — отказ', () => {
    for (const line of ['git branch rescue HEAD^', 'git branch x master~1', 'git branch x HEAD@{1}']) expectRefusal(line)
  })

  it('branch: обратный набор', () => {
    expect(out('git branch x nosuch')).toBe("fatal: not a valid object name: 'nosuch'")
    expect(runUndoCommand(baseState(), 'git branch x HEAD~1').result?.ok).toBe(true)
  })
})

describe('B9: опции add/commit/status — списки исчерпывающие', () => {
  it('несуществующие остаются ошибкой git', () => {
    expect(out('git add -x')).toBe("error: unknown switch `x'")
    expect(out('git status --bogus')).toBe("error: unknown option `bogus'")
  })
})

// ---------- строка шелла вне модели: честный отказ, а не выдуманная ошибка git ----------

describe('конструкции bash, которые тренажёр разбирает не так, как bash, — отказ', () => {
  const refuse = (l: string) => {
    expectRefusal(l)
    return out(l)
  }
  const X = 'git log'

  it('git reset --hard;git log и git reset --soft\\ HEAD — отказ по оператору и по обратной косой', () => {
    expect(refuse('git reset --hard;git log')).toBe(ru.errors.shellOperatorUnsupported(';'))
    expect(refuse(`git reset --soft\\ HEAD`)).toBe(ru.errors.shellBackslashUnsupported)
  })

  it('операторы ; && || | & > < ( ) вне кавычек', () => {
    const cases: Array<[string, string]> = [
      [`${X};git status`, ';'],
      [`${X} && git status`, '&&'],
      [`${X} || git status`, '||'],
      [`${X} | cat`, '|'],
      [`${X} & `, '&'],
      [`${X} > out.txt`, '>'],
      [`${X} < in.txt`, '<'],
      [`${X} (a)`, '('],
    ]
    for (const [line, op] of cases) expect(refuse(line), line).toBe(ru.errors.shellOperatorUnsupported(op))
  })

  it('обратная косая вне кавычек', () => {
    for (const line of [`${X} a\\ b`, `${X} a\\+`, `${X} \\"a`]) {
      expect(refuse(line), line).toBe(ru.errors.shellBackslashUnsupported)
    }
  })

  it('подстановки: $имя, $(…), ~, фигурные скобки, комментарий, а также $ внутри двойных кавычек', () => {
    const cases: Array<[string, string]> = [
      [`${X} $HOME`, '$HOME'],
      [`${X} $(echo`, '$(echo'],
      [`${X} ~`, '~'],
      [`${X} ~/x`, '~/x'],
      [`${X} {a,b}`, '{a,b}'],
      [`${X} #c`, '#'],
      [`${X} "$HOME"`, '$HOME"'],
    ]
    for (const [line, fragment] of cases) expect(refuse(line), line).toBe(ru.errors.shellExpansionUnsupported(fragment))
  })

  it('кавычки: незакрытая — отказ; косая перед \\, " и $ внутри двойных — отказ', () => {
    expect(refuse(`${X} "a`)).toBe(ru.errors.shellQuoteUnclosed)
    expect(refuse(`${X} 'a`)).toBe(ru.errors.shellQuoteUnclosed)
    expect(refuse(`${X} "a\\\\b"`)).toBe(ru.errors.shellQuotedEscapeUnsupported('\\\\'))
    expect(refuse(`${X} "a\\"b"`)).toBe(ru.errors.shellQuotedEscapeUnsupported('\\"'))
    expect(refuse(`${X} "\\$a"`)).toBe(ru.errors.shellQuotedEscapeUnsupported('\\$'))
  })

  it('маски ? и […] без кавычек — отказ шелла, как и *', () => {
    for (const mask of ['?.txt', '[ab].txt', 'a*']) {
      expect(refuse(`${X} ${mask}`), mask).toBe(ru.errors.shellGlobUnsupported(mask))
    }
  })
})
