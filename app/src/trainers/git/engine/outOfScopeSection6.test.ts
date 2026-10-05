// ============================================================
// Раздел 6, шаг A: формы, которые настоящий git принимает, а раздел 6 не разбирает, получают отказ
// с TRAINER_MARKER; настоящие ошибки git остаются. При отказе не меняются состояние и миссии.
// Порядок файлов при поиске — по байтам UTF-8 имени. Формы, ответы и порядок сверены на git 2.53.0
// (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createSearchSection, getSearchMissions, runSearchCommand } from './searchSection'
import type { SearchState } from './searchTypes'
import { compareBytes } from './searchGrep'
import { ru } from '../locales/ru'

const MARKER = '[тренажёр]'

function baseState(): SearchState {
  return createSearchSection({ commits: ru.searching.seed.commits })
}

function out(line: string, state = baseState()): string {
  return runSearchCommand(state, line).result?.output ?? ''
}

function expectRefusal(line: string) {
  const state = baseState()
  const snapshot = (s: SearchState) => JSON.stringify({ ...s, history: [] })
  const missions = (s: SearchState) => JSON.stringify(getSearchMissions(s))
  const { state: next, result } = runSearchCommand(state, line)
  expect(result?.ok, line).toBe(false)
  expect(result?.output.startsWith(MARKER), line).toBe(true)
  expect(result?.output, line).not.toMatch(/^(fatal|error|usage):/)
  expect(snapshot(next), line).toBe(snapshot(state))
  expect(missions(next), line).toBe(missions(state))
}

describe('git blame: формы, которые git принимает, — отказ', () => {
  it('ревизия перед файлом, повтор -L, слитное -L5,5, HEAD@{N} перед файлом', () => {
    for (const line of [
      'git blame HEAD app.js',
      'git blame HEAD~1 app.js',
      'git blame master app.js',
      'git blame HEAD@{1} app.js',
      'git blame -L 2 -L 5 app.js',
      'git blame -L5,5 app.js',
      'git blame ./app.js',
    ]) {
      expectRefusal(line)
    }
  })

  it('обратный набор: настоящие ошибки и рабочие формы остаются', () => {
    expect(out('git blame app.js utils.js')).toBe("fatal: bad revision 'app.js'")
    expect(out('git blame nosuch.js')).toBe("fatal: no such path 'nosuch.js' in HEAD")
    expect(out('git blame -Z9 app.js')).toContain("error: unknown option `-Z9'")
    expect(runSearchCommand(baseState(), 'git blame app.js').result?.ok).toBe(true)
    expect(runSearchCommand(baseState(), 'git blame -L 5,5 app.js').result?.ok).toBe(true)
    expect(runSearchCommand(baseState(), 'git blame -s app.js').result?.ok).toBe(true)
  })

  it('принимаемые git опции: отрицание и однозначный префикс — отказ, а не unknown', () => {
    for (const line of ['git blame --no-progress app.js', 'git blame --porc app.js']) expectRefusal(line)
  })
})

describe('git log: ревизии — отказ, настоящие ошибки остаются', () => {
  it('master, HEAD~1, HEAD~1..HEAD, ..HEAD, HEAD.., HEAD@{N}', () => {
    for (const ref of ['master', 'HEAD~1', 'HEAD~1..HEAD', '..HEAD', 'HEAD..', 'HEAD@{1}', 'HEAD^2']) {
      expectRefusal(`git log ${ref}`)
      expectRefusal(`git log --oneline ${ref}`)
    }
  })

  it('обратный набор', () => {
    expect(out('git log a..b')).toContain("fatal: ambiguous argument 'a..b'")
    expect(out('git log nosuch.js')).toContain("fatal: ambiguous argument 'nosuch.js'")
    expect(out('git log HEAD~9')).toContain("fatal: ambiguous argument 'HEAD~9'")
    expect(runSearchCommand(baseState(), 'git log app.js').result?.ok).toBe(true)
    expect(runSearchCommand(baseState(), 'git log --oneline').result?.ok).toBe(true)
  })

  it('log -- app.js, -n 1 — отказ', () => {
    for (const line of ['git log -- app.js', 'git log -n 1', 'git log -1']) expectRefusal(line)
  })
})

describe('git show: ревизии вне разбора — отказ (#25)', () => {
  it('HEAD@{0}, HEAD@{1}, master:app.js, ./app.js', () => {
    for (const ref of ['HEAD@{0}', 'HEAD@{1}', 'master:app.js', 'HEAD:app.js', './app.js', '..HEAD']) expectRefusal(`git show ${ref}`)
  })

  it('обратный набор', () => {
    expect(out('git show nosuch')).toContain("fatal: ambiguous argument 'nosuch'")
    expect(runSearchCommand(baseState(), 'git show HEAD~1').result?.ok).toBe(true)
    expect(runSearchCommand(baseState(), 'git show').result?.ok).toBe(true)
  })
})

