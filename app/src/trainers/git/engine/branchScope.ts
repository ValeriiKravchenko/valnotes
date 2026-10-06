// ============================================================
// Раздел 2 git-тренажёра, шаг A: граница области (target.md, часть III,
// правило 1 — «тренажёр не притворяется, что знает то, чего не знает»;
// и часть IV — что входит и не входит именно в шаг A).
//
// По образцу scope.ts раздела 1, но отдельным файлом: команды и сценарии
// шага A (branch/checkout/merge/add/commit) — другой набор, чем у раздела 1
// (init/status/add/commit), и правила area здесь свои (detached HEAD,
// switch/restore, конфликт слияния — исключены явно, см. часть IV).
//
// REAL_GIT_COMMANDS и isGlobalGitOption/GLOBAL_GIT_OPTIONS переиспользуются
// напрямую из scope.ts раздела 1 — это данные про настоящий git (список
// подкоманд/глобальных опций), не про раздел 1 конкретно, и уже сверены
// с `git help -a`/`git --help` (git 2.53.0) в исходном файле; дублировать
// их здесь означало бы одно и то же множество расходиться в двух местах.
// ============================================================
import { abbreviatedOptionCandidates } from './optionAbbrev'
export { GLOBAL_GIT_OPTIONS, isGlobalGitOption, REAL_GIT_COMMANDS } from './scope'

/** git-подкоманды, которые шаг A реализует буквально. */
export const SECTION2_COMMANDS = ['branch', 'checkout', 'merge', 'add', 'commit', 'status'] as const
export type Section2Command = (typeof SECTION2_COMMANDS)[number]

export function isSection2Command(sub: string): sub is Section2Command {
  return (SECTION2_COMMANDS as readonly string[]).includes(sub)
}

/**
 * Буквальный вывод настоящего git на неизвестное имя подкоманды — тот же
 * текст, что и в разделе 1 (commands.ts, gitNotACommand), сверен независимо
 * на git 2.53.0, 23.09.2026. Копия, а не импорт: gitNotACommand в commands.ts
 * не экспортирована, а раздел 1 трогать эта задача не должна (см. отчёт).
 */
export function gitNotACommand(sub: string): string {
  return `git: '${sub}' is not a git command. See 'git --help'.`
}

// ============================================================
// Опции команд шага A (branch/checkout/merge/add/commit) — данные для
// различения «опция реальна, но здесь не разбирается» (be.optionOutOfScope)
// от «такой опции у git вообще нет» (буквальная ошибка parse-options.c,
// как и в разделе 1, см. commands.ts / scope.ts, REAL_GIT_OPTIONS): полностью
// выдуманный аргумент вроде "git branch -foo" получает у git "error: unknown
// switch `o'" (rc=129), а не «настоящая возможность, здесь не разбирается».
//
// Длинные флаги ("--имя", без "=значения", БЕЗ ведущих "--" в комментариях ниже) взяты
// буквально из `git <команда> --git-completion-helper-all` (git 2.53.0, 24.09.2026, временный
// каталог) — это ПОЛНЫЙ список опций команды, включая скрытые (те, что не показывает `-h`), И
// В ТОЧНОМ ПОРЯДКЕ ИХ ОБЪЯВЛЕНИЯ внутри git (нужен для abbreviatedOptionCandidates —
// см. комментарий над classifySection2Option ниже про то, почему сама пара кандидатов всё
// равно не воспроизводится дословно). Формат вывода этой
// команды: сперва обычные опции (некоторые — с "=" на конце, если принимают значение — "="
// здесь отброшен, сравнение всегда идёт по имени без значения), затем токен "--" (не опция,
// просто разделитель внутри вывода completion-helper), затem скрытые "--no-" формы — тоже в
// порядке объявления. Массивы ниже — это ровно то же самое, что вернула бы команда, минус сам
// разделительный токен "--" и минус хвостовые "=". Короткие буквы (без "-") — из `git <команда>
// -h`: единственное, чего completion-helper-all не даёт — однобуквенные формы.
// ============================================================
interface Section2OptionSet {
  /** Однобуквенные короткие флаги без ведущего "-" (для разбора кластеров вроде "-foo"). */
  short: ReadonlySet<string>
  /**
   * Буквы из `short`, которые принимают значение — и обязательное ("-x, --имя <значение>" в
   * `-h`, без скобок вокруг значения: например "-F, --file <file>"), и НЕОБЯЗАТЕЛЬНОЕ ("-x,
   * --[no-]имя[=<значение>]": "-S[<keyid>]", "-t[=(direct|inherit)]", "-u[<mode>]"). Для разбора
   * кластера они ведут себя ОДИНАКОВО (сверено прогоном, git 2.53.0, 24.09.2026, порознь для
   * обязательных и необязательных: `git checkout -Bnewbr`, `git commit -Fnofile`, `git add -U5`,
   * `git merge -Xignore-all-space` — обязательные; `git branch -tdirect`, `git branch -tq`
   * (глюетое "q" — даже будучи САМО по себе реальным булевым флагом — становится значением "-t",
   * а не отдельным флагом: `` error: option `--track' expects "direct" or "inherit" ``),
   * `git commit -uall`, `git commit -uq` (`` fatal: Invalid untracked files mode 'q' `` — тот же
   * эффект) — необязательные): внутри кластера коротких флагов буква из этого множества обрывает
   * разбор — весь остаток токена становится её значением (даже пустым, если остатка нет), а не
   * следующими флагами. Классификатору ниже разница между обязательным и
   * необязательным значением не нужна — он не извлекает и не проверяет само значение, только
   * отвечает «реальна ли буква» (это делает конкретный обработчик команды, и ни одна из
   * необязательных букв этим шагом не реализована ни в каком виде — только классификация верная,
   * дальше честный отказ по правилу области).
   */
  shortValue: ReadonlySet<string>
  /** Длинные флаги целиком, с "--", без "=значения", в ТОЧНОМ порядке объявления (см. шапку выше). */
  long: readonly string[]
  /**
   * Подмножество `long` — опции, которые НЕ принимают значение вообще (булевы, `PARSE_OPT_NOARG`
   * у настоящего git): `--опция=значение` для них — ошибка разбора опций, а не значение, которое
   * можно проигнорировать. Список получен не по `-h`/completion-helper (они не показывают эту
   * границу однозначно — то же "нет пометки [=...]" бывает и у булевых опций, и у опций с
   * ОБЯЗАТЕЛЬНЫМ значением без "=" в подсказке, например "--merged <commit>"), а прямым прогоном:
   * `git <команда> "<опция>=пробное_значение"` для КАЖДОЙ опции из `long` без "=значения" в
   * готовом выводе `--git-completion-helper-all` (опции, чьё имя там уже оканчивается на "=", —
   * заведомо принимают значение, сюда не входят и прогоном не проверялись отдельно) — опция
   * попадает сюда, только если git ответил буквально "error: option `<имя>' takes no value"
   * (git 2.53.0, 24.09.2026, временный каталог, отдельно на каждую из пяти команд шага A).
   */
  longNoValue: ReadonlySet<string>
}

