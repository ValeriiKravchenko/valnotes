// ============================================================
// Раздел 3: формы, которые настоящий git принимает, а раздел 3 не разбирает, получают отказ с
// TRAINER_MARKER; заведомо несуществующие опции — текст настоящего git; настоящие ошибки git
// остаются. Формы и ответы сверены на git 2.53.0 (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createInspectSection, getInspectMissions, runInspectCommand } from './inspectSection'
import type { InspectState } from './inspectTypes'
import { VERIFIED_SECTION3_OPTIONS } from './inspectScope'

import { ru } from '../locales/ru'

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

  // Склеенные короткие флаги: git называет в ошибке одну букву, а не весь хвост.
  // Все случаи сверены песочницей git 2.53.0, 08.10.2026 (код выхода у всех unknown switch — 129).
  it('status: unknown switch называет первую неизвестную букву, хвост не читается', () => {
    expect(out('git status -Z9')).toBe("error: unknown switch `Z'")
    expect(out('git status -Zs')).toBe("error: unknown switch `Z'")
    expect(out('git status -ZZ')).toBe("error: unknown switch `Z'")
    expect(out('git status -sZ')).toBe("error: unknown switch `Z'")
    expect(out('git status -sbZ')).toBe("error: unknown switch `Z'")
    expect(out('git status -vZ')).toBe("error: unknown switch `Z'")
    expect(out('git status -zZ')).toBe("error: unknown switch `Z'")
    expect(out('git status -bZ')).toBe("error: unknown switch `Z'")
    expect(out('git status -sZ9')).toBe("error: unknown switch `Z'")
  })

  it('status: цифра и знаки тоже буквы-виновники; одиночная -9 — не сокращение лимита', () => {
    expect(out('git status -s9')).toBe("error: unknown switch `9'")
    expect(out('git status -9')).toBe("error: unknown switch `9'")
    expect(out('git status -s=')).toBe("error: unknown switch `='")
    expect(out('git status -s=Z')).toBe("error: unknown switch `='")
    expect(out('git status -s.Z')).toBe("error: unknown switch `.'")
    expect(out('git status -Z-')).toBe("error: unknown switch `Z'")
  })

  it('status: знак "-" после буквы без значения — хвост читается как имя длинной опции', () => {
    expect(out('git status -s-x')).toBe("error: unknown option `x'")
    expect(out('git status -s--')).toBe("error: unknown option `-'")
    expect(out('git status -s--short')).toBe("error: unknown option `-short'")
    expect(out('git status -s-short')).toBe("error: unknown option `short'")
    expect(out('git status -s-x=1')).toBe("error: unknown option `x=1'")
    expect(out('git status -b-')).toBe("error: unknown option `'")
  })

  it('status: после -u, -M, -h хвост — значение или справка, виноватой буквы нет: отказ области, а не unknown switch', () => {
    for (const line of ['git status -uZ', 'git status -uallZ', 'git status -MZ', 'git status -M5Z', 'git status -sMZ', 'git status -hZ']) {
      expectRefusal(line)
    }
  })

  it('status: ошибка в отдельном токене не зависит от соседних', () => {
    expect(out('git status -s -Z9')).toBe("error: unknown switch `Z'")
  })

  it('log/show/diff: первая буква неизвестна — git называет весь токен (-Z9 → -Z9)', () => {
    expect(out('git log -Z9')).toBe('fatal: unrecognized argument: -Z9')
    expect(out('git show -Z9')).toBe('fatal: unrecognized argument: -Z9')
    expect(out('git diff -Z9').split('\n')[0]).toBe('error: invalid option: -Z9')
  })

  it('log/show/diff: «известная буква + неизвестная» (-pZ, -sZ) — отказ области; у git там "-Z", но список этих команд неисчерпывающий', () => {
    for (const line of ['git log -pZ', 'git show -pZ', 'git show -sZ', 'git diff -pZ', 'git log -Zp']) expectRefusal(line)
  })

  it('обратный набор: опции в области работают', () => {
    expect(runInspectCommand(baseState(), 'git log --oneline').result?.ok).toBe(true)
    expect(runInspectCommand(baseState(), 'git status -s').result?.ok).toBe(true)
  })
})

// ---------- строка шелла вне модели: честный отказ, а не выдуманная ошибка git ----------

describe('конструкции bash, которые тренажёр разбирает не так, как bash, — отказ', () => {
  const refuse = (l: string) => {
    expectRefusal(l)
    return out(l)
  }
  const X = 'git log'

  it('git log;git status и git log\\ --oneline — отказ по оператору и по обратной косой', () => {
    expect(refuse('git log;git status')).toBe(ru.errors.shellOperatorUnsupported(';'))
    expect(refuse(`git log\\ --oneline`)).toBe(ru.errors.shellBackslashUnsupported)
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
