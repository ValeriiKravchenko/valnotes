// ============================================================
// Раздел 6 git-тренажёра, ШАГ A («Проект»): сквозные проверки терминала
// (grep/blame/show/log) через публичный вход searchSection.ts. Тексты и коды
// исходов — буквально из docs/git-trainer/reports/section6-git-runs.txt
// (git 2.53.0, LC_ALL=C, 26.09.2026) — не по памяти.
//
// Ссылки вида S6-NN — проверки из target.md, часть VIII, «Расхождения со
// spec.md» и «Что входит»/«Опасные места».
// ============================================================
import { describe, expect, it } from 'vitest'
import { createSearchSection, getAllCommits, runSearchCommand } from './searchSection'
import type { SearchState } from './searchTypes'
import { gitNotACommand } from './searchScope'
import { grepTree } from './searchGrep'
import { ru } from '../locales/ru'

function run(state: SearchState, input: string) {
  const { state: next, result } = runSearchCommand(state, input)
  if (result === null) throw new Error('ожидалась команда, а не пустая строка')
  return { state: next, result }
}

function baseState(): SearchState {
  return createSearchSection({ commits: ru.searching.seed.commits })
}

function commitByMessage(state: SearchState, message: string) {
  const found = getAllCommits(state).find((c) => c.message === message)
  if (!found) throw new Error(`коммит «${message}» не найден`)
  return found
}

// ---------- git grep: основные формы (target.md, S6-02…S6-09) ----------

describe('git grep — основные формы', () => {
  it('S6-05: git grep -n debounce — README.md раньше utils.js (опасное место 6), код 0', () => {
    const { result } = run(baseState(), 'git grep -n debounce')
    expect(result.ok).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.output).toBe('README.md:4:TODO: добавить тесты для debounce.\nutils.js:5:export function debounce(fn, delay) {')
  })

  it('git grep debounce — без -n, формат "файл:содержимое"', () => {
    const { result } = run(baseState(), 'git grep debounce')
    expect(result.output).toBe('README.md:TODO: добавить тесты для debounce.\nutils.js:export function debounce(fn, delay) {')
    expect(result.exitCode).toBe(0)
  })

  it('S6-02: git grep -n \'"ru-RU"\' и git grep -n "ru-RU" находят одну и ту же строку', () => {
    const s = baseState()
    const single = run(s, "git grep -n '\"ru-RU\"'").result
    const double = run(s, 'git grep -n "ru-RU"').result
    expect(single.output).toBe('utils.js:2:  return d.toLocaleDateString("ru-RU");')
    expect(double.output).toBe(single.output)
    expect(single.exitCode).toBe(0)
    expect(double.exitCode).toBe(0)
  })

  it('опасное место 1: пояснение о кавычках — только когда шаблон в двойных кавычках и без кавычек внутри', () => {
    const s = baseState()
    expect(run(s, 'git grep -n "ru-RU"').result.explanation).toBe(ru.searching.explain.quotesEatenByShell('ru-RU'))
    expect(run(s, "git grep -n '\"ru-RU\"'").result.explanation).toBeNull()
    expect(run(s, 'git grep -n debounce').result.explanation).toBeNull()
  })

  it('S6-03: git grep -n \'"card"\'', () => {
    const { result } = run(baseState(), "git grep -n '\"card\"'")
    expect(result.output).toBe('app.js:3:  el.className = "card";')
  })

  it('S6-06: git grep -n Debounce (без -i) — пусто, код 1', () => {
    const { result } = run(baseState(), 'git grep -n Debounce')
    expect(result.output).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.ok).toBe(true)
  })

  it('S6-07: -i и -ni находят обе строки, регистр текста исходный', () => {
    const s = baseState()
    const a = run(s, 'git grep -n -i Debounce').result
    const b = run(s, 'git grep -ni Debounce').result
    expect(a.output).toBe('README.md:4:TODO: добавить тесты для debounce.\nutils.js:5:export function debounce(fn, delay) {')
    expect(b.output).toBe(a.output)
  })

  it('S6-08: git grep -n a — порога «минимум 2 символа» нет, 10 строк, код 0', () => {
    const { result } = run(baseState(), 'git grep -n a')
    expect(result.exitCode).toBe(0)
    expect(result.output.split('\n')).toHaveLength(10)
  })

  it("S6-09: git grep -n 'x  y' — пусто, код 1", () => {
    const { result } = run(baseState(), "git grep -n 'x  y'")
    expect(result.output).toBe('')
    expect(result.exitCode).toBe(1)
  })

  it('S6-10: git grep -n \'(fn\' — код 0 (в BRE "(" обычный символ)', () => {
    const { result } = run(baseState(), "git grep -n '(fn'")
    expect(result.output).toBe('utils.js:5:export function debounce(fn, delay) {')
    expect(result.exitCode).toBe(0)
  })

  it('доп: -l и -c (желательное, target.md)', () => {
    const s = baseState()
    expect(run(s, 'git grep -l debounce').result.output).toBe('README.md\nutils.js')
    expect(run(s, 'git grep -c debounce').result.output).toBe('README.md:1\nutils.js:1')
  })

  it('доп: -n -w card — только app.js:3', () => {
    const { result } = run(baseState(), 'git grep -n -w card')
    expect(result.output).toBe('app.js:3:  el.className = "card";')
  })

  it('-F — буквальный поиск: -n -E \'(fn\' вне области, -n -F \'(fn\' работает', () => {
    const s = baseState()
    const extended = run(s, "git grep -n -E '(fn'").result
    expect(extended.ok).toBe(false)
    expect(extended.exitCode).toBeUndefined()
    const fixed = run(s, "git grep -n -F '(fn'").result
    expect(fixed.output).toBe('utils.js:5:export function debounce(fn, delay) {')
    expect(fixed.exitCode).toBe(0)
  })

  it('опасное место 5: -i действует и на кириллицу (тренажёр моделирует UTF-8-локаль)', () => {
    const s = baseState()
    expect(run(s, "git grep -n 'Мини'").result.output).toBe('README.md:1:# Мини-проект')
    expect(run(s, "git grep -n -i 'мини'").result.output).toBe('README.md:1:# Мини-проект')
  })
})