const BRANCH_OPTIONS: Section2OptionSet = {
  short: new Set(['v', 'q', 't', 'u', 'r', 'a', 'd', 'D', 'm', 'M', 'c', 'C', 'l', 'f', 'i']),
  shortValue: new Set(['u', 't']), // 't' — необязательное значение (track), см. комментарий у Section2OptionSet.shortValue
  long: [
    '--verbose',
    '--quiet',
    '--track',
    '--set-upstream',
    '--set-upstream-to',
    '--unset-upstream',
    '--color',
    '--remotes',
    '--contains',
    '--no-contains',
    '--with',
    '--without',
    '--abbrev',
    '--all',
    '--delete',
    '--move',
    '--omit-empty',
    '--copy',
    '--list',
    '--show-current',
    '--create-reflog',
    '--edit-description',
    '--force',
    '--merged',
    '--no-merged',
    '--column',
    '--sort',
    '--points-at',
    '--ignore-case',
    '--recurse-submodules',
    '--format',
    '--no-verbose',
    '--no-quiet',
    '--no-track',
    '--no-set-upstream',
    '--no-set-upstream-to',
    '--no-unset-upstream',
    '--no-color',
    '--no-abbrev',
    '--no-delete',
    '--no-move',
    '--no-omit-empty',
    '--no-copy',
    '--no-list',
    '--no-show-current',
    '--no-create-reflog',
    '--no-edit-description',
    '--no-force',
    '--no-column',
    '--no-sort',
    '--no-points-at',
    '--no-ignore-case',
    '--no-recurse-submodules',
    '--no-format',
  ],
  longNoValue: new Set([
    '--all',
    '--copy',
    '--create-reflog',
    '--delete',
    '--edit-description',
    '--force',
    '--ignore-case',
    '--list',
    '--move',
    '--no-abbrev',
    '--no-color',
    '--no-column',
    '--no-copy',
    '--no-create-reflog',
    '--no-delete',
    '--no-edit-description',
    '--no-force',
    '--no-format',
    '--no-ignore-case',
    '--no-list',
    '--no-move',
    '--no-omit-empty',
    '--no-points-at',
    '--no-quiet',
    '--no-recurse-submodules',
    '--no-set-upstream',
    '--no-set-upstream-to',
    '--no-show-current',
    '--no-sort',
    '--no-track',
    '--no-unset-upstream',
    '--no-verbose',
    '--omit-empty',
    '--quiet',
    '--recurse-submodules',
    '--remotes',
    '--set-upstream',
    '--show-current',
    '--unset-upstream',
    '--verbose',
  ]),
}

