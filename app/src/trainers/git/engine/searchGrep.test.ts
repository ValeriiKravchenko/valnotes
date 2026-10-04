// ============================================================
// Раздел 6 git-тренажёра, шаг A: перевод BRE → JS RegExp и поиск по деревьям
// (searchGrep.ts). Все ожидания — буквально из
// docs/git-trainer/reports/section6-git-runs.txt (git 2.53.0, 26.09.2026,
// блоки GREP, Д1, Д12).
// ============================================================
import { describe, expect, it } from 'vitest'
import { compilePattern, escapeFixedString, grepTree, translateBrePattern } from './searchGrep'
import { ru } from '../locales/ru'

const HEAD_TREE = ru.searching.seed.commits[2].tree

function matchLines(pattern: string, opts: Partial<{ ignoreCase: boolean; fixedStrings: boolean; wordRegexp: boolean }> = {}) {
  const compiled = compilePattern(pattern, { ignoreCase: false, fixedStrings: false, wordRegexp: false, ...opts })
  if (!compiled.ok) throw new Error(`ожидался успешный разбор шаблона "${pattern}", получено: ${compiled.kind}`)
  return grepTree(HEAD_TREE, compiled.regex).map((m) => `${m.file}:${m.line}:${m.content}`)
}

describe('translateBrePattern — особые символы BRE (target.md, опасное место 2)', () => {
  it("'rend.r' — точка означает любой символ", () => {
    expect(matchLines('rend.r')).toEqual(['app.js:1:function renderCard(item) {'])
  })

  it("'item.' находит 3 строки, включая app.js:1 (после item идёт ')')", () => {
    expect(matchLines('item.')).toEqual([
      'app.js:1:function renderCard(item) {',
      'app.js:4:  el.textContent = item.title;',
      'app.js:5:  el.dataset.id = item.id;',
    ])
  })

  it("-F 'item.' — буквально, только строки с точкой после item", () => {
    expect(matchLines('item.', { fixedStrings: true })).toEqual(['app.js:4:  el.textContent = item.title;', 'app.js:5:  el.dataset.id = item.id;'])
  })

  it("'item\\\\.id', 'd\\\\.to' — \\. буквальная точка", () => {
    expect(matchLines('item\\.id')).toEqual(['app.js:5:  el.dataset.id = item.id;'])
    expect(matchLines('d\\.to')).toEqual(['utils.js:2:  return d.toLocaleDateString("ru-RU");'])
  })

  it("'deb*ounce' и 'debx*ounce' — '*' значит «ноль или больше предыдущего символа»", () => {
    const expected = ['README.md:4:TODO: добавить тесты для debounce.', 'utils.js:5:export function debounce(fn, delay) {']
    expect(matchLines('deb*ounce')).toEqual(expected)
    expect(matchLines('debx*ounce')).toEqual(expected)
  })

  it("'x\\\\+' — \\+ значит «один или больше»", () => {
    expect(matchLines('x\\+')).toEqual([
      'app.js:4:  el.textContent = item.title;',
      'utils.js:1:export function formatDate(d) {',
      'utils.js:5:export function debounce(fn, delay) {',
    ])
  })

  it("'de\\\\(b\\\\)ounce' — \\(…\\) группирует", () => {
    expect(matchLines('de\\(b\\)ounce')).toEqual([
      'README.md:4:TODO: добавить тесты для debounce.',
      'utils.js:5:export function debounce(fn, delay) {',
    ])
  })

  it("'renderCard\\\\|debounce' — \\| значит «или»", () => {
    expect(matchLines('renderCard\\|debounce')).toEqual([
      'README.md:4:TODO: добавить тесты для debounce.',
      'app.js:1:function renderCard(item) {',
      'utils.js:5:export function debounce(fn, delay) {',
    ])
  })

  it("'^export' находит utils.js:1 и utils.js:5", () => {
    expect(matchLines('^export')).toEqual(['utils.js:1:export function formatDate(d) {', 'utils.js:5:export function debounce(fn, delay) {'])
  })

  it("'{$' — '$' в конце шаблона — якорь конца строки", () => {
    expect(matchLines('{$')).toEqual([
      'app.js:1:function renderCard(item) {',
      'utils.js:1:export function formatDate(d) {',
      'utils.js:5:export function debounce(fn, delay) {',
      'utils.js:7:  return (...args) => {',
    ])
  })

  it("'delay)$' — код 1 (пусто): строка кончается на ';', не на ')'", () => {
    expect(matchLines('delay)$')).toEqual([])
  })

  it("'[fd]elay' — перечень символов в классе", () => {
    expect(matchLines('[fd]elay')).toEqual([
      'utils.js:5:export function debounce(fn, delay) {',
      'utils.js:9:    t = setTimeout(() => fn(...args), delay);',
    ])
  })

  it("'[a-z](' / '[^a-z](' — диапазон и отрицание", () => {
    expect(matchLines('[a-z](')).toEqual([
      'app.js:1:function renderCard(item) {',
      'app.js:2:  const el = document.createElement("div");',
      'utils.js:1:export function formatDate(d) {',
      'utils.js:2:  return d.toLocaleDateString("ru-RU");',
      'utils.js:5:export function debounce(fn, delay) {',
      'utils.js:8:    clearTimeout(t);',
      'utils.js:9:    t = setTimeout(() => fn(...args), delay);',
    ])
    expect(matchLines('[^a-z](')).toEqual(['utils.js:7:  return (...args) => {', 'utils.js:9:    t = setTimeout(() => fn(...args), delay);'])
  })

  it("'item[^.]' — только app.js:1 (после item идёт ')', не '.')", () => {
    expect(matchLines('item[^.]')).toEqual(['app.js:1:function renderCard(item) {'])
  })

  it("'(fn' — в BRE '(' обычный символ, находит utils.js:5", () => {
    expect(matchLines('(fn')).toEqual(['utils.js:5:export function debounce(fn, delay) {'])
  })

  it("'fn(' находит utils.js:9", () => {
    expect(matchLines('fn(')).toEqual(['utils.js:9:    t = setTimeout(() => fn(...args), delay);'])
  })

  it("'...args' и -F '...args' — '.' и без -F, и буквально дают тот же результат здесь", () => {
    const expected = ['utils.js:7:  return (...args) => {', 'utils.js:9:    t = setTimeout(() => fn(...args), delay);']
    expect(matchLines('...args')).toEqual(expected)
    expect(matchLines('...args', { fixedStrings: true })).toEqual(expected)
  })

  it("'a' без -i — 10 строк (не совпадает с 'Мини-проект' и т.п. без заглавной 'А')", () => {
    expect(matchLines('a')).toHaveLength(10)
  })

  it("'x  y' (два пробела) — пусто", () => {
    expect(matchLines('x  y')).toEqual([])
  })
})

