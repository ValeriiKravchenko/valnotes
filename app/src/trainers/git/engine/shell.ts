// ============================================================
// Раздел 1 git-тренажёра: шелл — первый из двух этапов разбора командной
// строки терминала (см. target.md, «Граница: где шелл, а где git»).
//
// Этот модуль отвечает только за то, что делает bash ДО того, как git вообще
// узнаёт о вводе: разбивает строку на слова, снимает кавычки, раскрывает "*".
// Про подкоманды git, флаги и пути в репозитории он не знает ничего —
// commands.ts (git-сторона) получает от него уже готовый список аргументов
// и не в курсе, как тот получился. Эта граница — главное, чему учит раздел,
// поэтому она проведена по файлам, а не спрятана внутри одной функции.
// ============================================================
import { ru } from '../locales/ru'

/** Одно слово командной строки после разбора шеллом. */
export interface ShellToken {
  /** Итоговый текст слова — то, что получит git. */
  text: string
  /**
   * Было ли слово (хотя бы частично) заключено в кавычки. Нужно только
   * git commit -m, чтобы честно решить, показывать ли подсказку про
   * кавычки (target.md, A8), не угадывая её по положению слова.
   */
  quoted: boolean
  /**
   * Слово — шаблон с незакавыченными "*", "?" или "[…]" (например "*.html"),
   * который настоящий bash раскрыл бы по маске, а этот шелл не умеет (target.md,
   * часть III, правило 1 — граница касается и сценариев шелла, не только
   * git). Раскрывается только "голая" "*" целиком словом — см. shellTokenize.
   * Дальше по пайплайну это честно превращается в отказ «шелл это умеет,
   * здесь не разбирается», а НЕ в придуманную ошибку git про опечатку
   * в имени файла.
   */
  unsupportedGlob?: boolean
}

const WHITESPACE = /\s/

/** Незакавыченные "*", "?" и класс "[…]": то, что bash раскрыл бы по маске. */
const GLOB_CHARS = /[*?]|\[[^\]]+\]/

/**
 * Разбивает строку на слова так, как это делает bash: пробелы разделяют
 * слова, кавычками считаются только прямые `"` и `'` (target.md, A7 —
 * типографские «„“”«»» обычные символы и частью кавычек не считаются).
 * Значение в кавычках может быть приклеено к соседнему незакавыченному
 * тексту внутри одного слова (target.md, A6: `-m"текст"` — одно слово).
 *
 * Незакрытая кавычка не бросает исключение: берётся всё до конца строки.
 * До этого разбора строка с незакрытой кавычкой не доходит — её отсекает
 * findShellRefusal, поэтому это лишь страховка для прямых вызовов.
 */
interface RawWord extends ShellToken {
  /** Только незакавыченные символы слова: именно их bash проверяет на маски. */
  bare: string
}

function splitWords(input: string): RawWord[] {
  const words: RawWord[] = []
  let i = 0
  const n = input.length
  while (i < n) {
    while (i < n && WHITESPACE.test(input[i])) i++
    if (i >= n) break
    let text = ''
    let bare = ''
    let quoted = false
    while (i < n && !WHITESPACE.test(input[i])) {
      const c = input[i]
      if (c === '"' || c === "'") {
        quoted = true
        const quote = c
        i++
        const start = i
        while (i < n && input[i] !== quote) i++
        text += input.slice(start, i)
        if (i < n) i++ // закрывающая кавычка
      } else {
        text += c
        bare += c
        i++
      }
    }
    words.push({ text, quoted, bare })
  }
  return words
}

/** Файлы, по которым раскрывается "*" (target.md, A4): без скрытых (имя начинается с точки). */
function visibleFiles(workingFiles: string[]): string[] {
  return workingFiles.filter((f) => !f.startsWith('.')).sort()
}