// ---------- пути (target.md, опасное место 7) ----------

describe('git grep — путь: с "--" и без', () => {
  it('git grep -n debounce utils.js и -- utils.js — тот же результат', () => {
    const s = baseState()
    const noSep = run(s, 'git grep -n debounce utils.js').result
    const withSep = run(s, 'git grep -n debounce -- utils.js').result
    expect(noSep.output).toBe('utils.js:5:export function debounce(fn, delay) {')
    expect(withSep.output).toBe(noSep.output)
  })

  it('git grep -n debounce nosuch.js (без --) — ambiguous argument, код 128', () => {
    const { result } = run(baseState(), 'git grep -n debounce nosuch.js')
    expect(result.output).toBe(
      "fatal: ambiguous argument 'nosuch.js': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'",
    )
    expect(result.exitCode).toBe(128)
  })

  it('git grep -n debounce -- nosuch.js — пусто, код 1 (не «pathspec did not match»)', () => {
    const { result } = run(baseState(), 'git grep -n debounce -- nosuch.js')
    expect(result.output).toBe('')
    expect(result.exitCode).toBe(1)
  })

  it('git grep -n debounce -- utils.js nosuch.js — utils.js находится, код 0', () => {
    const { result } = run(baseState(), 'git grep -n debounce -- utils.js nosuch.js')
    expect(result.output).toBe('utils.js:5:export function debounce(fn, delay) {')
    expect(result.exitCode).toBe(0)
  })

  it('git grep — без шаблона: no pattern given, код 128', () => {
    const { result } = run(baseState(), 'git grep')
    expect(result.output).toBe('fatal: no pattern given')
    expect(result.exitCode).toBe(128)
  })

  it('git grep -x debounce — unknown switch + usage, код 129', () => {
    const { result } = run(baseState(), 'git grep -x debounce')
    expect(result.output.startsWith("error: unknown switch `x'\nusage: git grep")).toBe(true)
    expect(result.exitCode).toBe(129)
  })

  it('git grep -v debounce — настоящая опция git (invert-match), вне области — правило области, не unknown switch, без exitCode', () => {
    const { result } = run(baseState(), 'git grep -v debounce')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('git grep -v')
    expect(result.output).toContain('настоящая возможность git')
    expect(result.output).not.toContain('unknown switch')
    expect(result.exitCode).toBeUndefined()
  })

  it("git grep -Z9 debounce — выдуманного флага у git нет — unknown switch + usage, код 129", () => {
    const { result } = run(baseState(), 'git grep -Z9 debounce')
    expect(result.output.startsWith("error: unknown switch `Z'\nusage: git grep")).toBe(true)
    expect(result.exitCode).toBe(129)
  })
})