const CHECKOUT_OPTIONS: Section2OptionSet = {
  short: new Set(['b', 'B', 'l', 'q', 'm', 'd', 't', 'f', '2', '3', 'p', 'U']),
  shortValue: new Set(['b', 'B', 'U', 't']), // 't' — необязательное значение (track), см. комментарий у Section2OptionSet.shortValue
  long: [
    '--guess',
    '--overlay',
    '--quiet',
    '--recurse-submodules',
    '--progress',
    '--merge',
    '--conflict',
    '--detach',
    '--track',
    '--force',
    '--orphan',
    '--overwrite-ignore',
    '--ignore-other-worktrees',
    '--ours',
    '--theirs',
    '--patch',
    '--unified',
    '--inter-hunk-context',
    '--ignore-skip-worktree-bits',
    '--pathspec-from-file',
    '--pathspec-file-nul',
    '--no-guess',
    '--no-overlay',
    '--no-quiet',
    '--no-recurse-submodules',
    '--no-progress',
    '--no-merge',
    '--no-conflict',
    '--no-detach',
    '--no-track',
    '--no-force',
    '--no-orphan',
    '--no-overwrite-ignore',
    '--no-ignore-other-worktrees',
    '--no-patch',
    '--no-ignore-skip-worktree-bits',
    '--no-pathspec-from-file',
    '--no-pathspec-file-nul',
  ],
  longNoValue: new Set([
    '--detach',
    '--force',
    '--guess',
    '--ignore-other-worktrees',
    '--ignore-skip-worktree-bits',
    '--merge',
    '--no-conflict',
    '--no-detach',
    '--no-force',
    '--no-guess',
    '--no-ignore-other-worktrees',
    '--no-ignore-skip-worktree-bits',
    '--no-merge',
    '--no-orphan',
    '--no-overlay',
    '--no-overwrite-ignore',
    '--no-patch',
    '--no-pathspec-file-nul',
    '--no-pathspec-from-file',
    '--no-progress',
    '--no-quiet',
    '--no-recurse-submodules',
    '--no-track',
    '--ours',
    '--overlay',
    '--overwrite-ignore',
    '--patch',
    '--pathspec-file-nul',
    '--progress',
    '--quiet',
    '--theirs',
  ]),
}

const MERGE_OPTIONS: Section2OptionSet = {
  short: new Set(['n', 'e', 's', 'X', 'm', 'F', 'v', 'q', 'S']),
  shortValue: new Set(['s', 'X', 'm', 'F', 'S']), // 'S' — необязательное значение (gpg-sign), см. комментарий у Section2OptionSet.shortValue
  long: [
    '--stat',
    '--summary',
    '--compact-summary',
    '--log',
    '--squash',
    '--commit',
    '--edit',
    '--cleanup',
    '--ff',
    '--ff-only',
    '--rerere-autoupdate',
    '--verify-signatures',
    '--strategy',
    '--strategy-option',
    '--message',
    '--file',
    '--into-name',
    '--verbose',
    '--quiet',
    '--abort',
    '--quit',
    '--continue',
    '--allow-unrelated-histories',
    '--progress',
    '--gpg-sign',
    '--autostash',
    '--overwrite-ignore',
    '--signoff',
    '--no-verify',
    '--verify',
    '--no-stat',
    '--no-summary',
    '--no-compact-summary',
    '--no-log',
    '--no-squash',
    '--no-commit',
    '--no-edit',
    '--no-cleanup',
    '--no-ff',
    '--no-rerere-autoupdate',
    '--no-verify-signatures',
    '--no-strategy',
    '--no-strategy-option',
    '--no-message',
    '--no-into-name',
    '--no-verbose',
    '--no-quiet',
    '--no-abort',
    '--no-quit',
    '--no-continue',
    '--no-allow-unrelated-histories',
    '--no-progress',
    '--no-gpg-sign',
    '--no-autostash',
    '--no-overwrite-ignore',
    '--no-signoff',
  ],
  longNoValue: new Set([
    '--abort',
    '--allow-unrelated-histories',
    '--autostash',
    '--commit',
    '--compact-summary',
    '--continue',
    '--edit',
    '--ff',
    '--ff-only',
    '--no-abort',
    '--no-allow-unrelated-histories',
    '--no-autostash',
    '--no-cleanup',
    '--no-commit',
    '--no-compact-summary',
    '--no-continue',
    '--no-edit',
    '--no-ff',
    '--no-gpg-sign',
    '--no-into-name',
    '--no-log',
    '--no-message',
    '--no-overwrite-ignore',
    '--no-progress',
    '--no-quiet',
    '--no-quit',
    '--no-rerere-autoupdate',
    '--no-signoff',
    '--no-squash',
    '--no-stat',
    '--no-strategy',
    '--no-strategy-option',
    '--no-summary',
    '--no-verbose',
    '--no-verify',
    '--no-verify-signatures',
    '--overwrite-ignore',
    '--progress',
    '--quiet',
    '--quit',
    '--rerere-autoupdate',
    '--signoff',
    '--squash',
    '--stat',
    '--summary',
    '--verbose',
    // "--verify" у настоящего git — это отрицание "--no-verify" ("--[no-]no-verify"), поэтому
    // текст ошибки называет её "no-no-verify", а не "verify" (см. NO_VALUE_NAME_OVERRIDE ниже
    // и noValueOptionError) — само по себе значения не принимает так же, как остальные.
    '--verify',
    '--verify-signatures',
  ]),
}

