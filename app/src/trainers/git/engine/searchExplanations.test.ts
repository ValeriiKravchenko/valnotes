// ============================================================
// Раздел 6, шаг A: речь тренажёра в трёх местах (target.md, часть VIII, места 3 и 4, упрощение
// про заголовок @@). Факты сверены на git 2.53.0:
// - git grep без совпадений (в том числе с -l и -c): пустой вывод, код 1; без -i регистр различается;
// - git grep -n export function: fatal: ambiguous argument 'function', код 128;
// - у заголовка @@ после номеров строк стоит ближайшая выше фрагмента строка, начинающаяся с
//   латинской буквы, «_» или «$»; с кириллицы, цифры, «#» или пробела — не стоит.
// ============================================================
import { describe, expect, it } from 'vitest'
import { createSearchSection, getAllCommits, runSearchCommand } from './searchSection'
import type { SearchState } from './searchTypes'
import { hunkFunctionContext } from './searchFunctionContext'
import { ru } from '../locales/ru'

function run(state: SearchState, input: string) {
  const { state: next, result } = runSearchCommand(state, input)
  if (result === null) throw new Error('ожидалась команда')
  return { state: next, result }
}
const base = () => createSearchSection({ commits: ru.searching.seed.commits })
const sx = ru.searching.explain

describe('«не найдено» — не ошибка (место 4)', () => {
  it('нет совпадений: пустой вывод, код 1, ok=true, речь называет код 1 и «не ошибка»', () => {
    const { result } = run(base(), 'git grep -n nosuchword')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.explanation).toBe(sx.noMatch(false))
    expect(result.explanation?.startsWith('[тренажёр]')).toBe(true)
    expect(result.explanation).toContain('кодом 1')
  })

  it('заглавные буквы без -i: добавлена подсказка про регистр', () => {
    const { result } = run(base(), 'git grep -n Debounce')
    expect(result.exitCode).toBe(1)
    expect(result.explanation).toBe(sx.noMatch(true))
    expect(result.explanation).toContain('различает регистр')
  })

  it('заглавные буквы с -i, но совпадений всё равно нет: подсказки про регистр нет', () => {
    const { result } = run(base(), 'git grep -n -i Nosuchword')
    expect(result.explanation).toBe(sx.noMatch(false))
  })

  it('-l и -c без совпадений — та же речь', () => {
    expect(run(base(), 'git grep -l nosuchword').result.explanation).toBe(sx.noMatch(false))
    expect(run(base(), 'git grep -c nosuchword').result.explanation).toBe(sx.noMatch(false))
  })

  it('есть совпадения — речи про «не найдено» нет', () => {
    expect(run(base(), 'git grep -n debounce').result.explanation).toBeNull()
  })

  it('кавычки и «не найдено» вместе: обе реплики', () => {
    const { result } = run(base(), 'git grep -n "nosuchword"')
    expect(result.explanation).toContain(sx.quotesEatenByShell('nosuchword'))
    expect(result.explanation).toContain(sx.noMatch(false))
  })
})

describe('два слова без кавычек (место 3)', () => {
  it('git grep -n export function: код 128, речь называет шелл и оба слова', () => {
    const { result } = run(base(), 'git grep -n export function')
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(128)
    expect(result.output).toContain("fatal: ambiguous argument 'function'")
    expect(result.explanation).toBe(sx.unknownSecondWord('export', 'function'))
    expect(result.explanation).toContain('шелл')
    expect(result.explanation).toContain("git grep -n 'export function'")
  })

  it('намеренно названный несуществующий файл: тот же отказ git, речь не утверждает, что это обрывок фразы', () => {
    const { result } = run(base(), 'git grep -n debounce nosuch.js')
    expect(result.output).toContain("fatal: ambiguous argument 'nosuch.js'")
    expect(result.explanation).toContain('Если «debounce nosuch.js» — одна фраза')
  })

  it('апостроф в словах: совет про кавычки не даётся (он был бы неверным)', () => {
    const text = sx.unknownSecondWord("it's", 'x')
    expect(text).not.toContain('git grep -n')
  })

  it('существующий файл вторым словом — это путь, ошибки и речи нет', () => {
    const { result } = run(base(), 'git grep -n debounce utils.js')
    expect(result.ok).toBe(true)
    expect(result.explanation).toBeNull()
  })

  it('фраза в кавычках — обычный поиск, речи про слова нет', () => {
    const { result } = run(base(), "git grep -n 'export function'")
    expect(result.explanation).toBeNull()
  })
})

