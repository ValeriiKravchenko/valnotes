// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): граница области (target.md,
// часть III, правило 1 — «тренажёр не притворяется, что знает то, чего не
// знает»; часть V — что входит и не входит именно в этот раздел).
//
// По образцу scope.ts/branchScope.ts, но свой набор команд (log/diff/show/
// status — не init/add/commit, как раздел 1, и не branch/checkout/merge, как
// раздел 2). REAL_GIT_COMMANDS/isGlobalGitOption/gitNotACommand переиспользуются
// напрямую из branchScope.ts (который сам переиспользует их из scope.ts) —
// это данные о настоящем git, а не о разделе 1 или 2 конкретно, дублировать
// их в третий раз означало бы одно и то же множество расходиться в трёх местах.
//
// Упрощение: в отличие от branchScope.ts здесь нет разбора сокращений длинных опций и
// кластеров коротких опций (кроме status) — списки опций ниже проверяются точным совпадением.
// Граница при этом честная: опция, которой нет ни в области, ни в сверенных списках git,
// получает отказ тренажёра; ошибкой git остаётся только то, что прогоном git установлено как
// несуществующее (SECTION3_KNOWN_ABSENT), и у status — всё вне исчерпывающего списка.
// ============================================================
export { GLOBAL_GIT_OPTIONS, isGlobalGitOption, REAL_GIT_COMMANDS, gitNotACommand } from './branchScope'

import { classifyOptionToken } from './outOfScopeForms'

/** git-подкоманды, которые раздел 3 реализует буквально. */
export const SECTION3_COMMANDS = ['log', 'diff', 'show', 'status'] as const
export type Section3Command = (typeof SECTION3_COMMANDS)[number]

export function isSection3Command(sub: string): sub is Section3Command {
  return (SECTION3_COMMANDS as readonly string[]).includes(sub)
}

/**
 * Настоящие опции команд раздела 3, которые он НЕ разбирает (второй ответ правила 1) — точное
 * совпадение, без сокращений (см. упрощение в шапке файла). Списки не исчерпывающие (как и
 * REAL_GIT_OPTIONS раздела 1/2, target.md A10) — покрывают то, что явно названо в target.md,
 * часть V, «Что НЕ входит», и соседние распространённые опции той же команды.
 */
export const SECTION3_REAL_OPTIONS: Record<Section3Command, readonly string[]> = {
  log: [
    '--graph',
    '--stat',
    '--shortstat',
    '--numstat',
    '-p',
    '-u',
    '--patch',
    '--author',
    '--since',
    '--until',
    '--before',
    '--after',
    '--all',
    '--decorate',
    '--follow',
    '--reverse',
    '--merges',
    '--no-merges',
    '--first-parent',
    '--pretty',
    '--format',
    '--name-only',
    '--name-status',
    '--abbrev-commit',
    '--no-abbrev-commit',
    '--source',
    '--grep',
  ],
  diff: [
    '-w',
    '--ignore-all-space',
    '--ignore-space-change',
    '-p',
    '-u',
    '--patch',
    '--no-color',
    '--color',
    '--word-diff',
    '--numstat',
    '--name-status',
    '--summary',
    '--shortstat',
    '--full-index',
    '-R',
    '-M',
    '-C',
    '--find-renames',
    '--find-copies',
    '--no-index',
    '--check',
    '--raw',
  ],
  show: [
    '--stat',
    '--name-only',
    '--name-status',
    '-p',
    '--patch',
    '--format',
    '--pretty',
    '--oneline',
    '--no-patch',
    '-s',
    '--abbrev-commit',
  ],
  status: [
    '-b',
    // "-sb" (S3-35) — настоящий git разбирает кластер по буквам ("-s" реализована, "-b" нет);
    // раздел 3 кластеры не разбирает (см. упрощение в шапке файла) и добавляет сюда только эту
    // конкретную форму литералом, чтобы не выдавать честную "настоящую возможность, здесь не
    // разбирается" за придуманную "неизвестную команду" — другие сочетания с "-s" в кластере
    // (например "-sz") этим списком не покрыты и текущей версией не проверялись.
    '-sb',
    '--branch',
    '--long',
    '--porcelain',
    '-v',
    '--verbose',
    '-u',
    '--untracked-files',
    '--ignored',
    '-z',
    '--null',
    '--show-stash',
    '--ahead-behind',
  ],
}

