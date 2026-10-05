import { describe, expect, it } from 'vitest'
import { findShellRefusal, shellRefusalText, shellTokenize, shellWords } from './shell'
import { ru } from '../locales/ru'

describe('shell.ts — этап 1 разбора командной строки (target.md, «Граница: где шелл, а где git»)', () => {
  it('пробелы разделяют слова, лишние пробелы схлопываются', () => {
    expect(shellWords('git   status  -s', [])).toEqual(['git', 'status', '-s'])
  })

  it('прямые кавычки " и \' защищают пробелы внутри слова и снимаются с результата', () => {
    expect(shellWords('git commit -m "два слова"', [])).toEqual(['git', 'commit', '-m', 'два слова'])
    expect(shellWords("git commit -m 'два слова'", [])).toEqual(['git', 'commit', '-m', 'два слова'])
  })

  it('target.md, A7: типографские кавычки “ ” „ « » — обычные символы, не кавычки: пробел внутри их не защищает', () => {
    // “текст два” без прямых кавычек — три отдельных слова, curly-символы остаются частью текста.
    const words = shellWords('git commit -m “текст два”', [])
    expect(words).toEqual(['git', 'commit', '-m', '“текст', 'два”'])
  })

  it('target.md, A7: без пробела внутри типографские кавычки — обычная часть одного слова', () => {
    expect(shellWords('git commit -m “слово”', [])).toEqual(['git', 'commit', '-m', '“слово”'])
  })

  it('target.md, A6: значение может быть приклеено к флагу в одном слове — кавычки снимаются, флаг и значение остаются одним токеном', () => {
    expect(shellWords('git commit -m"текст"', [])).toEqual(['git', 'commit', '-mтекст'])
  })

  it('квоты можно клеить подряд внутри одного слова (общее следствие модели, не только для -m)', () => {
    expect(shellWords(`'a'"b"c`, [])).toEqual(['abc'])
  })

  it('незакрытая кавычка не бросает исключение — тренажёр берёт всё до конца строки', () => {
    expect(() => shellWords('git commit -m "не закрыл', [])).not.toThrow()
    expect(shellWords('git commit -m "не закрыл', [])).toEqual(['git', 'commit', '-m', 'не закрыл'])
  })

  it('quoted-флаг у shellTokenize: слово в кавычках помечено quoted=true, обычное — false', () => {
    const tokens = shellTokenize('git commit -m "текст" nosuch', [])
    expect(tokens.map((t) => ({ text: t.text, quoted: t.quoted }))).toEqual([
      { text: 'git', quoted: false },
      { text: 'commit', quoted: false },
      { text: '-m', quoted: false },
      { text: 'текст', quoted: true },
      { text: 'nosuch', quoted: false },
    ])
  })

  describe('target.md, A4 — раскрытие "*"', () => {
    it('"*" целиком незакавыченным словом раскрывается в список файлов рабочего дерева по алфавиту', () => {
      expect(shellWords('git add *', ['b.txt', 'a.txt'])).toEqual(['git', 'add', 'a.txt', 'b.txt'])
    })

    it('скрытые файлы (начинаются с точки) "*" не подхватывает', () => {
      expect(shellWords('git add *', ['a.txt', '.env'])).toEqual(['git', 'add', 'a.txt'])
    })

    it('нет ни одного файла — git получает литеральную строку "*"', () => {
      expect(shellWords('git add *', [])).toEqual(['git', 'add', '*'])
      expect(shellWords('git add *', ['.only-hidden'])).toEqual(['git', 'add', '*'])
    })

    it('закавыченная "*" не раскрывается — это просто буква', () => {
      expect(shellWords('git commit -m "*"', ['a.txt'])).toEqual(['git', 'commit', '-m', '*'])
    })

    it('"*", приклеенная к другому тексту (не голая), не раскрывается — задокументированное упрощение', () => {
      // Настоящий bash раскрыл бы и "a*", у тренажёра раскрывается только "*" целиком словом.
      expect(shellWords('git add a*', ['abc.txt'])).toEqual(['git', 'add', 'a*'])
    })

    it('target.md, часть III, правило 1: маска вроде "*.html" помечена unsupportedGlob, текст не меняется', () => {
      const tokens = shellTokenize('git add *.html', ['index.html'])
      const arg = tokens[2]
      expect(arg.text).toBe('*.html')
      expect(arg.unsupportedGlob).toBe(true)
    })

    it('маска в начале слова ("a*") тоже помечена unsupportedGlob', () => {
      const tokens = shellTokenize('git add a*', ['abc.txt'])
      expect(tokens[2].unsupportedGlob).toBe(true)
    })

    it('закавыченная маска ("*.html" в кавычках) — обычный текст, unsupportedGlob не ставится', () => {
      const tokens = shellTokenize('git add "*.html"', ['index.html'])
      expect(tokens[2].text).toBe('*.html')
      expect(tokens[2].unsupportedGlob).toBeFalsy()
    })

    it('"?" и класс "[…]" без кавычек — тоже unsupportedGlob: bash раскрыл бы их по файлам', () => {
      expect(shellTokenize('git add ?.txt', ['a.txt'])[2].unsupportedGlob).toBe(true)
      expect(shellTokenize('git add a?txt', ['a.txt'])[2].unsupportedGlob).toBe(true)
      expect(shellTokenize('git add [ab].txt', ['a.txt'])[2].unsupportedGlob).toBe(true)
    })

    it('"?" и "[" в кавычках — обычный текст; одиночная "[" без закрывающей "]" bash не раскрывает', () => {
      expect(shellTokenize('git add "?.txt"', [])[2].unsupportedGlob).toBeFalsy()
      expect(shellTokenize("git add '[ab].txt'", [])[2].unsupportedGlob).toBeFalsy()
      expect(shellTokenize('git add a[', [])[2].unsupportedGlob).toBeFalsy()
    })

    it('маска, у которой незакавыченная часть содержит "*", помечена, даже если рядом есть кавычки (bash раскроет и такое слово)', () => {
      expect(shellTokenize('git add *"x"', ['ax'])[2].unsupportedGlob).toBe(true)
      expect(shellTokenize('git add x?"y"', ['xay'])[2].unsupportedGlob).toBe(true)
    })

    it('голая "*" (раскрывается) не помечается unsupportedGlob', () => {
      const tokens = shellTokenize('git add *', ['b.txt', 'a.txt'])
      tokens.slice(2).forEach((t) => expect(t.unsupportedGlob).toBeFalsy())
    })
  })
})