const ADD_OPTIONS: Section2OptionSet = {
  short: new Set(['n', 'v', 'i', 'p', 'U', 'e', 'f', 'u', 'N', 'A']),
  shortValue: new Set(['U']),
  long: [
    '--dry-run',
    '--verbose',
    '--interactive',
    '--patch',
    '--unified',
    '--inter-hunk-context',
    '--edit',
    '--force',
    '--update',
    '--renormalize',
    '--intent-to-add',
    '--all',
    '--ignore-removal',
    '--refresh',
    '--ignore-errors',
    '--ignore-missing',
    '--sparse',
    '--chmod',
    '--warn-embedded-repo',
    '--pathspec-from-file',
    '--pathspec-file-nul',
    '--no-dry-run',
    '--no-verbose',
    '--no-interactive',
    '--no-patch',
    '--no-edit',
    '--no-force',
    '--no-update',
    '--no-renormalize',
    '--no-intent-to-add',
    '--no-all',
    '--no-ignore-removal',
    '--no-refresh',
    '--no-ignore-errors',
    '--no-ignore-missing',
    '--no-sparse',
    '--no-chmod',
    '--no-warn-embedded-repo',
    '--no-pathspec-from-file',
    '--no-pathspec-file-nul',
  ],
  longNoValue: new Set([
    '--all',
    '--dry-run',
    '--edit',
    '--force',
    '--ignore-errors',
    '--ignore-missing',
    '--ignore-removal',
    '--intent-to-add',
    '--interactive',
    '--no-all',
    '--no-chmod',
    '--no-dry-run',
    '--no-edit',
    '--no-force',
    '--no-ignore-errors',
    '--no-ignore-missing',
    '--no-ignore-removal',
    '--no-intent-to-add',
    '--no-interactive',
    '--no-patch',
    '--no-pathspec-file-nul',
    '--no-pathspec-from-file',
    '--no-refresh',
    '--no-renormalize',
    '--no-sparse',
    '--no-update',
    '--no-verbose',
    '--no-warn-embedded-repo',
    '--patch',
    '--pathspec-file-nul',
    '--refresh',
    '--renormalize',
    '--sparse',
    '--update',
    '--verbose',
    '--warn-embedded-repo',
  ]),
}