/**
 * Опции, которые настоящий git принимает у команд раздела 3: вывод `git <команда> -h`, вывод
 * `git <команда> --git-completion-helper` и кандидаты по документации, принятые git (сверено на
 * git 2.53.0, 04.10.2026). У log/show/diff список неисчерпывающий (revision.c и diff-options
 * принимают больше, чем печатает любой из этих источников), у status — исчерпывающий.
 */
export const VERIFIED_SECTION3_OPTIONS: Record<Section3Command, readonly string[]> = {
  log: [
    '--abbrev',
    '--abbrev-commit',
    '--after',
    '--all',
    '--ancestry-path',
    '--author',
    '--author-date-order',
    '--before',
    '--boundary',
    '--branches',
    '--cc',
    '--check',
    '--cherry-pick',
    '--children',
    '--clear-decorations',
    '--color',
    '--committer',
    '--date',
    '--date-order',
    '--decorate',
    '--decorate-refs',
    '--decorate-refs-exclude',
    '--dense',
    '--diff-filter',
    '--dirstat',
    '--extended-regexp',
    '--find-renames',
    '--first-parent',
    '--fixed-strings',
    '--follow',
    '--full-history',
    '--graph',
    '--grep',
    '--histogram',
    '--ignore-space-change',
    '--invert-grep',
    '--left-right',
    '--mailmap',
    '--max-count',
    '--merges',
    '--minimal',
    '--name-only',
    '--name-status',
    '--no-abbrev-commit',
    '--no-color',
    '--no-decorate',
    '--no-decorate-refs',
    '--no-decorate-refs-exclude',
    '--no-mailmap',
    '--no-merges',
    '--no-patch',
    '--no-quiet',
    '--no-source',
    '--no-use-mailmap',
    '--no-walk',
    '--notes',
    '--numstat',
    '--oneline',
    '--parents',
    '--patch',
    '--patience',
    '--pretty',
    '--quiet',
    '--raw',
    '--regexp-ignore-case',
    '--relative-date',
    '--remotes',
    '--reverse',
    '--shortstat',
    '--show-signature',
    '--simplify-by-decoration',
    '--since',
    '--skip',
    '--source',
    '--sparse',
    '--stat',
    '--stat-width',
    '--summary',
    '--tags',
    '--topo-order',
    '--until',
    '--use-mailmap',
    '--walk-reflogs',
    '--word-diff',
    '-1',
    '-C',
    '-E',
    '-F',
    '-G',
    '-L',
    '-M',
    '-S',
    '-b',
    '-c',
    '-g',
    '-i',
    '-m',
    '-n',
    '-p',
    '-q',
    '-r',
    '-s',
    '-t',
    '-u',
    '-w',
    '-z',
  ],
  diff: [
    '--abbrev',
    '--anchored',
    '--base',
    '--binary',
    '--break-rewrites',
    '--cached',
    '--cc',
    '--check',
    '--color',
    '--color-moved',
    '--color-moved-ws',
    '--color-words',
    '--compact-summary',
    '--cumulative',
    '--default-prefix',
    '--diff-algorithm',
    '--diff-filter',
    '--dirstat',
    '--dirstat-by-file',
    '--dst-prefix',
    '--exit-code',
    '--ext-diff',
    '--find-copies',
    '--find-copies-harder',
    '--find-object',
    '--find-renames',
    '--follow',
    '--full-index',
    '--function-context',
    '--histogram',
    '--ignore-all-space',
    '--ignore-blank-lines',
    '--ignore-cr-at-eol',
    '--ignore-matching-lines',
    '--ignore-space-at-eol',
    '--ignore-space-change',
    '--ignore-submodules',
    '--indent-heuristic',
    '--inter-hunk-context',
    '--irreversible-delete',
    '--ita-invisible-in-index',
    '--ita-visible-in-index',
    '--line-prefix',
    '--max-depth',
    '--minimal',
    '--name-only',
    '--name-status',
    '--no-abbrev',
    '--no-color',
    '--no-color-moved',
    '--no-color-moved-ws',
    '--no-compact-summary',
    '--no-exit-code',
    '--no-ext-diff',
    '--no-find-copies-harder',
    '--no-follow',
    '--no-full-index',
    '--no-function-context',
    '--no-ignore-matching-lines',
    '--no-indent-heuristic',
    '--no-index',
    '--no-patch',
    '--no-prefix',
    '--no-quiet',
    '--no-relative',
    '--no-rename-empty',
    '--no-renames',
    '--no-text',
    '--no-textconv',
    '--numstat',
    '--ours',
    '--output',
    '--output-indicator-context',
    '--output-indicator-new',
    '--output-indicator-old',
    '--patch',
    '--patch-with-raw',
    '--patch-with-stat',
    '--patience',
    '--pickaxe-all',
    '--pickaxe-regex',
    '--quiet',
    '--raw',
    '--relative',
    '--rename-empty',
    '--rotate-to',
    '--shortstat',
    '--skip-to',
    '--src-prefix',
    '--staged',
    '--stat',
    '--stat-count',
    '--stat-graph-width',
    '--stat-name-width',
    '--stat-width',
    '--submodule',
    '--summary',
    '--text',
    '--textconv',
    '--theirs',
    '--unified',
    '--word-diff',
    '--word-diff-regex',
    '--ws-error-highlight',
    '-1',
    '-2',
    '-3',
    '-B',
    '-C',
    '-D',
    '-G',
    '-M',
    '-O',
    '-R',
    '-S',
    '-U',
    '-W',
    '-a',
    '-b',
    '-l',
    '-p',
    '-s',
    '-u',
    '-w',
    '-z',
  ],
  show: [
    '--abbrev-commit',
    '--cc',
    '--check',
    '--clear-decorations',
    '--color',
    '--date',
    '--decorate',
    '--decorate-refs',
    '--decorate-refs-exclude',
    '--diff-filter',
    '--find-renames',
    '--first-parent',
    '--ignore-space-change',
    '--name-only',
    '--name-status',
    '--no-color',
    '--no-decorate',
    '--no-decorate-refs',
    '--no-decorate-refs-exclude',
    '--no-mailmap',
    '--no-patch',
    '--no-quiet',
    '--no-source',
    '--no-use-mailmap',
    '--notes',
    '--numstat',
    '--oneline',
    '--patch',
    '--pretty',
    '--quiet',
    '--raw',
    '--shortstat',
    '--source',
    '--stat',
    '--summary',
    '--textconv',
    '--use-mailmap',
    '--word-diff',
    '-1',
    '-L',
    '-M',
    '-U',
    '-c',
    '-m',
    '-p',
    '-q',
    '-s',
    '-w',
  ],
  status: [
    '--ahead-behind',
    '--branch',
    '--column',
    '--find-renames',
    '--ignore-submodules',
    '--ignored',
    '--long',
    '--no-ahead-behind',
    '--no-branch',
    '--no-column',
    '--no-ignore-submodules',
    '--no-ignored',
    '--no-long',
    '--no-null',
    '--no-porcelain',
    '--no-renames',
    '--no-short',
    '--no-show-stash',
    '--no-untracked-files',
    '--no-verbose',
    '--null',
    '--porcelain',
    '--renames',
    '--short',
    '--show-stash',
    '--untracked-files',
    '--verbose',
    '-M',
    '-b',
    '-s',
    '-u',
    '-v',
    '-z',
  ],
}

