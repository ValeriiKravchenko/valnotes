// ============================================================
// git-тренажёр: общий для раздела 1 (commands.ts) и раздела 2, шаг A
// (branchCommands.ts) механизм разбора флагов `git commit` — то, что
// реализовано БУКВАЛЬНО в обоих разделах (-a/--all, -m, склеенные формы
// "-am<текст>"/"-m<текст>", кластеры коротких опций), и правило «какие
// файлы стейджит -a». Живёт в одном месте, а не двумя независимыми
// копиями в commands.ts/parseCommitArgs и branchCommands.ts/handleCommit,
// чтобы следующая правка не могла разойтись между разделами.
//
// Оба раздела работают с одной и той же моделью FileTree (types.ts;
// branchTypes.ts её же реэкспортирует, а не заводит копию) и с одним и тем
// же настоящим git — поэтому и разбор флагов commit, и правило "-a" здесь
// одни на двоих. Различия между разделами (раздел 1 поддерживает
// pathspec/подсказку про забытые кавычки и продолжает разбирать флаги и
// после позиционного аргумента; раздел 2 останавливается на первом
// позиционном аргументе и pathspec вообще не поддерживает) — это НЕ разбор
// самих флагов, а то, что каждый раздел делает с результатом разбора,
// поэтому внешний цикл (что делать с "--"/позиционным токеном) остаётся в
// каждом разделе своим — сюда вынесена только классификация ОДНОГО токена.
// ============================================================
import type { ShellToken } from './shell'
import type { CommandResult, FileTree } from './types'
import { has } from './util'

/**
 * Результат разбора одного флагового токена `git commit`: "-a"/"--all" мог встретиться
 * (`stageAll`), "-m" мог встретиться со значением, приклеенным к тому же токену (`message`,
 * в т.ч. пустая строка — тоже валидное значение), или потребовать значение из СЛЕДУЮЩЕГО
 * токена (`needsMessageFromNextToken`) — вызывающая сторона сама решает, что делать со
 * следующим токеном (там же разница между разделами: у кого что считается «следующим»).
 */
export interface CommitFlagOutcome {
  stageAll: boolean
  message: { value: string; quoted: boolean } | null
  needsMessageFromNextToken: boolean
}

export type ClassifyCommitTokenResult =
  | { kind: 'separator' } // "--" — разделитель опций/pathspec, сам по себе не значит ничего
  | { kind: 'positional' } // не флаг вовсе (не начинается с "-", либо голый "-")
  | { kind: 'flag'; outcome: CommitFlagOutcome }
  | { kind: 'error'; result: CommandResult } // такого флага у commit нет, либо он реален, но не в области раздела

/**
 * Короткие буквы `git commit`, которые внутри кластера коротких опций забирают ОСТАТОК токена
 * как своё значение — как и "m" ниже, но эти буквы сама команда commit (ни один из разделов) не
 * реализует ни в каком виде. Сверено напрямую (git 2.53.0, 24.09.2026, `git commit -h`):
 * "F"/"c"/"C"/"t" — обязательное значение (без квадратных скобок в `-h`: "-F, --file <file>" и
 * т.п.), "u"/"S"/"U" — необязательное ("[<mode>]"/"[=<key-id>]"/у "U" на самом деле обязательное,
 * но остаток токена становится её значением так же, как у остальных). Общее для обоих разделов
 * (это свойство самой команды `git commit`, а не то, что каждый раздел реализует) — известна ли
 * КОНКРЕТНАЯ буква вообще (реальна она у git или нет) под свой раздел решает не этот список, а
 * `isRealShortFlag` (раздел 1 — REAL_GIT_OPTIONS.commit/scope.ts, раздел 2 —
 * COMMIT_OPTIONS/branchScope.ts), поэтому списки известных опций остаются каждый в одном месте.
 */
const COMMIT_SHORT_VALUE_LETTERS = new Set(['F', 'c', 'C', 't', 'u', 'S', 'U'])