const COMMIT_OPTIONS: Section2OptionSet = {
  // "U" (--unified, glued-value: см. shortValue) — из `git commit -h` ("-U, --unified <n>"),
  // сверено прогоном (git 2.53.0, 24.09.2026): без неё в этом множестве любой ввод с буквой "U"
  // получил бы "unknown switch" вместо честной классификации.
  short: new Set(['q', 'v', 'F', 'm', 'c', 'C', 's', 't', 'e', 'S', 'a', 'i', 'p', 'o', 'n', 'u', 'z', 'U']),
  shortValue: new Set(['F', 'm', 'c', 'C', 't', 'U', 'S', 'u']), // 'S'/'u' — необязательное значение (gpg-sign/untracked-files), см. комментарий у Section2OptionSet.shortValue
  long: [
    '--quiet',
    '--verbose',
    '--file',
    '--author',
    '--date',
    '--message',
    '--reedit-message',
    '--reuse-message',
    '--fixup',
    '--squash',
    '--reset-author',
    '--trailer',
    '--signoff',
    '--template',
    '--edit',
    '--cleanup',
    '--status',
    '--gpg-sign',
    '--all',
    '--include',
    '--interactive',
    '--patch',
    '--unified',
    '--inter-hunk-context',
    '--only',
    '--no-verify',
    '--dry-run',
    '--short',
    '--branch',
    '--ahead-behind',
    '--porcelain',
    '--long',
    '--null',
    '--amend',
    '--no-post-rewrite',
    '--untracked-files',
    '--pathspec-from-file',
    '--pathspec-file-nul',
    '--allow-empty',
    '--allow-empty-message',
    '--verify',
    '--post-rewrite',
    '--no-quiet',
    '--no-verbose',
    '--no-file',
    '--no-author',
    '--no-date',
    '--no-message',
    '--no-reedit-message',
    '--no-reuse-message',
    '--no-fixup',
    '--no-squash',
    '--no-reset-author',
    '--no-signoff',
    '--no-template',
    '--no-edit',
    '--no-cleanup',
    '--no-status',
    '--no-gpg-sign',
    '--no-all',
    '--no-include',
    '--no-interactive',
    '--no-patch',
    '--no-only',
    '--no-dry-run',
    '--no-short',
    '--no-branch',
    '--no-ahead-behind',
    '--no-porcelain',
    '--no-long',
    '--no-null',
    '--no-amend',
    '--no-untracked-files',
    '--no-pathspec-from-file',
    '--no-pathspec-file-nul',
    '--no-allow-empty',
    '--no-allow-empty-message',
  ],
  longNoValue: new Set([
    '--ahead-behind',
    '--all',
    '--allow-empty',
    '--allow-empty-message',
    '--amend',
    '--branch',
    '--dry-run',
    '--edit',
    '--include',
    '--interactive',
    '--long',
    '--no-ahead-behind',
    '--no-all',
    '--no-allow-empty',
    '--no-allow-empty-message',
    '--no-amend',
    '--no-author',
    '--no-branch',
    '--no-cleanup',
    '--no-date',
    '--no-dry-run',
    '--no-edit',
    '--no-file',
    '--no-fixup',
    '--no-gpg-sign',
    '--no-include',
    '--no-interactive',
    '--no-long',
    '--no-message',
    '--no-null',
    '--no-only',
    '--no-patch',
    '--no-pathspec-file-nul',
    '--no-pathspec-from-file',
    '--no-porcelain',
    '--no-post-rewrite',
    '--no-quiet',
    '--no-reedit-message',
    '--no-reset-author',
    '--no-reuse-message',
    '--no-short',
    '--no-signoff',
    '--no-squash',
    '--no-status',
    '--no-template',
    '--no-untracked-files',
    '--no-verbose',
    '--no-verify',
    '--null',
    '--only',
    '--patch',
    '--pathspec-file-nul',
    '--porcelain',
    // "--post-rewrite" — отрицание "--no-post-rewrite" (то же явление, что и "--verify" у merge
    // выше), текст ошибки называет её "no-no-post-rewrite" (см. NO_VALUE_NAME_OVERRIDE).
    '--post-rewrite',
    '--quiet',
    '--reset-author',
    '--short',
    '--signoff',
    '--status',
    '--verbose',
    '--verify',
  ]),
}

/**
 * `git status` шага A: единственная реализованная форма — голый `git status` (Часть 1 переноса
 * шага A, «Подключить команду к уже существующему formatBranchingStatus», «Формы — только те,
 * что раздел 1 уже принимает, разбор флагов не расширять») — раздел 1 короткий формат (-s/
 * --short) реализует полноценно (repo.ts, formatStatusShort), но здесь для новой модели данных
 * (branchTypes.ts) такого форматтера нет и эта задача его не строит, поэтому ЛЮБОЙ флаг status,
 * включая -s/--short, честно получает второй ответ правила области (реальная опция git, здесь
 * не разбирается) — вместо того, чтобы либо промолчать про короткий формат, либо притвориться,
 * что печатает его. Список опций и их значений — из `git status --git-completion-helper-all` и
 * `git status -h` (git 2.53.0, 25.09.2026, временный каталог), тот же принцип, что и у
 * остальных четырёх наборов выше.
 */
const STATUS_OPTIONS: Section2OptionSet = {
  short: new Set(['v', 's', 'b', 'z', 'u', 'M']),
  shortValue: new Set(['u', 'M']), // необязательное значение (untracked-files/find-renames), см. комментарий у Section2OptionSet.shortValue
  long: [
    '--verbose',
    '--short',
    '--branch',
    '--show-stash',
    '--ahead-behind',
    '--porcelain',
    '--long',
    '--null',
    '--untracked-files',
    '--ignored',
    '--ignore-submodules',
    '--column',
    '--no-renames',
    '--find-renames',
    '--renames',
    '--no-verbose',
    '--no-short',
    '--no-branch',
    '--no-show-stash',
    '--no-ahead-behind',
    '--no-porcelain',
    '--no-long',
    '--no-null',
    '--no-untracked-files',
    '--no-ignored',
    '--no-ignore-submodules',
    '--no-column',
  ],
  longNoValue: new Set([
    '--ahead-behind',
    '--branch',
    '--long',
    '--no-ahead-behind',
    '--no-branch',
    '--no-column',
    '--no-ignore-submodules',
    '--no-ignored',
    '--no-null',
    '--no-porcelain',
    '--no-renames',
    '--no-short',
    '--no-show-stash',
    '--no-untracked-files',
    '--no-verbose',
    '--null',
    // "--renames" у настоящего git — отрицание "--no-renames" (та же природа, что и "--verify"
    // у merge/commit выше), поэтому текст ошибки называет её "no-no-renames", а не "renames"
    // (см. NO_VALUE_NAME_OVERRIDE и noValueError ниже; сверено напрямую, git 2.53.0, 25.09.2026:
    // `git status --renames=x` → "error: option `no-no-renames' takes no value").
    '--renames',
    '--short',
    '--show-stash',
  ]),
}