/**
 * Опции, про которые прогоном git 2.53.0 установлено, что их нет (log/show: "fatal: unrecognized
 * argument", diff: "error: invalid option"). Только они остаются ошибкой git у log/show/diff;
 * всё остальное, что не в области и не в списках, — отказ тренажёра (при сомнении — второй ответ).
 */
const SECTION3_KNOWN_ABSENT: readonly string[] = ['--one', '--bogus', '--no-bogus', '--oneline=3', '-x', '-Z', '-Z9', '-k']

/** `-<N>` (число): git принимает как лимит у log/show и как контекст/номер у diff. У status числа нет: `-9` — unknown switch `9'. */
const NUMERIC_SHORTCUT = /^-\d+$/

/**
 * Первая виновная часть склеенных коротких флагов `git status` (parse-options.c, сверено
 * песочницей git 2.53.0, 08.10.2026). Буквы читаются слева направо: `v`, `s`, `b`, `z` без
 * значения — читаем дальше; `u`, `M` забирают весь хвост как значение, `h` печатает usage —
 * виноватых дальше нет (`null`). Знак `-` после буквы без значения превращает хвост в имя
 * длинной опции (`-s-x` — unknown option `x'). Любой другой символ — unknown switch на нём
 * (`-Z9`, `-sZ`, `-s9`, `-s=` — виновны `Z`, `Z`, `9`, `=`); всё, что правее него, не читается.
 */