/**
 * Единственная точка входа шелла: строка терминала → список аргументов,
 * которые получит git (target.md, «Граница…»).
 *
 * "*" раскрывается, только если слово набрано ЦЕЛИКОМ как один
 * незакавыченный символ "*" — это и есть то, что раскрывает настоящий bash
 * (glob работает над отдельным словом целиком, а кавычки его отключают).
 * Раскрывается в список файлов РАБОЧЕГО ДЕРЕВА на момент вызова команды,
 * без скрытых и без удалённых (их там просто нет — см. workingFiles).
 * Если совпадений нет, git получает литеральную строку "*" — ровно так же,
 * как настоящий bash передаёт нераскрывшийся паттерн команде "как есть"
 * (nullglob по умолчанию выключен).
 *
 * Шаблоны вроде "*.txt", "?.txt", "[ab].txt" (не голая "*", а маска) этот шелл не раскрывает —
 * настоящий bash раскрыл бы их в список подходящих файлов рабочего дерева. Вместо того чтобы
 * тихо передать git буквальную строку (что дальше по цепочке выглядело бы как опечатка в имени
 * файла — target.md, часть III, правило 1), такое слово помечается `unsupportedGlob:
 * true`: дальше по пайплайну (см. commands.ts) это превращается в честный отказ «шелл это умеет,
 * здесь не разбирается», а не в придуманную ошибку git.
 */
export function shellTokenize(input: string, workingFiles: string[]): ShellToken[] {
  const words = splitWords(input)
  const tokens: ShellToken[] = []
  words.forEach(({ bare, ...w }) => {
    if (!w.quoted && w.text === '*') {
      const files = visibleFiles(workingFiles)
      const expanded = files.length ? files : ['*']
      expanded.forEach((f) => tokens.push({ text: f, quoted: false }))
    } else if (GLOB_CHARS.test(bare)) {
      tokens.push({ ...w, unsupportedGlob: true })
    } else {
      tokens.push(w)
    }
  })
  return tokens
}

/** Короткий путь для мест, которым не нужна информация про кавычки (init/status/add, диспетчер). */
export function shellWords(input: string, workingFiles: string[]): string[] {
  return shellTokenize(input, workingFiles).map((t) => t.text)
}

// ------------------------------------------------------------
// Конструкции bash, которые тренажёр не разбирает так, как bash: они получают отказ
// с TRAINER_MARKER ДО разбора на слова, а не выдуманную ошибку git. Сверено на bash 5
// прогоном printf '[%s]' (каталог mktemp -d, подменённый HOME).
//
// Вне кавычек отказ даёт: "\", операторы ; & | < > ( ), подстановки ($имя, ${…}, $(…),
// обратная кавычка, "~" и "#" в начале слова, {a,b} и {1..3}). В одинарных кавычках
// bash не меняет ничего — проверки нет. В двойных bash снимает косую только перед \ " $
// и обратной кавычкой, остальные "\x" остаются как есть (на этом держится git add "\*.txt"),
// и подставляет $…; поэтому отказ только на них. Незакрытая кавычка — тоже отказ:
// bash ждал бы продолжения ввода, а у терминала одна строка.
// ------------------------------------------------------------

export type ShellRefusal =
  | { kind: 'operator'; fragment: string }
  | { kind: 'backslash' }
  | { kind: 'expansion'; fragment: string }
  | { kind: 'quotedEscape'; fragment: string }
  | { kind: 'unclosedQuote' }