/**
 * Классифицирует ОДИН токен `git commit` (target.md, A6/A8 — раздел 1; часть IV — раздел 2):
 * "--" — разделитель; "--all" — длинная форма "-a"; любая другая длинная опция ("--xxx") —
 * решает `onUnknownFlag` (у каждого раздела свой список реальных опций commit и свой текст
 * отказа, см. commands.ts/commitOptionError и branchCommands.ts/commit2OptionError); токен без
 * ведущего "-" (или голый "-") — позиционный аргумент, дальше него эта функция не смотрит.
 *
 * Короткий кластер разбирается ПОСИМВОЛЬНО, как parse-options.c настоящего git: 'a' — булев
 * флаг, ничего не потребляет, разбор кластера продолжается; 'm' ЗАБИРАЕТ ВЕСЬ ОСТАТОК токена
 * как своё значение (даже пустой остаток — тогда значение берётся из следующего токена) и
 * обрывает разбор этого токена — буквы после 'm' никогда не разбираются как отдельные флаги
 * (сверено напрямую, git 2.43+: `-ma` даёt сообщение "a", а не флаг "-a" вдобавок к "-m"; та же
 * модель верна и для "-am<текст>" — сначала 'a' как булев флаг, потом 'm' забирает остаток;
 * буква ПОСЛЕ 'm' — часть значения, никогда не флаг сама по себе, см. `-amq`, ниже).
 *
 * Любая ДРУГАЯ буква кластера (не "a"/"m") — если она в `COMMIT_SHORT_VALUE_LETTERS`, забирает
 * остаток токена как своё значение и обрывает разбор, как и "m" (parse-options.c ведёт себя так
 * же для любой опции с значением). Если же буква НЕ из `COMMIT_SHORT_VALUE_LETTERS`, но она
 * реальна (`isRealShortFlag`) — настоящий git просто принимает её и продолжает разбирать кластер
 * ДАЛЬШЕ (сверено напрямую, git 2.53.0, 24.09.2026: `git commit -qx` останавливается на "x"
 * ("error: unknown switch `x'"), а не на "q", хотя "-q" сама по себе тоже не реализована здесь) —
 * виновата первая ГЕНУИННО неизвестная буква, а не любая более ранняя реальная, но
 * нереализованная. Эта буква (`firstOtherRealFlag`) запоминается и ПОСЛЕ того, как в кластере
 * встретится 'm' — 'm' сама по себе не отменяет более раннюю реальную, но нереализованную букву:
 * `-qam`/`-sam`/`-iam`/`-eam`/`-aqm` содержат такую букву ДО (или между "a" и) 'm', и вместо
 * молчаливого «буква потерялась, коммит прошёл как обычный `-am`» честный отказ обязан сработать
 * на НЕЙ, ровно как если бы кластер оборвался на ней самой (сверено напрямую, git 2.53.0,
 * 25.09.2026: `-qam` — тихий коммит; `-sam` — коммит с трейлером "Signed-off-by"; `-iam` —
 * fatal, несовместимость "-i" и "-a"; `-eam` — открывает редактор; ни одно из этих поведений
 * здесь не реализовано, поэтому все четыре формы получают один и тот же честный отказ).
 *
 * `onUnknownFlag` во всех случаях получает ОДНУ букву ("-x"), а не многобуквенный кусок
 * токена — `isRealShortFlag`/`onUnknownFlag` у раздела 1 (commands.ts/classifyOption, scope.ts)
 * классифицируют флаги ПОЛНОСТЬЮ, не посимвольным кластером (в отличие от classifySection2Option
 * раздела 2, которая кластеры умеет) — многобуквенный кусок там означал бы всегда "unknown",
 * даже когда каждая буква по отдельности реальна; одна буква — общий знаменатель, который
 * правильно классифицируют оба раздела. Это огрубление (называет только ОДНУ из нескольких
 * реальных букв кластера, а не весь кластер целиком) не искажает смысл — называемая буква
 * действительно реальна (или действительно неизвестна), просто не единственная такая в кластере.
 *
 * Если кластер целиком состоит из "a"/реальных булевых букв (без "m" и без буквы со значением) —
 * если хоть одна такая "прочая" буква встретилась, это реальная возможность git (`onUnknownFlag`
 * получает ПЕРВУЮ из них), а если нет (только "a") — обычный разобранный флаг. Это тот же
 * `firstOtherRealFlag`, что и выше — проверяется и в конце кластера (буквы кончились раньше 'm'),
 * и сразу при встрече 'm' (см. код).
 */
export function classifyCommitFlagToken(
  token: ShellToken,
  isRealShortFlag: (letter: string) => boolean,
  onUnknownFlag: (flag: string) => CommandResult,
): ClassifyCommitTokenResult {
  const t = token.text
  if (t === '--') return { kind: 'separator' }
  if (t === '--all') return { kind: 'flag', outcome: { stageAll: true, message: null, needsMessageFromNextToken: false } }
  if (t.startsWith('--')) return { kind: 'error', result: onUnknownFlag(t) }
  if (!t.startsWith('-') || t.length <= 1) return { kind: 'positional' }

  const rest = t.slice(1)
  let stageAll = false
  let firstOtherRealFlag: string | null = null
  for (let j = 0; j < rest.length; j++) {
    const c = rest[j]
    if (c === 'a') {
      stageAll = true
      continue
    }
    if (c === 'm') {
      // Реальная, но нереализованная буква, встретившаяся РАНЬШЕ 'm' в этом же кластере
      // (firstOtherRealFlag), не должна теряться только потому, что 'm' обрывает разбор токена
      // первой: `-qam`/`-sam`/`-iam`/`-eam`/`-aqm` — все они содержат такую букву ДО 'm', и
      // честный отказ по ней обязан сработать так же, как если бы кластер оборвался на ней самой
      // (тот же текст, что уже даёт "-a -q -m" отдельными словами — см. ветку ниже, после цикла).
      if (firstOtherRealFlag !== null) return { kind: 'error', result: onUnknownFlag(firstOtherRealFlag) }
      const attached = rest.slice(j + 1)
      if (attached.length > 0) {
        return { kind: 'flag', outcome: { stageAll, message: { value: attached, quoted: token.quoted }, needsMessageFromNextToken: false } }
      }
      return { kind: 'flag', outcome: { stageAll, message: null, needsMessageFromNextToken: true } }
    }
    if (COMMIT_SHORT_VALUE_LETTERS.has(c)) {
      return { kind: 'error', result: onUnknownFlag('-' + c) }
    }
    if (!isRealShortFlag(c)) {
      return { kind: 'error', result: onUnknownFlag('-' + c) }
    }
    if (firstOtherRealFlag === null) firstOtherRealFlag = '-' + c
  }
  if (firstOtherRealFlag !== null) return { kind: 'error', result: onUnknownFlag(firstOtherRealFlag) }
  return { kind: 'flag', outcome: { stageAll, message: null, needsMessageFromNextToken: false } }
}