// ---------- поиск в коммите (target.md, опасное место 8, желательное) ----------

describe('git grep — поиск в коммите', () => {
  it('git grep -n debounce master/HEAD/HEAD~2/<хэш> — префикс ровно как ввели', () => {
    const s = baseState()
    const head = commitByMessage(s, 'Сохранять id товара в data-атрибуте')
    const root = commitByMessage(s, 'Первая версия renderCard')

    expect(run(s, 'git grep -n debounce master').result.output).toBe(
      'master:README.md:4:TODO: добавить тесты для debounce.\nmaster:utils.js:5:export function debounce(fn, delay) {',
    )
    expect(run(s, 'git grep -n debounce HEAD~2').result.output).toBe(
      'HEAD~2:README.md:4:TODO: добавить тесты для debounce.\nHEAD~2:utils.js:5:export function debounce(fn, delay) {',
    )
    expect(run(s, `git grep -n debounce ${head.id.slice(0, 7)} -- utils.js`).result.output).toBe(
      `${head.id.slice(0, 7)}:utils.js:5:export function debounce(fn, delay) {`,
    )
    expect(run(s, `git grep -n card ${root.id.slice(0, 7)}`).result.exitCode).toBe(1)
    expect(run(s, 'git grep -n card HEAD').result.output).toBe('HEAD:app.js:3:  el.className = "card";')
  })
})

// ---------- символы шелла и слова без кавычек (target.md, опасное место 3) ----------

describe('символы шелла вне модели (опасное место 3)', () => {
  it('git grep -n => fn — честный отказ по оператору «>», без выдумки поведения bash', () => {
    const { result } = run(baseState(), 'git grep -n => fn')
    expect(result.output).toBe(ru.errors.shellOperatorUnsupported('>'))
    expect(result.exitCode).toBeUndefined()
  })

  it('git grep -n (fn (без кавычек) — отказ по оператору «(»', () => {
    const { result } = run(baseState(), 'git grep -n (fn')
    expect(result.output).toBe(ru.errors.shellOperatorUnsupported('('))
  })

  it("git grep -n renderCard\\|debounce (без кавычек) — отказ по обратной косой: bash снял бы её и передал git `renderCard|debounce`, конвейера тут нет", () => {
    const { result } = run(baseState(), 'git grep -n renderCard\\|debounce')
    expect(result.output).toBe(ru.errors.shellBackslashUnsupported)
  })

  it('git grep -n export function (два слова без кавычек) — ambiguous argument про "function", код 128', () => {
    const { result } = run(baseState(), 'git grep -n export function')
    expect(result.output).toContain("fatal: ambiguous argument 'function'")
    expect(result.exitCode).toBe(128)
  })

  it("git grep -n x y — ambiguous argument про 'y', код 128", () => {
    const { result } = run(baseState(), 'git grep -n x y')
    expect(result.output).toContain("fatal: ambiguous argument 'y'")
    expect(result.exitCode).toBe(128)
  })
})

// ---------- правило области: шаблон вне поддержанного набора ----------

