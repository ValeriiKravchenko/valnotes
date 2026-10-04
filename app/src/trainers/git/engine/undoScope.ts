// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): граница области (target.md,
// часть III, правило 1; часть VI — что входит и не входит именно в этот
// раздел).
//
// GLOBAL_GIT_OPTIONS/isGlobalGitOption/REAL_GIT_COMMANDS/gitNotACommand
// переиспользуются напрямую из branchScope.ts (который сам переиспользует их
// из scope.ts) — те же данные о настоящем git, что и в разделах 1–3, третьей
// копии здесь нет (тот же приём, что и в inspectScope.ts). add/commit/status/
// branch этот раздел разбирает теми же правилами, что и раздел 2 (одна и та
// же команда git — одни и те же реальные флаги вне зависимости от раздела),
// поэтому их классификация переиспользуется через classifySection2Option
// (branchScope.ts) — раздел 2 (branch*.ts) при этом не редактируется.
//
// reset/revert раздел 2 не знает вовсе — их разбор (ниже) свой, с более
// простой (без сокращений длинных опций и посимвольного разбора кластеров —
// см. упрощение в шапке inspectScope.ts, тот же принцип здесь) классификацией:
// «в области» / «настоящая опция, здесь не разбирается» / «сам ввод не
// разобрать вовсе — буквальный вывод git» (у git revert/reset неизвестный и
// нереализованный-но-настоящий флаг на выходе неразличимы — оба дают один и
// тот же usage-блок, сверено напрямую, git 2.53.0, 26.09.2026: `git revert
// --bogus`, `git revert -s` без остального ввода и `git revert` без
// аргументов дают ДОСЛОВНО один и тот же 24-строчный блок; см. отчёт).
// ============================================================
import { classifyOptionToken } from './outOfScopeForms'

export { GLOBAL_GIT_OPTIONS, isGlobalGitOption, REAL_GIT_COMMANDS, gitNotACommand } from './branchScope'

/** git-подкоманды, которые раздел 4 реализует буквально. */
export const SECTION4_COMMANDS = ['add', 'commit', 'status', 'log', 'branch', 'reset', 'revert'] as const
export type Section4Command = (typeof SECTION4_COMMANDS)[number]

export function isSection4Command(sub: string): sub is Section4Command {
  return (SECTION4_COMMANDS as readonly string[]).includes(sub)
}

/**
 * Буквальный 24-строчный usage-блок `git revert` (git 2.53.0, временный каталог, 26.09.2026) —
 * ЕДИНЫЙ ответ настоящего git на три разных случая: без аргумента, с любым нераспознанным
 * флагом (фейковым ИЛИ настоящим, но не входящим в `[--[no-]edit] [-n] [-m …] [-s] [-S…]`) даже
 * при указанном коммите. Раздел 4 воспроизводит его дословно (правило 2) вместо трёх разных
 * придуманных сообщений там, где сам git не различает их на выходе.
 */
export const REVERT_USAGE =
  'usage: git revert [--[no-]edit] [-n] [-m <parent-number>] [-s] [-S[<keyid>]] <commit>...\n' +
  '   or: git revert (--continue | --skip | --abort | --quit)\n' +
  '\n' +
  '    --quit                end revert or cherry-pick sequence\n' +
  '    --continue            resume revert or cherry-pick sequence\n' +
  '    --abort               cancel revert or cherry-pick sequence\n' +
  '    --skip                skip current commit and continue\n' +
  '    --[no-]cleanup <mode> how to strip spaces and #comments from message\n' +
  "    -n, --no-commit       don't automatically commit\n" +
  '    --commit              opposite of --no-commit\n' +
  '    -e, --[no-]edit       edit the commit message\n' +
  '    -s, --[no-]signoff    add a Signed-off-by trailer\n' +
  '    -m, --[no-]mainline <parent-number>\n' +
  '                          select mainline parent\n' +
  '    --[no-]rerere-autoupdate\n' +
  '                          update the index with reused conflict resolution if possible\n' +
  '    --[no-]strategy <strategy>\n' +
  '                          merge strategy\n' +
  '    -X, --[no-]strategy-option <option>\n' +
  '                          option for merge strategy\n' +
  '    -S, --[no-]gpg-sign[=<key-id>]\n' +
  '                          GPG sign commit\n' +
  "    --[no-]reference      use the 'reference' format to refer to commits\n"

/** Буквальный 26-строчный usage-блок `git reset` (git 2.53.0, временный каталог, 26.09.2026), напечатанный ПОСЛЕ строки "error: unknown option/switch …" при нераспознанном флаге, либо один (без строки error) на `git reset -h`. */
export const RESET_USAGE =
  'usage: git reset [--mixed | --soft | --hard | --merge | --keep] [-q] [<commit>]\n' +
  '   or: git reset [-q] [<tree-ish>] [--] <pathspec>...\n' +
  '   or: git reset [-q] [--pathspec-from-file [--pathspec-file-nul]] [<tree-ish>]\n' +
  '   or: git reset --patch [<tree-ish>] [--] [<pathspec>...]\n' +
  '\n' +
  '    -q, --[no-]quiet      be quiet, only report errors\n' +
  '    --no-refresh          skip refreshing the index after reset\n' +
  '    --refresh             opposite of --no-refresh\n' +
  '    --mixed               reset HEAD and index\n' +
  '    --soft                reset only HEAD\n' +
  '    --hard                reset HEAD, index and working tree\n' +
  '    --merge               reset HEAD, index and working tree\n' +
  '    --keep                reset HEAD but keep local changes\n' +
  '    --[no-]recurse-submodules[=<reset>]\n' +
  '                          control recursive updating of submodules\n' +
  '    -p, --[no-]patch      select hunks interactively\n' +
  '    -U, --unified <n>     generate diffs with <n> lines context\n' +
  '    --inter-hunk-context <n>\n' +
  '                          show context between diff hunks up to the specified number of lines\n' +
  '    -N, --[no-]intent-to-add\n' +
  '                          record only the fact that removed paths will be added later\n' +
  '    --[no-]pathspec-from-file <file>\n' +
  '                          read pathspec from file\n' +
  '    --[no-]pathspec-file-nul\n' +
  '                          with --pathspec-from-file, pathspec elements are separated with NUL character\n'

