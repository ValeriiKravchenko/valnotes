// ============================================================
// Раздел 6 git-тренажёра, шаг A («Проект»): граница области (target.md, часть
// III, правило 1; часть VIII — «Что входит»/«Что НЕ входит»). По устройству —
// аналог inspectScope.ts/undoScope.ts: команды grep/blame/show/log разбираются
// точным совпадением (без сокращений/кластеров длинных опций — тот же
// сознательный упрощённый вариант, что и в разделе 3, см. его шапку).
// REAL_GIT_COMMANDS/isGlobalGitOption/gitNotACommand переиспользуются напрямую
// из branchScope.ts (данные о настоящем git, общие для всех разделов).
//
// Все буквальные usage-блоки ниже — из docs/git-trainer/reports/section6-git-runs.txt
// (git 2.53.0, LC_ALL=C, 26.09.2026), НЕ по памяти.
// ============================================================
export { GLOBAL_GIT_OPTIONS, isGlobalGitOption, REAL_GIT_COMMANDS, gitNotACommand } from './branchScope'

/** git-подкоманды, которые шаг A раздела 6 реализует буквально (target.md, «Порядок работ», шаг A). */
export const SECTION6A_COMMANDS = ['grep', 'blame', 'show', 'log'] as const
export type Section6ACommand = (typeof SECTION6A_COMMANDS)[number]

export function isSection6ACommand(sub: string): sub is Section6ACommand {
  return (SECTION6A_COMMANDS as readonly string[]).includes(sub)
}

/**
 * Команда раздела 6 (шаг A), которую этот терминал НЕ разбирает, но которая — настоящая команда
 * git (правило 1, второй ответ): `git bisect` — команда соседнего репозитория «Магазин» (шаг B,
 * этой версией движка не реализован), остальные (add/commit/branch/checkout/merge/revert/reset/
 * status/diff и т.п.) — просто вне области терминала «Проект» (target.md, «Что НЕ входит»).
 */
export function isBisectCommand(sub: string): boolean {
  return sub === 'bisect'
}

// ---------- usage-блоки (буквально, git 2.53.0, 26.09.2026) ----------

export const GREP_USAGE =
  "usage: git grep [<options>] [-e] <pattern> [<rev>...] [[--] <path>...]\n" +
  '\n' +
  '    --[no-]cached         search in index instead of in the work tree\n' +
  '    --no-index            find in contents not managed by git\n' +
  '    --index               opposite of --no-index\n' +
  '    --[no-]untracked      search in both tracked and untracked files\n' +
  "    --[no-]exclude-standard\n" +
  "                          ignore files specified via '.gitignore'\n" +
  '    --[no-]recurse-submodules\n' +
  '                          recursively search in each submodule\n' +
  '\n' +
  '    -v, --[no-]invert-match\n' +
  '                          show non-matching lines\n' +
  '    -i, --[no-]ignore-case\n' +
  '                          case insensitive matching\n' +
  '    -w, --[no-]word-regexp\n' +
  '                          match patterns only at word boundaries\n' +
  '    -a, --[no-]text       process binary files as text\n' +
  "    -I                    don't match patterns in binary files\n" +
  '    --[no-]textconv       process binary files with textconv filters\n' +
  '    -r, --[no-]recursive  search in subdirectories (default)\n' +
  '    --max-depth <n>       descend at most <n> levels\n' +
  '\n' +
  '    -E, --[no-]extended-regexp\n' +
  '                          use extended POSIX regular expressions\n' +
  '    -G, --[no-]basic-regexp\n' +
  '                          use basic POSIX regular expressions (default)\n' +
  '    -F, --[no-]fixed-strings\n' +
  '                          interpret patterns as fixed strings\n' +
  '    -P, --[no-]perl-regexp\n' +
  '                          use Perl-compatible regular expressions\n' +
  '\n' +
  '    -n, --[no-]line-number\n' +
  '                          show line numbers\n' +
  '    --[no-]column         show column number of first match\n' +
  "    -h                    don't show filenames\n" +
  '    -H                    show filenames\n' +
  '    --[no-]full-name      show filenames relative to top directory\n' +
  '    -l, --[no-]files-with-matches\n' +
  '                          show only filenames instead of matching lines\n' +
  '    --[no-]name-only      synonym for --files-with-matches\n' +
  '    -L, --[no-]files-without-match\n' +
  '                          show only the names of files without match\n' +
  '    -z, --[no-]null       print NUL after filenames\n' +
  '    -o, --[no-]only-matching\n' +
  '                          show only matching parts of a line\n' +
  '    -c, --[no-]count      show the number of matches instead of matching lines\n' +
  '    --[no-]color[=<when>] highlight matches\n' +
  '    --[no-]break          print empty line between matches from different files\n' +
  '    --[no-]heading        show filename only once above matches from same file\n' +
  '\n' +
  '    -C, --[no-]context <n>\n' +
  '                          show <n> context lines before and after matches\n' +
  '    -B, --before-context <n>\n' +
  '                          show <n> context lines before matches\n' +
  '    -A, --after-context <n>\n' +
  '                          show <n> context lines after matches\n' +
  '    --[no-]threads <n>    use <n> worker threads\n' +
  '    -NUM                  shortcut for -C NUM\n' +
  '    -p, --[no-]show-function\n' +
  '                          show a line with the function name before matches\n' +
  '    -W, --[no-]function-context\n' +
  '                          show the surrounding function\n' +
  '\n' +
  '    -f <file>             read patterns from file\n' +
  '    -e <pattern>          match <pattern>\n' +
  '    --and                 combine patterns specified with -e\n' +
  '    --or\n' +
  '    --not\n' +
  '    (\n' +
  '    )\n' +
  '    -q, --[no-]quiet      indicate hit with exit status without output\n' +
  '    --[no-]all-match      show only matches from files that match all patterns\n' +
  '\n' +
  '    -O, --[no-]open-files-in-pager[=<pager>]\n' +
  '                          show matching files in the pager\n' +
  '    --[no-]ext-grep       allow calling of grep(1) (ignored by this build)\n' +
  '    -m, --[no-]max-count <n>\n' +
  '                          maximum number of results per file\n' +
  '\n'