describe('git grep — правило области для шаблона', () => {
  it("'^$' компилируется, но совпадает с пустой строкой — второй ответ, без exitCode", () => {
    const { result } = run(baseState(), "git grep -n '^$'")
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBeUndefined()
    expect(result.output).toBe(ru.searching.errors.grepPatternOutOfScope('^$'))
  })

  it("классы '[[:upper:]]' — вне области", () => {
    const { result } = run(baseState(), "git grep -n '[[:upper:]]'")
    expect(result.output).toBe(ru.searching.errors.grepPatternOutOfScope('[[:upper:]]'))
  })

  it("прочие escape-последовательности ('\\\\?') — вне области", () => {
    const { result } = run(baseState(), "git grep -n 'a\\?'")
    expect(result.output).toBe(ru.searching.errors.grepPatternOutOfScope('a\\?'))
  })

  it('git grep -E — известная, но не разбираемая опция (второй ответ, не unknown switch)', () => {
    const { result } = run(baseState(), "git grep -n -E '(fn'")
    expect(result.output).toContain('git grep -E')
    expect(result.output).not.toContain('unknown switch')
  })
})

// ---------- git blame ----------

describe('git blame — основные формы (target.md, S6-13, опасное место 9)', () => {
  it('git blame app.js — 7 строк, строка 5 у последнего коммита (Марина)', () => {
    const s = baseState()
    const { result } = run(s, 'git blame app.js')
    expect(result.exitCode).toBe(0)
    const lines = result.output.split('\n')
    expect(lines).toHaveLength(7)
    expect(lines[4]).toContain('Марина 2026-04-02 12:00:00 +0300 5')
    expect(lines[4]).toContain('el.dataset.id = item.id;')
    expect(lines[0]).toMatch(/^\^[0-9a-f]{7} /)
  })

  it('git blame -s app.js — без автора/даты', () => {
    const { result } = run(baseState(), 'git blame -s app.js')
    expect(result.output.split('\n')[4]).toBe(`${result.output.split('\n')[4].match(/^\S+/)![0]} 5)   el.dataset.id = item.id;`)
    expect(result.output).not.toContain('Марина')
    expect(result.output).not.toContain('Валера')
  })

  it('git blame -L 5,5 app.js — одна строка', () => {
    const { result } = run(baseState(), 'git blame -L 5,5 app.js')
    expect(result.output.split('\n')).toHaveLength(1)
    expect(result.output).toContain('el.dataset.id = item.id;')
  })

  it('git blame -L 5 app.js — строки 5–7 до конца файла', () => {
    const { result } = run(baseState(), 'git blame -L 5 app.js')
    expect(result.output.split('\n')).toHaveLength(3)
  })

  it('git blame -L 3,2 app.js — как -L 2,3 (перестановка, Д5)', () => {
    const s = baseState()
    const swapped = run(s, 'git blame -L 3,2 app.js').result
    const ordered = run(s, 'git blame -L 2,3 app.js').result
    expect(swapped.output).toBe(ordered.output)
    expect(swapped.output.split('\n')).toHaveLength(2)
  })
})

