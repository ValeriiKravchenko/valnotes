// ============================================================
// Общая граница области: когда форма команды НЕ разбирается тренажёром, но настоящий git её
// принимает, ответ — честный отказ (target.md, часть III, правило 1), а не выдуманная ошибка git.
//
// Модуль только КЛАССИФИЦИРУЕТ ввод. Он ничего не печатает пользователю: тексты отказов живут
// в словаре (locales/ru.ts) и подбираются вызывающим кодом раздела по результату классификации.
// Единственная строка здесь — дословный текст git для заведомо несуществующей опции `log`
// (git-вывод остаётся английским литералом в движке, см. шапку ru.ts).
//
// Состояния нет, обращений к DOM/сети/времени нет: все функции чистые.
//
// Общее правило для ссылок, путей и аргументов: если ввод опознан и разбирается разделом —
// результат прежний («plain»/«inGrammar»), и если дальше команда не нашла объект, то это настоящая
// ошибка git (`HEAD~9` за корнем, несуществующее имя ветки). Если ввод опознан как синтаксис git,
// которого раздел не разбирает, — «foreign»: отказ. При сомнении — «foreign».
// ============================================================

// ---------- ссылки на коммиты ----------

/** Что раздел умеет разбирать в ссылке (то же, что умеет его резолвер ссылок). */
export interface RefGrammar {
  /** `A..B`: обе стороны непустые. Без этого любая `..` в токене — чужой синтаксис. */
  range: boolean
  /** Оператор `^` (первый родитель). */
  caret: boolean
  /** Наибольшее N у `^N`, которое резолвер разбирает: 1 — только первый родитель. */
  caretMax: number
  /** Оператор `~` / `~N`. */
  tilde: boolean
  /** С чем допустимы операторы: только с `HEAD` или с любой базой (ветка, хэш). */
  operatorBase: 'head' | 'any'
  /** Допустима цепочка из нескольких операторов (`HEAD~1^`, `HEAD~~`). */
  chains: boolean
  /** Допустим оператор без числа (`HEAD~`, `HEAD^`): иначе число обязательно (`HEAD~2`). */
  bareOperator: boolean
  /** `X@{0}` как тривиальный частный случай: значение X само по себе. Любое другое `@{…}` — чужое. */
  atZero: boolean
}

/**
 * Исход классификации одного токена-ссылки:
 * - `plain` — обычное имя без синтаксиса ревизий (ветка, хэш, файл). Если резолвер его не нашёл,
 *   это настоящая ошибка git;
 * - `inGrammar` — синтаксис ревизий, который раздел разбирает. Если резолвер не нашёл объект
 *   (например, `HEAD~9` за корнем), это настоящая ошибка git;
 * - `foreign` — синтаксис ревизий, которого раздел не разбирает. Всегда отказ.
 */
export type RefTokenClass = 'plain' | 'inGrammar' | 'foreign'

/** Раздел 3: `^`, `~N`, цепочки, любая база, `A..B`, `X@{0}`; `^N` при N > 1 (второй родитель) — вне области. */
export const INSPECT_REF_GRAMMAR: RefGrammar = {
  range: true,
  caret: true,
  caretMax: 1,
  tilde: true,
  operatorBase: 'any',
  chains: true,
  bareOperator: true,
  atZero: true,
}

/** Раздел 4: только `HEAD~N` с обязательным числом, без `^`, цепочек и диапазонов. */
export const UNDO_REF_GRAMMAR: RefGrammar = {
  range: false,
  caret: false,
  caretMax: 0,
  tilde: true,
  operatorBase: 'head',
  chains: false,
  bareOperator: false,
  atZero: false,
}

/** Раздел 5: ни одного оператора ревизий — только `HEAD`, имя ветки или хэш. */
export const REMOTE_REF_GRAMMAR: RefGrammar = {
  range: false,
  caret: false,
  caretMax: 0,
  tilde: false,
  operatorBase: 'head',
  chains: false,
  bareOperator: false,
  atZero: false,
}

/** Раздел 6: `^`, `~N`, цепочки, любая база; без диапазонов и `@{…}`. */
export const SEARCH_REF_GRAMMAR: RefGrammar = {
  range: false,
  caret: true,
  caretMax: 1,
  tilde: true,
  operatorBase: 'any',
  chains: true,
  bareOperator: true,
  atZero: false,
}

/** Символы, по которым токен перестаёт быть обычным именем и становится выражением ревизии. */
const REVISION_SYNTAX = /[~^@:{}]/

