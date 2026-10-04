// ============================================================
// Раздел 6 git-тренажёра, шаг A: перевод шаблона `git grep` (базовое регулярное
// выражение POSIX, BRE) в JS RegExp — и сама функция поиска по деревьям файлов.
// Область — target.md, часть VIII, «Особые символы шаблона» и опасное место 2:
// поддержаны `.` `*` `^` `$` `[…]` (перечень/диапазон/отрицание `^`) и
// экранированные `\.` `\+` `\(…\)` `\|`; `-F` (буквальный поиск). Всё остальное
// (классы `[[:…:]]`, прочие `\`-последовательности, узнаваемые ключи вне
// области — grep.ts, а не эта функция) — по правилу области, см. searchCommands.ts.
//
// Разбор ошибок BRE (Invalid range end / Trailing backslash / Unmatched ( or \( /
// Invalid regular expression) сверен буквально прогоном git 2.53.0, 26.09.2026
// (docs/git-trainer/reports/section6-git-runs.txt, «Д1»/«Д12»/основной блок GREP).
// ============================================================
import type { FileTree } from './searchTypes'
import { has } from './util'

export type BreErrorKind = 'unmatchedParen' | 'invalidRegex' | 'invalidRangeEnd' | 'trailingBackslash' | 'outOfScope'

export type BreResult = { ok: true; source: string } | { ok: false; kind: BreErrorKind }

interface BracketResult {
  ok: true
  jsSource: string
  nextIndex: number
}
type BracketFailure = { ok: false; kind: BreErrorKind }

/** JS-экранирование одного символа ВНУТРИ класса `[...]` — только то, что в JS внутри класса вообще может значить что-то особое (`\`, `]`, `^`), остальное (включая `.`, `-` не на месте диапазона) — обычный символ и в POSIX-классе, и в JS-классе. */
function escapeForClass(ch: string): string {
  return ch === '\\' || ch === ']' || ch === '^' ? '\\' + ch : ch
}

/**
 * Разбирает bracket-выражение `[...]`, начинающееся в `pattern[start]` (`pattern[start] === '['`).
 * POSIX-правила: `]` сразу после `[` или `[^` — обычный символ, не закрывающая скобка; `a-b` —
 * диапазон (порядок должен быть неубывающим — иначе «Invalid range end»); `[:имя:]` (классы
 * символов) — вне области (target.md, «Что НЕ входит»); нет закрывающей `]` до конца шаблона —
 * «Invalid regular expression» (сверено: `git grep -n '['`).
 */
function parseBracket(pattern: string, start: number): BracketResult | BracketFailure {
  let idx = start + 1
  let negate = false
  if (pattern[idx] === '^') {
    negate = true
    idx++
  }
  const items: string[] = []
  let first = true
  while (idx < pattern.length) {
    if (pattern[idx] === ']' && !first) break
    if (pattern.slice(idx, idx + 2) === '[:') return { ok: false, kind: 'outOfScope' }
    first = false
    if (idx + 2 < pattern.length && pattern[idx + 1] === '-' && pattern[idx + 2] !== ']') {
      const a = pattern[idx]
      const b = pattern[idx + 2]
      if (a.charCodeAt(0) > b.charCodeAt(0)) return { ok: false, kind: 'invalidRangeEnd' }
      items.push(`${escapeForClass(a)}-${escapeForClass(b)}`)
      idx += 3
      continue
    }
    items.push(escapeForClass(pattern[idx]))
    idx++
  }
  if (idx >= pattern.length) return { ok: false, kind: 'invalidRegex' }
  idx++ // пропустить закрывающую ']'
  return { ok: true, jsSource: `[${negate ? '^' : ''}${items.join('')}]`, nextIndex: idx }
}