describe('git blame — ошибки (target.md, опасное место 10)', () => {
  it('git blame -L 9,9 app.js — file app.js has only 7 lines, код 128', () => {
    const { result } = run(baseState(), 'git blame -L 9,9 app.js')
    expect(result.output).toBe('fatal: file app.js has only 7 lines')
    expect(result.exitCode).toBe(128)
  })

  it('git blame -L 0,2 app.js — invalid line number: 0, код 128', () => {
    const { result } = run(baseState(), 'git blame -L 0,2 app.js')
    expect(result.output).toBe('fatal: -L invalid line number: 0')
    expect(result.exitCode).toBe(128)
  })

  it("git blame nosuch.js — no such path, код 128", () => {
    const { result } = run(baseState(), 'git blame nosuch.js')
    expect(result.output).toBe("fatal: no such path 'nosuch.js' in HEAD")
    expect(result.exitCode).toBe(128)
  })

  it("git blame app.js utils.js — bad revision 'app.js' (Д6), код 128", () => {
    const { result } = run(baseState(), 'git blame app.js utils.js')
    expect(result.output).toBe("fatal: bad revision 'app.js'")
    expect(result.exitCode).toBe(128)
  })

  it('git blame / git blame -s / git blame -L app.js — usage без строки ошибки, код 129', () => {
    const s = baseState()
    for (const cmd of ['git blame', 'git blame -s', 'git blame -L app.js']) {
      const { result } = run(s, cmd)
      expect(result.output.startsWith('usage: git blame')).toBe(true)
      expect(result.exitCode).toBe(129)
    }
  })

  it("git blame -x app.js — unknown option (с дефисом в кавычках), код 129", () => {
    const { result } = run(baseState(), 'git blame -x app.js')
    expect(result.output.startsWith("error: unknown option `-x'\nusage: git blame")).toBe(true)
    expect(result.exitCode).toBe(129)
  })

  it('git blame -e app.js — известная, но не разбираемая опция, без exitCode', () => {
    const { result } = run(baseState(), 'git blame -e app.js')
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBeUndefined()
    expect(result.output).toContain('git blame -e')
  })

  it('git blame -w app.js — настоящая опция git (ignore whitespace), вне области — правило области, не unknown option, без exitCode', () => {
    const { result } = run(baseState(), 'git blame -w app.js')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('git blame -w')
    expect(result.output).toContain('настоящая возможность git')
    expect(result.output).not.toContain('unknown option')
    expect(result.exitCode).toBeUndefined()
  })

  it('git blame -C90 app.js — реальная опция с приклеенным числом (score), вне области', () => {
    const { result } = run(baseState(), 'git blame -C90 app.js')
    expect(result.output).toContain('git blame -C90')
    expect(result.output).toContain('настоящая возможность git')
    expect(result.exitCode).toBeUndefined()
  })

  it("git blame -Z9 app.js — выдуманного флага у git нет — unknown option, код 129", () => {
    const { result } = run(baseState(), 'git blame -Z9 app.js')
    expect(result.output.startsWith("error: unknown option `-Z9'\nusage: git blame")).toBe(true)
    expect(result.exitCode).toBe(129)
  })
})

// ---------- git show / git log (target.md, опасные места 11–12) ----------

describe('git show — Author/Date и diff (target.md, S6-14, Д11)', () => {
  it('git show (без ссылки) — последний коммит, вставленная строка dataset.id', () => {
    const s = baseState()
    const head = commitByMessage(s, 'Сохранять id товара в data-атрибуте')
    const { result } = run(s, 'git show')
    expect(result.output).toContain(`commit ${head.id}`)
    expect(result.output).toContain('Author: Марина <marina@example.com>')
    expect(result.output).toContain('Date:   Thu Apr 2 12:00:00 2026 +0300')
    expect(result.output).toContain('    Сохранять id товара в data-атрибуте')
    expect(result.output).toContain('+  el.dataset.id = item.id;')
    expect(result.output).toContain('@@ -2,5 +2,6 @@')
  })

  it('git show <хэш второго коммита> — вставка el.className', () => {
    const s = baseState()
    const c2 = commitByMessage(s, 'Добавить класс card для карточек')
    const { result } = run(s, `git show ${c2.id.slice(0, 7)}`)
    expect(result.output).toContain(`commit ${c2.id}`)
    expect(result.output).toContain('Author: Марина <marina@example.com>')
    expect(result.output).toContain('Date:   Wed Mar 18 11:00:00 2026 +0300')
    expect(result.output).toContain('+  el.className = "card";')
  })

  it('git show <хэш корневого> — три новых файла (README.md, app.js, utils.js — порядок байтов имени)', () => {
    const s = baseState()
    const root = commitByMessage(s, 'Первая версия renderCard')
    const { result } = run(s, `git show ${root.id.slice(0, 7)}`)
    expect(result.output).toContain('Author: Валера <valera@example.com>')
    expect(result.output).toContain('Date:   Thu Mar 12 10:00:00 2026 +0300')
    const iReadme = result.output.indexOf('diff --git a/README.md')
    const iApp = result.output.indexOf('diff --git a/app.js')
    const iUtils = result.output.indexOf('diff --git a/utils.js')
    expect(iReadme).toBeGreaterThanOrEqual(0)
    expect(iReadme).toBeLessThan(iApp)
    expect(iApp).toBeLessThan(iUtils)
  })
})