describe('заголовок @@ (упрощение inspectDiff.ts)', () => {
  it('git show третьего коммита: git дописал бы function renderCard(item) {, тренажёр — нет', () => {
    const state = base()
    const third = getAllCommits(state).find((c) => c.message === 'Сохранять id товара в data-атрибуте')!
    const { result } = run(state, `git show ${third.id}`)
    expect(result.output).toContain('@@ -2,5 +2,6 @@')
    expect(result.output).not.toContain('@@ function')
    expect(result.explanation).toBe(sx.hunkFunctionContext('function renderCard(item) {'))
  })

  it('git show первого коммита (все файлы новые, @@ -0,0): строки-ориентира у git быть не может — речи нет', () => {
    const state = base()
    const first = getAllCommits(state).find((c) => c.message === 'Первая версия renderCard')!
    expect(run(state, `git show ${first.id}`).result.explanation).toBeNull()
  })

  it('git log и git grep речи про @@ не получают', () => {
    expect(run(base(), 'git log').result.explanation).toBeNull()
    expect(run(base(), 'git grep -n debounce').result.explanation).toBeNull()
  })
})

describe('hunkFunctionContext: правило git', () => {
  const diff = (file: string, header: string) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${header}\n-x\n+y`
  const tree = (text: string) => ({ f: text })

  it('ближайшая выше фрагмента строка на латинскую букву (сверено: nearest, а не первая)', () => {
    expect(hunkFunctionContext(tree('first\nsecond\n  a\n  b\n  c\n  d\n  e\n  f\n  g'), diff('f', '@@ -6,4 +6,4 @@'))).toEqual({ example: 'second' })
  })

  it('«_» и «$» подходят', () => {
    expect(hunkFunctionContext(tree('_under\n  a\n  b\n  c\n  d\n  e'), diff('f', '@@ -5,2 +5,2 @@'))).toEqual({ example: '_under' })
    expect(hunkFunctionContext(tree('$dollar\n  a\n  b\n  c\n  d\n  e'), diff('f', '@@ -5,2 +5,2 @@'))).toEqual({ example: '$dollar' })
  })

  it('кириллица, цифра, «#», пробел в начале строки не подходят', () => {
    for (const first of ['Мини', '1digit', '# Title', '  indented']) {
      expect(hunkFunctionContext(tree(`${first}\n  a\n  b\n  c\n  d\n  e`), diff('f', '@@ -5,2 +5,2 @@'))).toBeNull()
    }
  })

  it('фрагмент с первой строки файла — искать выше нечего', () => {
    expect(hunkFunctionContext(tree('function a() {\n  b\n}'), diff('f', '@@ -1,3 +1,3 @@'))).toBeNull()
  })

  it('новый файл (старого содержимого нет) — null', () => {
    expect(hunkFunctionContext({}, diff('f', '@@ -0,0 +1,3 @@'))).toBeNull()
  })

  it('хвостовые пробелы отбрасываются, длинная строка обрезается по 80 байтам', () => {
    expect(hunkFunctionContext(tree('abc   \n  a\n  b\n  c\n  d'), diff('f', '@@ -4,2 +4,2 @@'))).toEqual({ example: 'abc' })
    const long = 'a'.repeat(81)
    expect(hunkFunctionContext(tree(`${long}\n  a\n  b\n  c\n  d`), diff('f', '@@ -4,2 +4,2 @@'))).toEqual({ example: 'a'.repeat(80) })
    expect(hunkFunctionContext(tree(`${'a'.repeat(80)}\n  a\n  b\n  c\n  d`), diff('f', '@@ -4,2 +4,2 @@'))).toEqual({ example: 'a'.repeat(80) })
    // пробелы после точки обрезки отбрасываются (git: 78 знаков + 3 пробела + «yy» -> 78 знаков)
    expect(hunkFunctionContext(tree(`${'a'.repeat(78)}   yy\n  a\n  b\n  c\n  d`), diff('f', '@@ -4,2 +4,2 @@'))).toEqual({ example: 'a'.repeat(78) })
  })

  it('предел считается в байтах: кириллица (сверено на git 2.53.0)', () => {
    const at = (line: string) => hunkFunctionContext(tree(`${line}\n  a\n  b\n  c\n  d`), diff('f', '@@ -4,2 +4,2 @@'))
    // 1 + 40*2 = 81 байт, 41 символ: git показал 79 байт (f + 39 «ж»)
    expect(at(`f${'ж'.repeat(40)}`)).toEqual({ example: `f${'ж'.repeat(39)}` })
    // 79 байт — без изменений
    expect(at(`f${'ж'.repeat(39)}`)).toEqual({ example: `f${'ж'.repeat(39)}` })
    // ровно 80 байт (ff + 39 «ж») — без изменений
    expect(at(`ff${'ж'.repeat(39)}`)).toEqual({ example: `ff${'ж'.repeat(39)}` })
  })

  it('берётся старое содержимое именно того файла, к которому относится фрагмент', () => {
    const text = `${diff('a.js', '@@ -1,1 +1,1 @@')}\n${diff('b.js', '@@ -3,1 +3,1 @@')}`
    expect(hunkFunctionContext({ 'a.js': 'x', 'b.js': 'name\n  a\n  b' }, text)).toEqual({ example: 'name' })
  })
})