describe('git grep: ссылки, пути, опции', () => {
  it('ревизия вне разбора и формы путей — отказ', () => {
    for (const line of [
      'git grep debounce HEAD@{1}',
      'git grep debounce master:app.js',
      'git grep debounce ./utils.js',
      'git grep debounce -- ./utils.js',
      "git grep debounce -- '*.js'",
      "git grep debounce -- ':(glob)*.js'",
    ]) {
      expectRefusal(line)
    }
  })

  it('обратный набор: настоящие ошибки остаются', () => {
    expect(out('git grep -n export function')).toContain("fatal: ambiguous argument 'function'")
    expect(out('git grep -n x y')).toContain("fatal: ambiguous argument 'y'")
    expect(out('git grep -x debounce')).toContain("error: unknown switch `x'")
    expect(out('git grep -Z9 debounce')).toContain("error: unknown switch `Z'")
    expect(out('git grep --bogus debounce')).toContain("error: unknown option `bogus'")
    expect(runSearchCommand(baseState(), 'git grep -n debounce HEAD~1').result?.ok).toBe(true)
  })

  it('принимаемые git опции: отрицание и однозначный префикс — отказ; -NUM — отказ (это -C NUM)', () => {
    for (const line of ['git grep --no-quiet debounce', 'git grep --line-n debounce', 'git grep -3 debounce']) expectRefusal(line)
  })
})

describe('порядок файлов — по байтам UTF-8 имени (как у git)', () => {
  const names = ['B.js', 'a.js', 'app.js', 'utils.js', 'src/x.js', '1.js', '.hidden.js', 'a-b.js', 'a_b.js', 'ünï.js', 'ｚ.js', '😀.js', 'Z.js', 'a.JS']
  const expected = ['.hidden.js', '1.js', 'B.js', 'Z.js', 'a-b.js', 'a.JS', 'a.js', 'a_b.js', 'app.js', 'src/x.js', 'utils.js', 'ünï.js', 'ｚ.js', '😀.js']

  function stateWith(files: string[]): SearchState {
    const base = ru.searching.seed.commits[0]
    const tree: Record<string, string> = {}
    for (const f of files) tree[f] = 'needle'
    return createSearchSection({ commits: [{ ...base, tree }] })
  }

  it('compareBytes: символ вне BMP идёт после U+FF5A, как в UTF-8 (а sort() JS ставит его раньше)', () => {
    expect(compareBytes('ｚ.js', '😀.js')).toBeLessThan(0)
    expect([...names].sort()).not.toEqual([...names].sort(compareBytes))
    expect([...names].sort(compareBytes)).toEqual(expected)
  })

  it('grep без путей: порядок git', () => {
    const lines = out('git grep needle', stateWith(names)).split('\n')
    expect(lines.map((l) => l.split(':')[0])).toEqual(expected)
  })

  it('grep -- <пути>: порядок по байтам имени, а не по порядку аргументов; повторы и несуществующие отбрасываются', () => {
    const state = stateWith(names)
    expect(out('git grep -l needle -- utils.js B.js ｚ.js 😀.js', state)).toBe('B.js\nutils.js\nｚ.js\n😀.js')
    expect(out('git grep needle -- utils.js B.js', state)).toBe('B.js:needle\nutils.js:needle')
    expect(out('git grep needle -- a.js a.js', state)).toBe('a.js:needle')
    expect(out('git grep needle -- nosuch.js a.js', state)).toBe('a.js:needle')
    expect(out('git grep -c needle -- utils.js B.js', state)).toBe('B.js:1\nutils.js:1')
  })

  it('grep <шаблон> <ревизия> -- <пути>: порядок по байтам, префикс ревизии сохраняется', () => {
    const state = stateWith(names)
    expect(out('git grep needle HEAD -- utils.js B.js', state)).toBe('HEAD:B.js:needle\nHEAD:utils.js:needle')
  })
})

// ---------- строка шелла вне модели: честный отказ, а не выдуманная ошибка git ----------

describe('конструкции bash, которые тренажёр разбирает не так, как bash, — отказ', () => {
  const refuse = (l: string) => {
    expectRefusal(l)
    return out(l)
  }
  const X = 'git grep -n x'

  it('git grep -n x\\+ и git grep -n x;git status — отказ по оператору и по обратной косой', () => {
    expect(refuse(`git grep -n x\\+`)).toBe(ru.errors.shellBackslashUnsupported)
    expect(refuse('git grep -n x;git status')).toBe(ru.errors.shellOperatorUnsupported(';'))
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