describe('git log (target.md, «История файла»)', () => {
  it('git log app.js — все три коммита «Проекта» (Д11)', () => {
    const { result } = run(baseState(), 'git log app.js')
    expect(result.output).toContain('Первая версия renderCard')
    expect(result.output).toContain('Добавить класс card для карточек')
    expect(result.output).toContain('Сохранять id товара в data-атрибуте')
    expect(result.output.match(/^commit /gm)).toHaveLength(3)
  })

  it('git log --oneline app.js — 3 короткие строки, новые сверху', () => {
    const { result } = run(baseState(), 'git log --oneline app.js')
    const lines = result.output.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Сохранять id товара в data-атрибуте')
    expect(lines[2]).toContain('Первая версия renderCard')
    expect(lines[0]).toMatch(/^[0-9a-f]{7} /)
  })

  it('git log --oneline — 3 строки', () => {
    const { result } = run(baseState(), 'git log --oneline')
    expect(result.output.split('\n')).toHaveLength(3)
  })

  it('git log — Author/Date у каждого коммита, разделены пустой строкой', () => {
    const { result } = run(baseState(), 'git log')
    expect(result.output.split('\n\n\n')).toHaveLength(1) // не более одной пустой строки между записями
    expect(result.output.match(/^Author: /gm)).toHaveLength(3)
    expect(result.output.match(/^Date: {3}/gm)).toHaveLength(3)
  })
})

// ---------- граница области: команды (target.md, «Что НЕ входит») ----------

describe('граница области — команды', () => {
  it('git — без подкоманды', () => {
    const { result } = run(baseState(), 'git')
    expect(result.output).toBe(ru.searching.errors.gitUsageNoArgs)
  })

  it('git commit/add/branch/checkout/merge/revert/reset/status/diff — реальные, но вне терминала', () => {
    const s = baseState()
    for (const cmd of ['git commit -m "x"', 'git add app.js', 'git branch', 'git checkout master', 'git merge master', 'git status', 'git diff']) {
      const { result } = run(s, cmd)
      expect(result.output, cmd).toContain('настоящая, но в этой части тренажёра не реализована')
    }
  })

  it('git bisect start — правило соседнего терминала, а не commandOutOfScope', () => {
    const { result } = run(baseState(), 'git bisect start')
    expect(result.output).toBe(ru.searching.errors.bisectOtherTerminal)
  })

  it('git foobar — не git-команда вовсе', () => {
    const { result } = run(baseState(), 'git foobar')
    expect(result.output).toBe(gitNotACommand('foobar'))
  })

  it('git -C /tmp grep debounce — глобальная опция git, вне области', () => {
    const { result } = run(baseState(), 'git -C /tmp grep debounce')
    expect(result.output).toContain('настоящая, но в этой части тренажёра не реализована')
  })
})

// ---------- миссии (target.md, «Миссии», п.1–2) ----------

describe('миссии шага A', () => {
  it('миссия 1 засчитывается успешным grep без ссылки, находящим debounce в обоих файлах; -l/-c тоже подходят', () => {
    let s = baseState()
    expect(s.missionsDone.grepDebounce).toBe(false)
    s = run(s, 'git grep -l debounce').state
    expect(s.missionsDone.grepDebounce).toBe(true)
  })

  it('миссия 1 НЕ засчитывается поиском в конкретном коммите (без ссылки — обязательное условие)', () => {
    let s = baseState()
    s = run(s, 'git grep -n debounce HEAD').state
    expect(s.missionsDone.grepDebounce).toBe(false)
  })

  it('миссия 2, вариант 1: успешный git blame app.js (без -s) со строкой 5 в выводе', () => {
    let s = baseState()
    expect(s.missionsDone.blameDatasetId).toBe(false)
    s = run(s, 'git blame app.js').state
    expect(s.missionsDone.blameDatasetId).toBe(true)
  })

  it('миссия 2, вариант 2: git blame -s app.js (строка 5) + затем git show того коммита', () => {
    let s = baseState()
    const head = commitByMessage(s, 'Сохранять id товара в data-атрибуте')
    s = run(s, 'git blame -s app.js').state
    expect(s.missionsDone.blameDatasetId).toBe(false) // -s ещё не показывает автора — только blame недостаточно
    s = run(s, `git show ${head.id.slice(0, 8)}`).state
    expect(s.missionsDone.blameDatasetId).toBe(true)
  })

  it('миссия 2 НЕ засчитывается, если -L обрезал вывод до строк без строки 5', () => {
    let s = baseState()
    s = run(s, 'git blame -L 1,3 app.js').state
    expect(s.missionsDone.blameDatasetId).toBe(false)
  })

  it('засчитанная миссия остаётся засчитанной (часть I, п.2)', () => {
    let s = baseState()
    s = run(s, 'git grep -l debounce').state
    expect(s.missionsDone.grepDebounce).toBe(true)
    s = run(s, 'git grep -n Debounce').state // неудачный запрос дальше по терминалу
    expect(s.missionsDone.grepDebounce).toBe(true)
  })
})

