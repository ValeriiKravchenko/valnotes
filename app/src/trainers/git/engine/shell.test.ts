import { describe, expect, it } from 'vitest'
import { shellTokenize, shellWords } from './shell'

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

    it('голая "*" (раскрывается) не помечается unsupportedGlob', () => {
      const tokens = shellTokenize('git add *', ['b.txt', 'a.txt'])
      tokens.slice(2).forEach((t) => expect(t.unsupportedGlob).toBeFalsy())
    })
  })
})