const SECTION2_OPTION_SETS: Record<Section2Command, Section2OptionSet> = {
  branch: BRANCH_OPTIONS,
  checkout: CHECKOUT_OPTIONS,
  merge: MERGE_OPTIONS,
  add: ADD_OPTIONS,
  commit: COMMIT_OPTIONS,
  status: STATUS_OPTIONS,
}

export type Section2OptionClassification =
  | { kind: 'unknown'; output: string }
  | { kind: 'real'; resolved: string }
  /**
   * Неоднозначное сокращение длинной опции — у настоящего git есть больше одного подходящего
   * кандидата, но текст ошибки (в отличие от unknown/noValue) здесь НЕ строится: прогон (git
   * 2.53.0, 24.09.2026) показал, что для части случаев (сокращения вида "--no-…", а также сама
   * пара "--verify"/"--post-rewrite" — внутри git это отрицания "--no-verify"/"--no-post-rewrite",
   * поэтому в СВОЁМ сообщении об ошибке git называет их "no-no-verify"/"no-no-post-rewrite", а не
   * тем именем, что видно в `--git-completion-helper-all`) пара кандидатов у настоящего git не
   * совпадает с тем, что даёт наш список `long` в порядке объявления. Правило области (target.md,
   * часть III, правило 2 — «либо дословно, либо явно не разбирать») запрещает наполовину
   * придуманный текст: вместо готового "ambiguous option: … (could be A or B)" с возможно неверной
   * парой — честный отказ без названных кандидатов (be.ambiguousAbbreviationOutOfScope,
   * собирается в branchCommands.ts).
   */
  | { kind: 'ambiguous' }
  /**
   * `--длинная=значение` у опции, которая значения не принимает вовсе (`set.longNoValue`) —
   * настоящий git отказывает на этапе разбора опций и МЕНЯЕТ состояние, только если разбор дошёл
   * до конца успешно (`=значение` у булевой опции не отбрасывается молча — опция не срабатывает
   * как обычно). `output` — готовый буквальный текст.
   */
  | { kind: 'noValue'; output: string }
  /**
   * `-h`/`--help` — настоящий git печатает целую страницу справки; шаг A вообще не разбирает
   * справку ни в каком виде (не третий ответ «такой опции нет» — эти две у git есть буквально).
   */
  | { kind: 'help' }

/**
 * У настоящего git "--verify"/"--post-rewrite" (и любые другие такие пары, но среди опций шага A
 * — только эти две) реализованы как отрицание своей "--no-…" версии, поэтому в сообщении об
 * ошибке "option `…' takes no value" фигурирует внутреннее имя опции ("no-no-verify"/
 * "no-no-post-rewrite"), а не то, что ввёл игрок (сверено напрямую, git 2.53.0, 24.09.2026,
 * `git merge --verify=x`/`git commit --verify=x`/`git commit --post-rewrite=x`). Единственное
 * место, где это различие видно во всём шаге A, — именно здесь: для реализованной обработки
 * (real/optionOutOfScope) и для ambiguous эта пара ничем не отличается от прочих опций.
 */
const NO_VALUE_NAME_OVERRIDE: Readonly<Record<string, string>> = {
  '--verify': 'no-no-verify',
  '--post-rewrite': 'no-no-post-rewrite',
  '--renames': 'no-no-renames',
}

function noValueError(resolved: string): string {
  const name = NO_VALUE_NAME_OVERRIDE[resolved] ?? resolved.slice(2)
  return `error: option \`${name}' takes no value`
}

/**
 * "--no-no-verify"/"--no-no-post-rewrite" — двойное отрицание, которое настоящий git
 * ПРИНИМАЕТ буквально (сверено напрямую, git 2.53.0, 24.09.2026: `git merge --no-no-verify
 * <ветка>` работает как без `--no-verify` вовсе), но это НЕ общая возможность «любую "--no-X"
 * можно отрицать ещё раз» — `git branch --no-no-quiet` реально отвечает "unknown option" (тот же
 * прогон): двойное отрицание существует только для этих двух опций, потому что внутри git они САМИ
 * реализованы как отрицание ("no_verify"/"no_post_rewrite" — исходное булево поле называется с
 * "no_", поэтому "--verify"/"--post-rewrite" настоящий git печатает как "no-no-verify"/
 * "no-no-post-rewrite", см. NO_VALUE_NAME_OVERRIDE выше). Проверяется ТОЧНЫМ совпадением, а не
 * через `set.long`/сокращения — сверено, что это НЕ участвует в поиске абревиатур настоящего git
 * (`git merge --no-n` — genuinely "unknown option `no-n'", НЕ неоднозначность с "no-no-verify",
 * хотя по буквам это был бы валidный префикс): добавление в `long` дало бы ложную двусмысленность,
 * которой у git нет.
 */