// Таблицы ниже сверены с bash (printf '[%s]', каталог mktemp -d, подменённый HOME): что bash
// обрабатывает сам и тренажёр не повторяет — отказ; что совпадает — проходит как есть.
describe('findShellRefusal — конструкции, которые bash разбирает сам', () => {
  const refused: Array<[string, string, string]> = [
    ['git init;git status', 'operator', ';'],
    ['git a && b', 'operator', '&&'],
    ['git a || b', 'operator', '||'],
    ['git a | b', 'operator', '|'],
    ['git a & b', 'operator', '&'],
    ['git a > f', 'operator', '>'],
    ['git a >> f', 'operator', '>>'],
    ['git a < f', 'operator', '<'],
    ['git a (b)', 'operator', '('],
    ['git a $HOME', 'expansion', '$HOME'],
    ['git a ${HOME}', 'expansion', '${HOME}'],
    ['git a $(echo hi)', 'expansion', '$(echo'],
    ['git a `echo`', 'expansion', '`echo`'],
    ["git a $'x'", 'expansion', "$'x'"],
    ['git a ~', 'expansion', '~'],
    ['git a ~/x', 'expansion', '~/x'],
    ['git a {1,2}', 'expansion', '{1,2}'],
    ['git a {1..3}', 'expansion', '{1..3}'],
    ['git a #c', 'expansion', '#'],
    ['git a "$HOME"', 'expansion', '$HOME"'],
    ['git a "${HOME}"', 'expansion', '${HOME}"'],
    ['git a "$(echo hi)"', 'expansion', '$(echo'],
    ['git a "`x`"', 'expansion', '`x`"'],
    ['git a "\\\\"', 'quotedEscape', '\\\\'],
    ['git a "b\\"c"', 'quotedEscape', '\\"'],
    ['git a "\\$x"', 'quotedEscape', '\\$'],
    ['git a "\\`x"', 'quotedEscape', '\\`'],
  ]
  for (const [line, kind, fragment] of refused) {
    it(`${line} → ${kind}`, () => {
      const r = findShellRefusal(line)
      expect(r?.kind).toBe(kind)
      if (r && 'fragment' in r) expect(r.fragment).toBe(fragment)
    })
  }

  it('обратная косая вне кавычек — отказ в любом положении (bash снимает её и склеивает слово)', () => {
    for (const line of ['git commit -m Первый\\ коммит', 'git grep x\\+', 'git a \\"b', 'git a x\\\\y', 'git a a\\;b', 'git a a\\']) {
      expect(findShellRefusal(line)?.kind, line).toBe('backslash')
    }
  })

  it('незакрытая кавычка — отказ', () => {
    expect(findShellRefusal('git commit -m "не закрыл')?.kind).toBe('unclosedQuote')
    expect(findShellRefusal("git commit -m 'не закрыл")?.kind).toBe('unclosedQuote')
  })

  it('первой отказывает конструкция, которая стоит левее', () => {
    expect(findShellRefusal('git a\\ b;c')?.kind).toBe('backslash')
    expect(findShellRefusal('git a;b\\ c')?.kind).toBe('operator')
  })

  const passed = [
    'git commit -m "два слова"',
    "git commit -m 'два слова'",
    "git a 'b\\c' 'it'\"'\"'s'",
    'git a "b\\c"',
    'git add "\\*.txt"',
    'git a "\\*" "\\|" "\\n" "\\!"',
    'git a "$" "$ x" "x$"',
    "git a '$HOME' '$(x)' ';' '|' '>' '\\'",
    'git a "a;b" "a|b" "(x)" "a && b"',
    'git a "" \'\' -m""',
    'git a HEAD~2 HEAD^ HEAD@{1} HEAD~2..HEAD x~ ~x x#c',
    'git a {1} a{b',
    'git a b=c !x',
    'git a "*" "?" "[ab]"',
    'git a *',
  ]
  for (const line of passed) {
    it(`проходит как есть: ${line}`, () => {
      expect(findShellRefusal(line)).toBeNull()
    })
  }
})

describe('shellRefusalText — тексты из словаря, с маркером тренажёра', () => {
  it('каждый вид отказа начинается с [тренажёр] и берётся из ru.errors', () => {
    const cases = [
      [findShellRefusal('git a;b'), ru.errors.shellOperatorUnsupported(';')],
      [findShellRefusal('git a\\ b'), ru.errors.shellBackslashUnsupported],
      [findShellRefusal('git a $HOME'), ru.errors.shellExpansionUnsupported('$HOME')],
      [findShellRefusal('git a "\\$x"'), ru.errors.shellQuotedEscapeUnsupported('\\$')],
      [findShellRefusal('git a "x'), ru.errors.shellQuoteUnclosed],
    ] as const
    for (const [refusal, expected] of cases) {
      expect(refusal).not.toBeNull()
      const text = shellRefusalText(refusal!)
      expect(text).toBe(expected)
      expect(text.startsWith('[тренажёр]')).toBe(true)
    }
  })
})