const AT_ZERO = /^(.+)@\{0\}$/
const OPERATOR_CHAIN = /^([^~^]+)((?:[~^]\d*)*)$/

/** Один оператор `^`/`~` с необязательным числом. */
function operatorAllowed(op: string, grammar: RefGrammar): boolean {
  const digits = op.slice(1)
  if (digits === '' && !grammar.bareOperator) return false
  if (op[0] === '^') {
    if (!grammar.caret) return false
    const n = digits === '' ? 1 : Number(digits)
    return n <= grammar.caretMax
  }
  return grammar.tilde
}

/** Одна ссылка (без `..`). */
function classifySingleRef(token: string, grammar: RefGrammar): RefTokenClass {
  if (!REVISION_SYNTAX.test(token)) return 'plain'

  let ref = token
  const atZero = AT_ZERO.exec(token)
  if (atZero) {
    if (!grammar.atZero) return 'foreign'
    ref = atZero[1]
    // База перед `@{0}` сама не должна содержать `@`/`{`/`}`/`:`: `a@{0}@{0}` и подобное — чужое.
    if (/[@:{}]/.test(ref)) return 'foreign'
  } else if (/[@:{}]/.test(token)) {
    return 'foreign'
  }

  const parsed = OPERATOR_CHAIN.exec(ref)
  if (!parsed) return 'foreign'
  const [, base, opsRaw] = parsed
  const ops = opsRaw.match(/[~^]\d*/g) ?? []
  if (ops.length === 0) return 'inGrammar'
  if (grammar.operatorBase === 'head' && base !== 'HEAD') return 'foreign'
  if (ops.length > 1 && !grammar.chains) return 'foreign'
  return ops.every((op) => operatorAllowed(op, grammar)) ? 'inGrammar' : 'foreign'
}

/**
 * Классифицирует токен-ссылку для раздела с грамматикой `grammar`.
 * `A..B`: сторона пустая (`HEAD~1..`, `..HEAD`) или любая сторона — чужая, значит всё чужое;
 * `A...B` всегда чужое. Имена внутри диапазона (`a..b`) — обычные: если их нет, это настоящая
 * ошибка git.
 */
export function classifyRefToken(token: string, grammar: RefGrammar): RefTokenClass {
  if (token.includes('...')) return 'foreign'
  const dots = token.indexOf('..')
  if (dots === -1) return classifySingleRef(token, grammar)
  if (!grammar.range) return 'foreign'
  const left = token.slice(0, dots)
  const right = token.slice(dots + 2)
  if (left === '' || right === '' || right.includes('..')) return 'foreign'
  const parts = [classifySingleRef(left, grammar), classifySingleRef(right, grammar)]
  if (parts.includes('foreign')) return 'foreign'
  return 'inGrammar'
}

// ---------- refspec у git push ----------

/**
 * Позиционный аргумент `git push <сервер> <это>`. Голое имя ветки и `HEAD` — обычные.
 * `<src>:<dst>`, `:<dst>`, `+<ветка>`, `refs/…`, шаблон с `*` и любое выражение ревизии — формы,
 * которые git принимает, а тренажёр не разбирает.
 */
export function classifyPushRefspec(arg: string): 'plain' | 'foreign' {
  if (arg === 'HEAD') return 'plain'
  if (arg.startsWith('+') || arg.startsWith('refs/')) return 'foreign'
  if (arg.includes(':') || arg.includes('*')) return 'foreign'
  if (REVISION_SYNTAX.test(arg)) return 'foreign'
  return 'plain'
}

// ---------- адрес репозитория у clone/fetch/push/pull ----------

/**
 * Аргумент-«откуда/куда»:
 * - `plain` — имя без слэшей и точек в начале (`origin`, `nosuch`): неизвестное имя — настоящая
 *   ошибка git;
 * - `url` — адрес по сети или ssh (`https://…`, `git@…`, `ssh://…`, `git://…`, `file://…`);
 * - `pathLike` — путь (`/team/origin`, `./origin`, `../origin`, `origin/`, `~/x`): git его принимает,
 *   тренажёр файловую систему не моделирует.
 */