/** Одно значение "-m" вместе с тем, было ли слово, из которого оно взято, хотя бы частично в кавычках. */
export interface CommitMessagePart {
  value: string
  quoted: boolean
}

export interface CommitMessageResult {
  /** null — "-m" не встретился вообще (это ДРУГОЙ случай, чем пустое сообщение, данное явно). */
  message: string | null
  /** Первый непустой абзац — то, что настоящий git печатает в строке "[branch hash] <текст>" (%s). */
  summary: string
  /** Кавычки у ПОСЛЕДНЕГО "-m" со значением — нужно только разделу 1 для подсказки про забытые кавычки (target.md, A8). */
  messageQuoted: boolean
}

/**
 * cleanup=whitespace обрезает хвостовые пробелы И табы у каждой строки, ведущие не трогает
 * (сверено напрямую, git 2.53.0, 24.09.2026) — это дефолтный режим `--cleanup` для коммита
 * БЕЗ текстового редактора (`git help commit`: "default — same as strip if the message is to
 * be edited, otherwise whitespace"); у -m редактора нет, значит режим именно "whitespace", а не
 * "strip" (тот вырезал бы и строки, начинающиеся с "#" — сверено отдельно, что здесь это не так).
 */
function stripTrailingWhitespace(value: string): string {
  return value.replace(/[ \t]+$/, '')
}

/**
 * Несколько "-m" не перезаписывают друг друга, а склеиваются в абзацы через пустую строку
 * ("\n\n") — как несколько параграфов, введённых подряд в текстовом редакторе. Пустые значения
 * (в т.ч. состоящие целиком из пробелов/табов — после обрезки хвостовых становятся пустой
 * строкой) выпадают из склейки совсем, как будто их не было (сверено напрямую, git 2.53.0,
 * 24.09.2026: `-m a -m "" -m b` → "a\n\nb", ровно один перевод строки между абзацами, не два;
 * `-m " " -m x` → "x" без пустой строки на месте первого абзаца). Итоговая строка коммита
 * показывает только ПЕРВЫЙ абзац (сверено: `-m a -m b` печатает "[master xxx] a", а не "b" и не
 * оба сразу).
 */
export function buildCommitMessage(parts: CommitMessagePart[]): CommitMessageResult {
  if (!parts.length) return { message: null, summary: '', messageQuoted: false }
  const paragraphs = parts.map((p) => stripTrailingWhitespace(p.value)).filter((v) => v.trim() !== '')
  return { message: paragraphs.join('\n\n'), summary: paragraphs[0] ?? '', messageQuoted: parts[parts.length - 1].quoted }
}

/**
 * target.md, часть III (раздел 1) и часть IV, «Что входит в шаг A» (раздел 2): "-a" автоматически
 * стейджит модификации/удаления только УЖЕ ОТСЛЕЖИВАЕМЫХ файлов — git-commit(1): "new files you
 * have not told Git about are not affected". "Отслеживается" здесь означает "есть в ИНДЕКСЕ", а
 * не "есть в HEAD": файл, который git добавлением зафиксированного удаления вывел из индекса
 * (сценарий: коммит → удаление → git add → тот же файл пересоздан под тем же именем), для "-a" —
 * обычный неотслеживаемый файл ("??"), даже когда он всё ещё виден в HEAD (проверено напрямую,
 * git 2.53.0: после этого сценария `git commit -am` коммитит только ранее застейдженное удаление,
 * пересозданный файл остаётся "??" — новое содержимое НЕ попадает в коммит). Поэтому множество
 * "отслеживаемых" строится из ключей ТЕКУЩЕГО индекса, а не из объединения индекса и HEAD.
 */
export function applyStageAll(index: FileTree, working: FileTree): FileTree {
  const next: FileTree = { ...index }
  Object.keys(next).forEach((f) => {
    if (has(working, f)) next[f] = working[f]
    else delete next[f]
  })
  return next
}