/**
 * Флаги `git revert`, которые раздел 4 разбирает буквально (target.md, часть VI, «Что входит»).
 * Точное совпадение, без сокращений (см. шапку файла) — `--no-edit` в любом виде (одно из двух: и
 * так у revert нет короткой формы).
 */
export const REVERT_SCOPE_FLAGS = ['--no-edit'] as const

/** `-n`/`--no-commit` (target.md, часть VI, «Что НЕ входит»: «git revert -n, -m»). */
export function isRevertNoCommitFlag(flag: string): boolean {
  return flag === '-n' || flag === '--no-commit'
}

/** `-m`/`--mainline` (target.md, часть VI, «Что НЕ входит»). Значение (если приклеено через "=" или идёт следующим токеном) эта проверка не разбирает — вызывающему коду достаточно знать, что это именно `-m`. */
export function isRevertMainlineFlag(flag: string): boolean {
  return flag === '-m' || flag === '--mainline' || flag.startsWith('--mainline=')
}

/** `--abort`/`--continue`/`--skip`/`--quit` — вся ветка «конфликт при revert», вне области (target.md, часть VI, «Что НЕ входит»: «revert --abort, --continue»). */
export function isRevertConflictFlowFlag(flag: string): boolean {
  return flag === '--abort' || flag === '--continue' || flag === '--skip' || flag === '--quit'
}

/**
 * Флаги `git reset`, которые раздел 4 разбирает буквально (target.md, часть VI, «Что входит»):
 * `--soft`/`--mixed`/`--hard` — режим переноса ветки; по умолчанию (без флага) — `--mixed`.
 */
export const RESET_MODE_FLAGS = ['--soft', '--mixed', '--hard'] as const

/** `-q`/`--quiet` (target.md, часть VI, «Что НЕ входит»). */
export function isResetQuietFlag(flag: string): boolean {
  return flag === '-q' || flag === '--quiet'
}

/** `--merge`/`--keep` (target.md, часть VI, «Что НЕ входит»). */
export function isResetMergeOrKeepFlag(flag: string): boolean {
  return flag === '--merge' || flag === '--keep'
}

/**
 * Полные наборы опций reset/revert, которые настоящий git принимает: вывод `git <команда> -h`
 * плюс `git <команда> --git-completion-helper` (сверено на git 2.53.0, 04.10.2026). Наборы
 * исчерпывающие: опция вне них и вне форм `--no-<имя>` заведомо не существует.
 */
const VERIFIED_UNDO_OPTIONS: Record<'reset' | 'revert', readonly string[]> = {
  reset: [
    '--hard',
    '--intent-to-add',
    '--inter-hunk-context',
    '--keep',
    '--merge',
    '--mixed',
    '--no-intent-to-add',
    '--no-patch',
    '--no-pathspec-file-nul',
    '--no-pathspec-from-file',
    '--no-quiet',
    '--no-recurse-submodules',
    '--no-refresh',
    '--patch',
    '--pathspec-file-nul',
    '--pathspec-from-file',
    '--quiet',
    '--recurse-submodules',
    '--refresh',
    '--soft',
    '--unified',
    '-N',
    '-U',
    '-p',
    '-q',
  ],
  revert: [
    '--abort',
    '--cleanup',
    '--commit',
    '--continue',
    '--edit',
    '--gpg-sign',
    '--mainline',
    '--no-cleanup',
    '--no-commit',
    '--no-edit',
    '--no-gpg-sign',
    '--no-mainline',
    '--no-reference',
    '--no-rerere-autoupdate',
    '--no-signoff',
    '--no-strategy',
    '--no-strategy-option',
    '--quit',
    '--reference',
    '--rerere-autoupdate',
    '--signoff',
    '--skip',
    '--strategy',
    '--strategy-option',
    '-S',
    '-X',
    '-e',
    '-m',
    '-n',
    '-s',
  ],
}

/** `scope` — раздел разбирает; `refuse` — git принимает, раздел нет; `unknown` — такой опции в git нет. */
export function classifyUndoOption(cmd: 'reset' | 'revert', scopeFlags: readonly string[], flag: string): 'scope' | 'refuse' | 'unknown' {
  const bare = flag.startsWith('--') ? flag.split('=')[0] : flag
  const verified = VERIFIED_UNDO_OPTIONS[cmd]
  const cls = classifyOptionToken(bare, { inScope: scopeFlags, verifiedReal: verified, exhaustive: true })
  if (cls !== 'unknown') return cls
  if (bare.startsWith('--no-') && verified.includes('--' + bare.slice('--no-'.length))) return 'refuse'
  if (bare.startsWith('--') && bare.length > 2 && verified.some((o) => o.startsWith(bare))) return 'refuse'
  return 'unknown'
}