export type StatusClusterFault = { kind: 'switch'; text: string } | { kind: 'option'; text: string }

export function statusClusterFault(token: string): StatusClusterFault | null {
  const letters = [...token.slice(1)]
  for (let i = 0; i < letters.length; i++) {
    const c = letters[i]
    if ('vsbz'.includes(c)) continue
    if (c === 'u' || c === 'M' || c === 'h') return null
    if (c === '-' && i > 0) return { kind: 'option', text: letters.slice(i + 1).join('') }
    return { kind: 'switch', text: c }
  }
  return null
}

/**
 * Классификация одного флага (target.md, часть III, правило 1) — упрощённая версия
 * classifySection2Option (без разбора кластеров/сокращений, см. шапку файла). "-sb" (S3-35)
 * попадает сюда КАК ЕСТЬ, единым токеном — это тоже честно: git реально разбирает такой кластер
 * по буквам ("-s" известна разделу, "-b" — нет), но раздел 3 этого не делает, поэтому весь
 * кластер получает "не поддерживает флаг" целиком, не притворяясь более точным, чем есть.
 */
export type Section3OptionClassification = 'scope' | 'outOfScope' | 'unknown'

export function classifySection3Option(cmd: Section3Command, scopeFlags: readonly string[], flag: string): Section3OptionClassification {
  const bare = flag.startsWith('--') ? flag.split('=')[0] : flag
  if (scopeFlags.includes(bare)) return 'scope'
  if (SECTION3_REAL_OPTIONS[cmd].includes(bare)) return 'outOfScope'
  if (cmd !== 'status' && NUMERIC_SHORTCUT.test(bare)) return 'outOfScope'
  const verified = VERIFIED_SECTION3_OPTIONS[cmd]
  if (bare.startsWith('--no-') && verified.includes('--' + bare.slice('--no-'.length))) return 'outOfScope'
  // Склеенные короткие флаги status ("-sb", "-sZ", "-s9"): раздел 3 кластеры не разбирает, но git
  // читает их по буквам. Если виноватой буквы нет (все известны или хвост забрали `u`/`M`/`h`) —
  // форма настоящая, отказ области; если есть — настоящая ошибка git (текст строит движок).
  if (cmd === 'status' && /^-[^-].+/.test(bare)) return statusClusterFault(bare) === null ? 'outOfScope' : 'unknown'
  // status разбирается parse-options.c с однозначными сокращениями длинных опций.
  if (cmd === 'status' && bare.startsWith('--') && bare.length > 2 && verified.some((o) => o.startsWith(bare))) return 'outOfScope'
  return classifyOptionToken(bare, {
    inScope: scopeFlags,
    verifiedReal: [...SECTION3_REAL_OPTIONS[cmd], ...verified],
    exhaustive: cmd === 'status',
    knownAbsent: SECTION3_KNOWN_ABSENT,
  })
    === 'unknown'
    ? 'unknown'
    : 'outOfScope'
}