/** JS-метасимволы, которые в BRE — обычные (неспециальные) символы и поэтому должны быть экранированы, чтобы JS не придал им значения. */
const JS_META = new Set(['\\', '^', '$', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|'])

/**
 * Переводит один шаблон BRE в исходный текст JS RegExp — см. заметку в шапке файла про область
 * поддержанных конструкций. `^`/`$` — якоря ТОЛЬКО на самом старте/конце шаблона (в BRE это
 * условие их «особости»; в остальных позициях — обычные символы, target.md, опасное место 2: не
 * упомянуто прямо, но общее правило BRE и не противоречит ни одному прогону раздела).
 */
export function translateBrePattern(pattern: string): BreResult {
  let out = ''
  let i = 0
  let groupDepth = 0
  const n = pattern.length

  while (i < n) {
    const c = pattern[i]

    if (c === '\\') {
      const next = pattern[i + 1]
      if (next === undefined) return { ok: false, kind: 'trailingBackslash' }
      if (next === '.') {
        out += '\\.'
        i += 2
        continue
      }
      if (next === '+') {
        out += '+'
        i += 2
        continue
      }
      if (next === '|') {
        out += '|'
        i += 2
        continue
      }
      if (next === '(') {
        out += '('
        groupDepth++
        i += 2
        continue
      }
      if (next === ')') {
        if (groupDepth === 0) return { ok: false, kind: 'unmatchedParen' }
        out += ')'
        groupDepth--
        i += 2
        continue
      }
      // Любая другая экранированная последовательность (\?, \{…\}, \w, \<, \b, \1, \* и т.п.) —
      // вне области (target.md, «Что НЕ входит»): не пытаемся угадать её смысл.
      return { ok: false, kind: 'outOfScope' }
    }

    if (c === '[') {
      const bracket = parseBracket(pattern, i)
      if (!bracket.ok) return bracket
      out += bracket.jsSource
      i = bracket.nextIndex
      continue
    }

    if (c === '^') {
      out += i === 0 ? '^' : '\\^'
      i++
      continue
    }
    if (c === '$') {
      out += i === n - 1 ? '$' : '\\$'
      i++
      continue
    }
    if (c === '.') {
      out += '.'
      i++
      continue
    }
    if (c === '*') {
      // Литерал в самом начале шаблона (BRE: "*" ничего не может повторять первым символом) —
      // не встречается ни в одном прогоне раздела, но обрабатывается для честности.
      out += i === 0 ? '\\*' : '*'
      i++
      continue
    }
    if (c === '(' || c === ')') {
      // Голые скобки — обычные символы в BRE (target.md, опасное место 2: «в BRE '(' — обычный
      // символ»), в отличие от ERE/JS, где они образуют группу.
      out += '\\' + c
      i++
      continue
    }
    if (JS_META.has(c)) {
      out += '\\' + c
      i++
      continue
    }
    out += c
    i++
  }

  if (groupDepth !== 0) return { ok: false, kind: 'unmatchedParen' }
  return { ok: true, source: out }
}

/** Экранирует ВСЕ JS-метасимволы — для `-F` (буквальный поиск, target.md: «искать буквально»). */
export function escapeFixedString(pattern: string): string {
  let out = ''
  for (const c of pattern) out += JS_META.has(c) ? '\\' + c : c
  return out
}

export interface GrepOptions {
  ignoreCase: boolean
  fixedStrings: boolean
  wordRegexp: boolean
}

export type PatternCompileResult = { ok: true; regex: RegExp } | { ok: false; kind: BreErrorKind }

/**
 * Собирает итоговый RegExp из шаблона и флагов. `-w` оборачивает результат границами слова (target.md:
 * `-n -w card` находит только `app.js:3`) — тот же приём, что и настоящий git (`\<…\>` вокруг шаблона).
 *
 * Правило области «шаблон, который может совпасть с пустой строкой» (target.md, «Что НЕ входит»):
 * после сборки регулярного выражения проверяется `regex.test('')` — если да, вызывающий код
 * (searchCommands.ts) должен отказать по правилу области, а не выполнять поиск (правило
 * проверяемо буквально так, как сформулировано в target.md). Эта функция сама не решает, что
 * делать при совпадении с пустой строкой — только компилирует шаблон; проверку делает вызывающий
 * код, потому что применяется она только к НЕ `-F` шаблонам (при `-F` совпадение с пустой строкой
 * возможно только для буквально пустого шаблона, что вне тестируемых сценариев раздела).
 */
export function compilePattern(pattern: string, opts: GrepOptions): PatternCompileResult {
  let source: string
  if (opts.fixedStrings) {
    source = escapeFixedString(pattern)
  } else {
    const translated = translateBrePattern(pattern)
    if (!translated.ok) return translated
    source = translated.source
  }
  if (opts.wordRegexp) source = `\\b(?:${source})\\b`
  try {
    return { ok: true, regex: new RegExp(source, opts.ignoreCase ? 'i' : '') }
  } catch {
    // Не встречается ни в одном сверенном сценарии раздела (translateBrePattern уже отсекает
    // некорректные конструкции раньше) — оставлено как честный запасной выход, а не падение.
    return { ok: false, kind: 'invalidRegex' }
  }
}

export interface GrepMatch {
  file: string
  /** Номер строки, считая с 1. */
  line: number
  content: string
}

const utf8 = new TextEncoder()

/**
 * Сравнение имён по байтам UTF-8, как сортирует пути git (cache-entry/df-conflict, memcmp). Обычный
 * `sort()` JS сравнивает кодовые единицы UTF-16 и ставит символы вне BMP (суррогаты D800–DFFF)
 * раньше символов U+E000–U+FFFF, тогда как в UTF-8 порядок обратный (сверено на git 2.53.0).
 */
export function compareBytes(a: string, b: string): number {
  const x = utf8.encode(a)
  const y = utf8.encode(b)
  const n = Math.min(x.length, y.length)
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) return x[i] - y[i]
  }
  return x.length - y.length
}

/** Имена файлов дерева в порядке байтов имени (target.md, опасное место 6). */
export function sortedFileNames(tree: FileTree): string[] {
  return Object.keys(tree).sort(compareBytes)
}

/** Строки файла — как в `cat -n` (target.md, «Исходное состояние»): содержимое хранится без завершающего перевода строки (тот же приём, что и в inspectDiff.ts, splitContentLines), поэтому `content.split('\n')` даёт ровно видимые строки файла, без «лишней» пустой строки в конце. */
export function fileLines(tree: FileTree, file: string): string[] {
  return has(tree, file) ? tree[file].split('\n') : []
}

/**
 * Ищет `regex` по перечисленным файлам дерева `tree` (или по всем файлам дерева, если `files` не
 * передан) — по одной строке за раз, без флагов, влияющих на ФОРМАТ вывода (тех решает
 * searchCommands.ts). Порядок — по файлам (байты имени, в том числе для явного списка), внутри файла — по возрастанию номера строки.
 */
export function grepTree(tree: FileTree, regex: RegExp, files?: readonly string[]): GrepMatch[] {
  // Явный список путей git тоже обходит в порядке байтов имени и без повторов (сверено на git 2.53.0).
  const names = (files ? [...new Set(files)].sort(compareBytes) : sortedFileNames(tree)).filter((f) => has(tree, f))
  const matches: GrepMatch[] = []
  names.forEach((file) => {
    fileLines(tree, file).forEach((content, idx) => {
      if (regex.test(content)) matches.push({ file, line: idx + 1, content })
    })
  })
  return matches
}