export function classifyRepositoryArgument(arg: string): 'plain' | 'url' | 'pathLike' {
  if (/^(https?|ssh|git|file):\/\//i.test(arg) || /^[^/\s]+@[^/\s]+:/.test(arg)) return 'url'
  if (arg.includes('/') || arg.startsWith('.') || arg.startsWith('~')) return 'pathLike'
  return 'plain'
}

// ---------- pathspec ----------

/** Что раздел умеет в pathspec: глоб (`*`, `?`, `[…]`) разбирает только раздел 1. */
export interface PathspecGrammar {
  globs: boolean
}

/**
 * Один pathspec-аргумент. `plain` — голое имя файла (и `.`), которое раздел сопоставляет сам.
 * `foreign`: путь с `./`/`../` в начале, магия pathspec (`:(glob)…`, `:!x`),
 * а там, где глоб не разбирается, — символы `*`, `?`, `[` и экранирование `\`.
 */
export function classifyPathspec(token: string, grammar: PathspecGrammar): 'plain' | 'foreign' {
  if (token === '.') return 'plain'
  if (token === '..' || token.startsWith('./') || token.startsWith('../')) return 'foreign'
  if (token.startsWith(':')) return 'foreign'
  // Экранирование и глоб — часть одного механизма: где глоб разбирается, там разбирается и "\\".
  if (!grammar.globs && /[*?[\\]/.test(token)) return 'foreign'
  return 'plain'
}

// ---------- git init ----------

/** `git init` раздела 1 разбирает только голую команду: любой аргумент (папка, `-b`, `--bare`, `-q`) — чужой. */
export function classifyInitArguments(args: readonly string[]): 'none' | 'foreign' {
  return args.length === 0 ? 'none' : 'foreign'
}

/** Длинные опции git init (сверено на git 2.53.0: `git init --git-completion-helper`, 06.10.2026), без `--`. */
const INIT_LONG_OPTIONS = ['template', 'bare', 'shared', 'quiet', 'separate-git-dir', 'initial-branch', 'object-format', 'ref-format']
const INIT_NEGATABLE = INIT_LONG_OPTIONS.filter((o) => o !== 'shared')
const INIT_ALL_LONG = [...INIT_LONG_OPTIONS, ...INIT_NEGATABLE.map((o) => `no-${o}`)]
/** Длинные опции, которые забирают значение следующим токеном (если оно не приклеено через «=»). */
const INIT_LONG_WITH_VALUE = ['template', 'separate-git-dir', 'initial-branch', 'object-format', 'ref-format']
/**
 * Возможности parse-options, которых нет в списке `--git-completion-helper`: справка, перечень опций,
 * конец опций. Их git обрабатывает особо (справка, значения-«опции» после `--end-of-options`), поэтому
 * при встрече любой из них раздел 1 ничего не утверждает про остальные токены — честный отказ области.
 */
const INIT_SPECIAL_LONG = ['help', 'help-all', 'git-completion-helper', 'end-of-options']
/** Короткие опции git init: -q, -b (берёт значение), -h (справка). */
const INIT_SHORT_OPTIONS = 'qbh'

/**
 * Первая заведомо несуществующая опция `git init` — строка вида «error: unknown option `x'» (длинная)
 * или «error: unknown switch `x'» (короткая, в том числе внутри кластера `-qZ`); `null`, если таких нет
 * ИЛИ если уверенности нет (тогда вызывающий код даёт честный отказ области, второй ответ правила 1).
 *
 * Разбор идёт по порядку, как у git: первая плохая опция выигрывает. Токены, которые опция забирает
 * как значение (`-b main`, `--initial-branch main`, `--template dir`, `--object-format sha1` и т.д.),
 * опциями не считаются. Сомнительные формы — `-h`, `--help`, `--help-all`, `--git-completion-helper`,
 * `--end-of-options`, неоднозначное сокращение, опция с обязательным значением без значения — дают
 * `null`. Длинное имя, которое является началом какой-либо настоящей опции (сокращение), несуществующим
 * не считается: git его разберёт, а раздел 1 — нет. После `--` опций нет. Значение после `=` остаётся
 * в тексте ошибки, как у git. Сверено на git 2.53.0, 06.10.2026.
 */
export function findUnknownInitOption(args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (token === '--') return null
    if (token.startsWith('--')) {
      const name = token.slice(2).split('=')[0]
      const hasValue = token.includes('=')
      if (name === '') continue
      if (INIT_SPECIAL_LONG.includes(name)) return null
      const exact = INIT_ALL_LONG.includes(name)
      const candidates = exact ? [name] : INIT_ALL_LONG.filter((o) => o.startsWith(name))
      if (candidates.length === 0) return `error: unknown option \`${token.slice(2)}'`
      if (candidates.length > 1) return null // неоднозначное сокращение: ответ git зависит от пары кандидатов
      if (INIT_LONG_WITH_VALUE.includes(candidates[0]) && !hasValue) {
        if (i + 1 >= args.length) return null // «requires a value»
        i++ // следующий токен — значение, а не опция
      }
      continue
    }
    if (token.startsWith('-') && token.length > 1) {
      const letters = token.slice(1)
      for (let j = 0; j < letters.length; j++) {
        const letter = letters[j]
        if (letter === 'h') return null
        if (!INIT_SHORT_OPTIONS.includes(letter)) return `error: unknown switch \`${letter}'`
        if (letter === 'b') {
          if (j < letters.length - 1) break // остаток токена — значение
          if (i + 1 >= args.length) return null // «requires a value»
          i++ // следующий токен — значение
          break
        }
      }
    }
  }
  return null
}

// ---------- git blame ----------

export type BlameForeignForm = 'repeatedLineRange' | 'gluedLineRange' | 'revisionBeforeFile'

/** Что вызывающий код знает о состоянии: нужно, чтобы отличить ревизию перед файлом от второго файла. */
export interface BlameContext {
  isTrackedFile: (name: string) => boolean
  isRevision: (name: string) => boolean
}

/**
 * Формы `git blame`, которые git принимает, а тренажёр нет: повтор `-L` (git объединяет диапазоны),
 * значение, приклеенное к флагу (`-L5,5`), и ревизия перед файлом (`blame HEAD app.js`).
 * Два позиционных аргумента, где первый — отслеживаемый файл (`blame app.js utils.js`), сюда не
 * попадают: там настоящая ошибка git. `null` — ничего чужого, дальше работает обычная логика.
 */
export function classifyBlameForm(tokens: readonly string[], context: BlameContext): BlameForeignForm | null {
  let lCount = 0
  const positionals: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '--') {
      positionals.push(...tokens.slice(i + 1))
      break
    }
    if (t === '-L') {
      lCount++
      i++
      continue
    }
    if (/^-L./.test(t)) return 'gluedLineRange'
    if (t.startsWith('-')) continue
    positionals.push(t)
  }
  if (lCount > 1) return 'repeatedLineRange'
  if (positionals.length >= 2) {
    const first = positionals[0]
    if (!context.isTrackedFile(first) && context.isRevision(first)) return 'revisionBeforeFile'
  }
  return null
}