export const BLAME_USAGE =
  'usage: git blame [<options>] [<rev-opts>] [<rev>] [--] <file>\n' +
  '\n' +
  '    <rev-opts> are documented in git-rev-list(1)\n' +
  '\n' +
  '    --[no-]incremental    show blame entries as we find them, incrementally\n' +
  '    -b                    do not show object names of boundary commits (Default: off)\n' +
  '    --[no-]root           do not treat root commits as boundaries (Default: off)\n' +
  '    --[no-]show-stats     show work cost statistics\n' +
  '    --[no-]progress       force progress reporting\n' +
  '    --[no-]score-debug    show output score for blame entries\n' +
  '    -f, --[no-]show-name  show original filename (Default: auto)\n' +
  '    -n, --[no-]show-number\n' +
  '                          show original linenumber (Default: off)\n' +
  '    -p, --[no-]porcelain  show in a format designed for machine consumption\n' +
  '    --[no-]line-porcelain show porcelain format with per-line commit information\n' +
  '    -c                    use the same output mode as git-annotate (Default: off)\n' +
  '    -t                    show raw timestamp (Default: off)\n' +
  '    -l                    show long commit SHA1 (Default: off)\n' +
  '    -s                    suppress author name and timestamp (Default: off)\n' +
  '    -e, --[no-]show-email show author email instead of name (Default: off)\n' +
  '    -w                    ignore whitespace differences\n' +
  '    --diff-algorithm <algorithm>\n' +
  '                          choose a diff algorithm\n' +
  '    --[no-]ignore-rev <rev>\n' +
  '                          ignore <rev> when blaming\n' +
  '    --[no-]ignore-revs-file <file>\n' +
  '                          ignore revisions from <file>\n' +
  '    --[no-]color-lines    color redundant metadata from previous line differently\n' +
  '    --[no-]color-by-age   color lines by age\n' +
  '    -S <file>             use revisions from <file> instead of calling git-rev-list\n' +
  '    --[no-]contents <file>\n' +
  "                          use <file>'s contents as the final image\n" +
  '    -C[<score>]           find line copies within and across files\n' +
  '    -M[<score>]           find line movements within and across files\n' +
  '    -L <range>            process only line range <start>,<end> or function :<funcname>\n' +
  '    --[no-]abbrev[=<n>]   use <n> digits to display object names\n' +
  '\n'

/**
 * Опции `git grep`, реальные у настоящего git, но которые шаг A НЕ разбирает (правило области,
 * target.md, часть III, правило 1, случай 2 — «второй ответ», а не «неизвестный ключ»). Список —
 * ПОЛНЫЙ по usage-блоку `git grep -h` (docs/git-trainer/reports/section6-git-runs.txt, «Д18»,
 * git 2.53.0, 26.09.2026 — байт-в-байт совпадает с блоком, полученным ранее на ошибке `-x`),
 * за вычетом шести коротких флагов, которые шаг A РЕАЛИЗУЕТ (`-n`, `-i`, `-l`, `-c`, `-w`, `-F`) —
 * их длинные алиасы (`--line-number`, `--ignore-case`, `--files-with-matches`, `--count`,
 * `--word-regexp`, `--fixed-strings`) сюда НАРОЧНО включены: шаг A разбирает только короткую форму
 * (см. упрощение 4 в отчёте section6-engine.md), поэтому длинный алиас реализованного флага —
 * тоже «второй ответ», а не реализация и не «неизвестный ключ».
 *
 * `--[no-]имя` в usage-блоке — обе формы (`--имя` и `--no-имя`) внесены явно. Голые `(`/`)` из
 * usage-блока не внесены — они не читаются как отдельный флаг (это не `-x`/`--xxx`), а как символ
 * шелла отсекаются раньше, до разбора grep (`shell.ts`, findShellRefusal). `-NUM`
 * (сокращение `-C NUM`) — не литеральный токен, разбирается отдельно, см. `GREP_NUM_SHORTCUT`.
 */