// ---------- порядок файлов при нескольких путях (F7) ----------
// Сверено песочницей git 2.53.0, 08.10.2026: пути после `--` (и без него) git обходит в порядке
// байтов имени, а не в порядке командной строки; повторы схлопываются; с ревизией порядок тот же.

describe('git grep — порядок файлов при нескольких путях', () => {
  function wordState(): SearchState {
    const files = ['README.md', 'Zeta.js', 'app.js', 'b.js', 'utils.js']
    const tree: Record<string, string> = {}
    for (const f of files) tree[f] = `word ${f}`
    return createSearchSection({ commits: [{ message: 'one', tree, author: 'Tester', email: 'tester@example.invalid', date: { year: 2026, month: 1, day: 1, hour: 12, minute: 0, second: 0, tzOffsetMinutes: 0 } }] })
  }
  const lines = (...names: string[]) => names.map((n) => `${n}:word ${n}`).join('\n')

  it('-- utils.js app.js README.md — README.md, app.js, utils.js (заглавная раньше строчной)', () => {
    const { result } = run(wordState(), 'git grep word -- utils.js app.js README.md')
    expect(result.output).toBe(lines('README.md', 'app.js', 'utils.js'))
    expect(result.exitCode).toBe(0)
  })

  it('заглавная Zeta.js раньше строчных, даже если в команде последняя', () => {
    const { result } = run(wordState(), 'git grep word -- b.js app.js Zeta.js README.md')
    expect(result.output).toBe(lines('README.md', 'Zeta.js', 'app.js', 'b.js'))
  })

  it('без `--` несколько путей — честный отказ области (git там тоже сортирует, но раздел форму не разбирает)', () => {
    const { result } = run(wordState(), 'git grep word utils.js app.js')
    expect(result.output.startsWith('[тренажёр]')).toBe(true)
  })

  it('повтор пути не дублирует вывод; несуществующий путь в середине не мешает', () => {
    const { result } = run(wordState(), 'git grep word -- utils.js nope.js app.js utils.js')
    expect(result.output).toBe(lines('app.js', 'utils.js'))
  })

  it('с ревизией: HEAD:файл, порядок байтов имени', () => {
    const { result } = run(wordState(), 'git grep word HEAD -- utils.js README.md app.js')
    expect(result.output).toBe('HEAD:README.md:word README.md\nHEAD:app.js:word app.js\nHEAD:utils.js:word utils.js')
  })

  it('кириллица идёт после латиницы (байты UTF-8): порядок в grepTree', () => {
    const tree = { 'ёж.txt': 'word', 'апп.js': 'word', 'Бета.js': 'word', 'b.js': 'word', 'Zeta.js': 'word' }
    expect(grepTree(tree, /word/, ['ёж.txt', 'b.js', 'Zeta.js', 'апп.js', 'Бета.js']).map((m) => m.file)).toEqual([
      'Zeta.js',
      'b.js',
      'Бета.js',
      'апп.js',
      'ёж.txt',
    ])
  })
})