describe('translateBrePattern — ошибки (target.md, опасное место 2), код 128 строит вызывающий код', () => {
  it("'\\\\(fn' — Unmatched ( or \\( (экранированная открывающая без пары)", () => {
    expect(translateBrePattern('\\(fn')).toEqual({ ok: false, kind: 'unmatchedParen' })
  })

  it("'[' без закрывающей — Invalid regular expression", () => {
    expect(translateBrePattern('[')).toEqual({ ok: false, kind: 'invalidRegex' })
  })

  it("'[z-a]' — Invalid range end (диапазон в обратном порядке)", () => {
    expect(translateBrePattern('[z-a]')).toEqual({ ok: false, kind: 'invalidRangeEnd' })
  })

  it("'a\\\\' (висячий обратный слэш) — Trailing backslash", () => {
    expect(translateBrePattern('a\\')).toEqual({ ok: false, kind: 'trailingBackslash' })
  })

  it('прочие escape-последовательности (\\?, \\{…\\}, \\w, \\<, \\b, \\1, \\*) — вне области', () => {
    for (const p of ['a\\?', 'a\\{2\\}', '\\w', '\\<abc', '\\bfoo', 'a\\1', 'a\\*']) {
      expect(translateBrePattern(p), p).toEqual({ ok: false, kind: 'outOfScope' })
    }
  })

  it('классы [[:upper:]]/[[:digit:]] — вне области (target.md, «Что НЕ входит»)', () => {
    expect(translateBrePattern('[[:upper:]]')).toEqual({ ok: false, kind: 'outOfScope' })
    expect(translateBrePattern('[[:digit:]]')).toEqual({ ok: false, kind: 'outOfScope' })
  })
})

describe('compilePattern — шаблон, совпадающий с пустой строкой (target.md, «Что НЕ входит»)', () => {
  it("'^$', '^', '$', 'x*' компилируются, но совпадают с пустой строкой — вызывающий код должен отказать", () => {
    for (const p of ['^$', '^', '$', 'x*']) {
      const compiled = compilePattern(p, { ignoreCase: false, fixedStrings: false, wordRegexp: false })
      expect(compiled.ok, p).toBe(true)
      if (compiled.ok) expect(compiled.regex.test(''), p).toBe(true)
    }
  })

  it("'debounce' не совпадает с пустой строкой", () => {
    const compiled = compilePattern('debounce', { ignoreCase: false, fixedStrings: false, wordRegexp: false })
    expect(compiled.ok).toBe(true)
    if (compiled.ok) expect(compiled.regex.test('')).toBe(false)
  })
})

describe('escapeFixedString', () => {
  it('экранирует все JS-метасимволы буквально', () => {
    expect(escapeFixedString('a.b*c(d)')).toBe('a\\.b\\*c\\(d\\)')
  })
})

describe('-w (word-regexp, target.md)', () => {
  it("'-n -w card' находит только app.js:3", () => {
    expect(matchLines('card', { wordRegexp: true })).toEqual(['app.js:3:  el.className = "card";'])
  })
})

describe('-i (ignore-case, target.md, опасное место 5 — регистр обычного текста)', () => {
  it("'Debounce' без -i не находит ничего (регистр важен)", () => {
    expect(matchLines('Debounce')).toEqual([])
  })
  it("'Debounce' с -i находит обе строки", () => {
    expect(matchLines('Debounce', { ignoreCase: true })).toEqual([
      'README.md:4:TODO: добавить тесты для debounce.',
      'utils.js:5:export function debounce(fn, delay) {',
    ])
  })
})