export const GREP_KNOWN_OUT_OF_SCOPE: readonly string[] = [
  // короткие
  '-v',
  '-a',
  '-I',
  '-r',
  '-E',
  '-G',
  '-P',
  '-h',
  '-H',
  '-L',
  '-z',
  '-o',
  '-C',
  '-B',
  '-A',
  '-p',
  '-W',
  '-f',
  '-e',
  '-q',
  '-O',
  '-m',
  // длинные (включая длинные алиасы уже реализованных коротких флагов — см. комментарий выше)
  '--cached',
  '--no-cached',
  '--no-index',
  '--index',
  '--untracked',
  '--no-untracked',
  '--exclude-standard',
  '--no-exclude-standard',
  '--recurse-submodules',
  '--no-recurse-submodules',
  '--invert-match',
  '--no-invert-match',
  '--ignore-case',
  '--no-ignore-case',
  '--word-regexp',
  '--no-word-regexp',
  '--text',
  '--no-text',
  '--textconv',
  '--no-textconv',
  '--recursive',
  '--no-recursive',
  '--max-depth',
  '--extended-regexp',
  '--no-extended-regexp',
  '--basic-regexp',
  '--no-basic-regexp',
  '--fixed-strings',
  '--no-fixed-strings',
  '--perl-regexp',
  '--no-perl-regexp',
  '--line-number',
  '--no-line-number',
  '--column',
  '--no-column',
  '--full-name',
  '--no-full-name',
  '--files-with-matches',
  '--no-files-with-matches',
  '--name-only',
  '--no-name-only',
  '--files-without-match',
  '--no-files-without-match',
  '--null',
  '--no-null',
  '--only-matching',
  '--no-only-matching',
  '--count',
  '--no-count',
  '--color',
  '--no-color',
  '--break',
  '--no-break',
  '--heading',
  '--no-heading',
  '--context',
  '--no-context',
  '--before-context',
  '--after-context',
  '--threads',
  '--no-threads',
  '--show-function',
  '--no-show-function',
  '--function-context',
  '--no-function-context',
  '--and',
  '--or',
  '--not',
  '--quiet',
  '--no-quiet',
  '--all-match',
  '--no-all-match',
  '--open-files-in-pager',
  '--no-open-files-in-pager',
  '--ext-grep',
  '--no-ext-grep',
  '--max-count',
  '--no-max-count',
]

/** `-NUM` — сокращение `-C NUM` (git grep -h: «-NUM shortcut for -C NUM») — не литеральный флаг, а числовой аргумент, приклеенный к дефису; настоящий, но вне области, как и `-C`. */
export const GREP_NUM_SHORTCUT = /^-\d+$/

/**
 * Опции `git blame`, реальные, но вне области (правило области). Список — ПОЛНЫЙ по usage-блоку
 * `git blame -h` (section6-git-runs.txt, «Д18»), за вычетом `-s`/`-L` (реализованы шагом A).
 * `--date` в этот usage-блок НЕ входит (короткая usage-подсказка его не перечисляет), но это
 * настоящая опция — сверено прямым прогоном `git blame --date=short app.js` (section6-git-runs.txt,
 * основной блок BLAME) и названо в target.md, «Что НЕ входит»; оставлена в списке.
 */
export const BLAME_KNOWN_OUT_OF_SCOPE: readonly string[] = [
  // короткие
  '-b',
  '-f',
  '-n',
  '-p',
  '-c',
  '-t',
  '-l',
  '-e',
  '-w',
  '-S',
  // длинные
  '--incremental',
  '--no-incremental',
  '--root',
  '--no-root',
  '--show-stats',
  '--no-show-stats',
  '--progress',
  '--no-progress',
  '--score-debug',
  '--no-score-debug',
  '--show-name',
  '--no-show-name',
  '--show-number',
  '--no-show-number',
  '--porcelain',
  '--no-porcelain',
  '--line-porcelain',
  '--no-line-porcelain',
  '--show-email',
  '--no-show-email',
  '--diff-algorithm',
  '--ignore-rev',
  '--no-ignore-rev',
  '--ignore-revs-file',
  '--no-ignore-revs-file',
  '--color-lines',
  '--no-color-lines',
  '--color-by-age',
  '--no-color-by-age',
  '--contents',
  '--no-contents',
  '--abbrev',
  '--no-abbrev',
  '--date',
]

/** `-C[<score>]`/`-M[<score>]` — score приклеен без пробела (`-C90`); настоящие, но вне области, как и голые `-C`/`-M`. */
export const BLAME_SCORE_OPTION = /^-[CM]\d*$/