const DOUBLE_NEGATION_LITERALS: Readonly<Record<Section2Command, ReadonlySet<string>>> = {
  branch: new Set(),
  checkout: new Set(),
  merge: new Set(['--no-no-verify']),
  add: new Set(),
  commit: new Set(['--no-no-verify', '--no-no-post-rewrite']),
  status: new Set(['--no-no-renames']),
}

/**
 * Классифицирует ОДИН аргумент-флаг ("-x", кластер "-foo" или "--bogus"/"--mess") для команды
 * `cmd`: `real` — опция (или, для кластера, ВСЕ буквы кластера) у настоящего git существует —
 * `resolved` даёт каноническое имя (для короткой формы/кластера — тот же токен, для длинной —
 * её саму или то, во что она однозначно разворачивается); дальше решает вызывающий код
 * (be.optionOutOfScope, «реальная возможность, здесь не разбирается», ИЛИ, если `resolved`
 * совпал с флагом, который шаг A реализует буквально, — обычная обработка этого флага, см.
 * handleBranch: `--del` резолвится в `--delete`, который уже реализован). `unknown` — готовый
 * буквальный текст ошибки git (без usage-блока, см. шапку файла и precedent раздела 1:
 * commands.ts, handleStatus — там тоже только первая строка). `noValue` — тоже готовый буквальный
 * текст git. `ambiguous`/`help` без готового текста — вызывающий код сам собирает честный отказ
 * (be.ambiguousAbbreviationOutOfScope/be.helpOutOfScope), см. комментарии у соответствующих кодов
 * ClassifySection2OptionClassification выше.
 *
 * `-h`/`--help` проверяются раньше остального разбора — настоящий git перехватывает их до
 * специфичных для команды опций (сверено напрямую, git 2.53.0: `-h` печатает короткую usage-
 * подсказку для ЛЮБОЙ из пяти команд, а не «unknown switch»). "--end-of-options" — тоже настоящая
 * возможность parse-options.c, общая для всех команд git (не специфична ни для одной из пяти,
 * поэтому не хранится в per-команда `long`, а проверяется здесь же): ведёт себя как "--" (дальше
 * — не опции), но НЕ отключает pathspec/revision-магию так, как это делает "--" (сверено
 * напрямую, git 2.53.0: `git branch --end-of-options` — голый список, как `git branch`).
 *
 * Короткие кластеры разбираются ПОБУКВЕННО, как parse-options.c: `git branch -foo` реально
 * разбирается как "-f" "-o" "-o" — первая буква (f) существует (--force), а вторая (o) нет,
 * поэтому настоящий git останавливается на НЕЙ: "error: unknown switch `o'" — не на первой
 * букве целиком слова (сверено напрямую, git 2.53.0). Если все буквы кластера существуют
 * (например "-fm" у branch), это тоже реальная возможность git (комбинация коротких флагов),
 * которую шаг A не разбирает — тоже `real`, а не «unknown» (короткие опции git не сокращает,
 * это касается только длинных, см. abbreviatedOptionCandidates, optionAbbrev.ts).
 *
 * Буква из `set.shortValue` обрывает разбор кластера: она принимает ОБЯЗАТЕЛЬНОЕ
 * значение, и весь остаток токена после неё — это значение, а не ещё флаги (parse-options.c
 * ведёт себя так же: `git checkout -bfeature` реально создаёт ветку "feature", а не разбирает
 * "f"/"e"/"a"/"t"/"u"/"r"/"e" как отдельные булевы флаги). Классификатор здесь НЕ извлекает само
 * значение (это дело конкретного обработчика команды, см. handleCheckout) — он только отвечает
 * «реальна ли буква», а `resolved` называет часть токена ДО и ВКЛЮЧАЯ эту букву (например "-b"
 * для голого "-bfeature", "-qb" для "-qbfeature" — буква перед ней была булевым флагом). У коротких
 * опций "=значение" не бывает вовсе (это синтаксис только длинных опций) — `longNoValue`/`noValue`
 * к короткой форме не относятся.
 *
 * Длинные опции ("--xxx") настоящий git принимает и в виде однозначного сокращения (target.md,
 * часть III, правило 1 — «При сомнении…»; сверено напрямую на git 2.53.0, 24.09.2026, для каждой
 * из пяти команд шага A): сокращение резолвится в каноническое имя ДО
 * решения "real"/"unknown"/"noValue" — значит `git commit --mess` классифицируется ровно так же,
 * как `git commit --message` (оба — `real`, resolved: "--message"), а не как выдуманная
 * неизвестная опция.
 *
 * Значение после "=" у длинной опции (`--bogus=1`) НЕ обрезается в тексте unknown (расхождение
 * B1) — обрезается только при поиске самой опции/кандидатов (`bare`).
 */