// ---------- опции ----------

/** Что известно об опциях команды в разделе. */
export interface OptionSpec {
  /** Опции, которые раздел разбирает (в нормальной форме, длинные без `=значение`). */
  inScope: readonly string[]
  /** Опции, которые настоящий git принимает (сверено с `git <cmd> -h` и `--git-completion-helper`). */
  verifiedReal: readonly string[]
  /**
   * Список `verifiedReal` исчерпывающий: любая опция вне него заведомо не существует. Для команд,
   * у которых полный список получить нельзя (`log`, `show`, `diff`), — `false`.
   */
  exhaustive: boolean
  /** Опции, про которые прогоном git установлено, что их нет, хотя список неисчерпывающий. */
  knownAbsent?: readonly string[]
}

/**
 * - `scope` — раздел разбирает опцию;
 * - `refuse` — git принимает или может принимать, раздел не разбирает: честный отказ;
 * - `unknown` — заведомо несуществующая опция: настоящая ошибка git.
 */
export type OptionClass = 'scope' | 'refuse' | 'unknown'

/** `--имя=значение` -> `--имя`; короткие опции остаются как есть. */
function optionName(token: string): string {
  return token.startsWith('--') ? token.split('=')[0] : token
}

/** При сомнении (список неисчерпывающий и опции в нём нет) — `refuse`, а не `unknown`. */
export function classifyOptionToken(token: string, spec: OptionSpec): OptionClass {
  const name = optionName(token)
  if (spec.inScope.includes(name)) return 'scope'
  if (spec.knownAbsent?.includes(name)) return 'unknown'
  if (spec.verifiedReal.includes(name)) return 'refuse'
  return spec.exhaustive ? 'unknown' : 'refuse'
}

/** Дословный ответ git на заведомо несуществующую длинную опцию `git log` (проверено на git 2.53.0: `git log --one`). */
export function gitUnrecognizedArgument(token: string): string {
  return `fatal: unrecognized argument: ${token}`
}