const OPERATOR_CHARS = new Set([';', '&', '|', '<', '>', '(', ')'])
const DOUBLED_OPERATORS = new Set(['&', '|', '<', '>'])
/** После "$" bash видит подстановку: имя, цифра, "{", "(", специальный параметр, "$'…'", '$"…"'. */
const DOLLAR_NEXT = /[A-Za-z_0-9{(@*#?!$'"-]/
/** Внутри "…" косую bash снимает только перед этими символами. */
const DQ_ESCAPABLE = new Set(['\\', '"', '$', '`'])
const BACKTICK = '`'

/** Слово от позиции i до ближайшего пробела: для показа игроку. */
function wordFrom(raw: string, i: number): string {
  let j = i
  while (j < raw.length && !WHITESPACE.test(raw[j])) j++
  return raw.slice(i, j)
}

/** Первая "скобочная" подстановка {a,b} или {1..3} с позиции i (raw[i] === '{'), иначе null. */
function braceExpansionAt(raw: string, i: number): string | null {
  const close = raw.indexOf('}', i)
  if (close < 0) return null
  const inner = raw.slice(i + 1, close)
  if (/\s/.test(inner)) return null
  if (inner.includes(',') || /[^.]\.\.[^.]/.test(inner)) return raw.slice(i, close + 1)
  return null
}

/**
 * Первая конструкция, которую bash обработал бы сам, а тренажёр не умеет, — слева направо
 * по сырой строке; `null`, если таких нет.
 */
export function findShellRefusal(raw: string): ShellRefusal | null {
  const n = raw.length
  let i = 0
  let wordStart = true
  while (i < n) {
    const c = raw[i]
    if (WHITESPACE.test(c)) {
      wordStart = true
      i++
      continue
    }
    if (c === "'") {
      const close = raw.indexOf("'", i + 1)
      if (close < 0) return { kind: 'unclosedQuote' }
      i = close + 1
      wordStart = false
      continue
    }
    if (c === '"') {
      i++
      let closed = false
      while (i < n) {
        const d = raw[i]
        if (d === '"') {
          closed = true
          i++
          break
        }
        if (d === '\\' && i + 1 < n && DQ_ESCAPABLE.has(raw[i + 1])) {
          return { kind: 'quotedEscape', fragment: raw.slice(i, i + 2) }
        }
        if (d === BACKTICK || (d === '$' && i + 1 < n && DOLLAR_NEXT.test(raw[i + 1]) && raw[i + 1] !== '"' && raw[i + 1] !== "'")) {
          return { kind: 'expansion', fragment: wordFrom(raw, i) }
        }
        i++
      }
      if (!closed) return { kind: 'unclosedQuote' }
      wordStart = false
      continue
    }
    if (c === '\\') return { kind: 'backslash' }
    if (OPERATOR_CHARS.has(c)) {
      const doubled = DOUBLED_OPERATORS.has(c) && raw[i + 1] === c
      return { kind: 'operator', fragment: doubled ? c + c : c }
    }
    if (c === BACKTICK || (c === '$' && i + 1 < n && DOLLAR_NEXT.test(raw[i + 1]))) {
      return { kind: 'expansion', fragment: wordFrom(raw, i) }
    }
    if (wordStart && c === '#') return { kind: 'expansion', fragment: c }
    // "~имя" bash оставляет как есть, пока такого пользователя нет; раскрываются "~", "~/…", "~+", "~-".
    if (wordStart && c === '~' && (i + 1 >= n || WHITESPACE.test(raw[i + 1]) || '/+-'.includes(raw[i + 1]))) {
      return { kind: 'expansion', fragment: wordFrom(raw, i) }
    }
    if (c === '{') {
      const brace = braceExpansionAt(raw, i)
      if (brace !== null) return { kind: 'expansion', fragment: brace }
    }
    wordStart = false
    i++
  }
  return null
}

/** Текст отказа для найденной конструкции (словарь — locales/ru.ts, errors). */
export function shellRefusalText(refusal: ShellRefusal): string {
  switch (refusal.kind) {
    case 'operator':
      return ru.errors.shellOperatorUnsupported(refusal.fragment)
    case 'backslash':
      return ru.errors.shellBackslashUnsupported
    case 'expansion':
      return ru.errors.shellExpansionUnsupported(refusal.fragment)
    case 'quotedEscape':
      return ru.errors.shellQuotedEscapeUnsupported(refusal.fragment)
    case 'unclosedQuote':
      return ru.errors.shellQuoteUnclosed
  }
}