export function classifySection2Option(cmd: Section2Command, token: string): Section2OptionClassification {
  if (token === '-h' || token === '--help') return { kind: 'help' }
  // `--help-all` у всех шести команд шага A печатает usage (код 129, как `-h`) и распознаётся в любом
  // месте списка опций, слева направо: опция раньше неё с ошибкой выигрывает. `--git-completion-helper`
  // у них существует (список опций, код 0), но шаг A его не разбирает — это «real»; только как
  // ЕДИНСТВЕННЫЙ аргумент (см. completionHelperMisuse). Сверено на git 2.53.0, 06.10.2026.
  if (token === '--help-all') return { kind: 'help' }
  if (token === '--git-completion-helper') return { kind: 'real', resolved: token }
  // Общая для всех команд git возможность parse-options.c, не специфичная ни для одной из пяти
  // команд шага A — поэтому нет ни в одном per-команда `long` и всегда "real" буквально.
  if (token === '--end-of-options') return { kind: 'real', resolved: '--end-of-options' }

  const set = SECTION2_OPTION_SETS[cmd]
  if (token.startsWith('--')) {
    const bare = token.split('=')[0]
    const hasValue = bare.length !== token.length
    // Двойное отрицание ("--no-no-verify"/"--no-no-post-rewrite") — точное совпадение, вне
    // обычного механизма сокращений (см. комментарий у DOUBLE_NEGATION_LITERALS выше).
    if (DOUBLE_NEGATION_LITERALS[cmd].has(bare)) {
      if (hasValue) return { kind: 'noValue', output: noValueError(bare) }
      return { kind: 'real', resolved: bare }
    }
    if (set.long.includes(bare)) {
      if (hasValue && set.longNoValue.has(bare)) return { kind: 'noValue', output: noValueError(bare) }
      return { kind: 'real', resolved: bare }
    }
    if (bare.length > 2) {
      const candidates = abbreviatedOptionCandidates(set.long, bare)
      if (candidates.length === 1) {
        const resolved = candidates[0]
        if (hasValue && set.longNoValue.has(resolved)) return { kind: 'noValue', output: noValueError(resolved) }
        return { kind: 'real', resolved }
      }
      if (candidates.length > 1) return { kind: 'ambiguous' }
    }
    // Расхождение B1: "=значение" остаётся в тексте ошибки — git его не отрезает.
    return { kind: 'unknown', output: `error: unknown option \`${token.slice(2)}'` }
  }
  const letters = token.slice(1)
  for (let i = 0; i < letters.length; i++) {
    const ch = letters[i]
    if (set.shortValue.has(ch)) return { kind: 'real', resolved: '-' + letters.slice(0, i + 1) }
    if (!set.short.has(ch)) return { kind: 'unknown', output: `error: unknown switch \`${ch}'` }
  }
  return { kind: 'real', resolved: token }
}

/**
 * `--git-completion-helper` git признаёт только единственным аргументом команды (тогда печатает
 * список опций, код 0). Если аргументов больше, это обычная неизвестная опция:
 * "error: unknown option `git-completion-helper'" (код 129) — и слева направо, то есть раньше неё
 * разобранная ошибка или справка выигрывает. Возвращает текст этой ошибки или `null`, если форма не
 * его случай: флага нет, он единственный (дальше честный отказ области из classifySection2Option),
 * или перед ним что-то, из-за чего его позиция неясна (`--`, `--end-of-options`, опция раньше с
 * ошибкой/справкой, опция раньше, которая могла забрать его как значение) — тогда ответ даёт обычный
 * разбор. Сверено на git 2.53.0, 06.10.2026, для status/add/commit/branch/checkout/merge.
 */
export function completionHelperMisuse(cmd: Section2Command, args: readonly string[]): string | null {
  const at = args.indexOf('--git-completion-helper')
  if (at === -1 || args.length === 1) return null
  const set = SECTION2_OPTION_SETS[cmd]
  for (const token of args.slice(0, at)) {
    if (token === '--' || token === '--end-of-options') return null
    if (!token.startsWith('-') || token === '-') continue
    const classified = classifySection2Option(cmd, token)
    if (classified.kind !== 'real') return null
    if (token.startsWith('--')) {
      // Длинная опция без «=»: может ожидать значение следующим словом — неясно, чем стал флаг.
      if (!token.includes('=') && !set.longNoValue.has(classified.resolved)) return null
    } else if (set.shortValue.has(token[token.length - 1])) {
      return null
    }
  }
  return "error: unknown option `git-completion-helper'"
}
