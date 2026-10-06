// ============================================================
// Раздел 1 git-тренажёра: явная граница области (target.md, часть III,
// «Правило 1. Тренажёр не притворяется, что знает то, чего не знает»).
//
// Это файл ДАННЫХ, а не логики: по одному ему видно, что раздел 1
// моделирует буквально — команды и их опции/сценарии, — не читая
// commands.ts. Логика классификации (что делать с конкретным вводом)
// находится в commands.ts и лишь СВЕРЯЕТСЯ с этими списками.
//
// Правило 1 — три ответа на любую команду / опцию / сценарий:
//  1. значится в SECTION_SCOPE            → воспроизводится точно, как у настоящего git;
//  2. значится в REAL_GIT_COMMANDS / REAL_GIT_OPTIONS, но не в SECTION_SCOPE
//                                          → честный отказ «git это умеет, здесь не разбирается»,
//                                            без поддельного сообщения об ошибке;
//  3. не значится нигде из перечисленного  → в git такого нет — буквальная ошибка git.
//
// «При сомнении — второй ответ» (target.md): если не уверены, покрывает ли
// REAL_GIT_COMMANDS/REAL_GIT_OPTIONS конкретный случай, дополняем список,
// а не оставляем ситуацию падать в третий (претензия на «этого не существует»
// опаснее признанного ограничения).
//
// Оба «широких» списка (REAL_GIT_COMMANDS, REAL_GIT_OPTIONS) НЕ обязаны быть
// исчерпывающими (см. target.md, A10) — они должны покрывать то, что новичок
// реально может встретить в документации/статьях. Сверено напрямую с
// `git <команда> --help` / `git help -a` (git 2.53.0, 20.09.2026) — не по памяти.
// ============================================================
import { abbreviatedOptionCandidates } from './optionAbbrev'
import { classifyOptionToken } from './outOfScopeForms'

/** Область раздела 1 — что реализовано буквально, поведение 1:1 с настоящим git. */
export const SECTION_SCOPE = {
  /** git-подкоманды раздела 1. */
  commands: ['init', 'add', 'commit', 'status'] as const,

  /** Файловые операции самого тренажёра (кнопки редактора) — это не git, см. fileOps.ts. */
  trainerFileOps: ['create', 'edit', 'delete'] as const,

  /** Опции и сценарии в границе — по командам. Всё, чего здесь нет, — второй или третий ответ. */
  options: {
    add: {
      /** git add <pathspec> [<pathspec> ...] */
      pathspec: true,
      /** git add . */
      dot: true,
      /** git add -A / --all */
      flags: ['-A', '--all'] as readonly string[],
      /** "*" целиком отдельным словом раскрывает шелл до вызова git (target.md, A4). */
      shellGlobStar: true,
      /** "--" отделяет опции от pathspec: всё после него — путь, даже если начинается с "-". */
      separator: true,
    },
    commit: {
      /** -m <сообщение> (в т.ч. приклеенная форма -m"текст", target.md A6); -a/--all — застейджить изменения перед коммитом. */
      flags: ['-m', '-a', '--all'] as readonly string[],
      /** git commit -m "..." <pathspec>... — выборочный коммит по путям (target.md, уточнение к A8/A11/A12). */
      pathspec: true,
      /** "--" отделяет опции от pathspec. */
      separator: true,
    },
    status: {
      flags: ['-s', '--short'] as readonly string[],
      /**
       * Настоящий git status фильтрует вывод по pathspec (git-status(1)) — раздел 1 этого
       * не разбирает: второй ответ правила 1 (честный отказ), а не молчаливое игнорирование
       * лишнего аргумента. classifyOption сюда не относится (это не опция, а позиционный
       * аргумент) — проверяется отдельно в commands.ts, handleStatus.
       */
      pathspec: false,
    },
  },
} as const

export type SectionCommand = (typeof SECTION_SCOPE.commands)[number]
export type ScopedOptionCommand = keyof typeof SECTION_SCOPE.options

/**
 * Имена реальных подкоманд git (target.md, A9/A10) — нужны, чтобы различить: «не git-команда
 * вовсе» (третий ответ) от «git-команда, которую раздел 1 не реализует» (второй ответ, см.
 * SECTION_SCOPE.commands выше). Список — смесь основных porcelain-команд из `git help -a`
 * и распространённых plumbing-команд (cat-file, hash-object, rev-parse и т.п.), которые
 * новичок встречает в статьях и документации.
 */
export const REAL_GIT_COMMANDS: ReadonlySet<string> = new Set([
  // porcelain
  'add',
  'am',
  'archive',
  'backfill',
  'bisect',
  'blame',
  'branch',
  'bundle',
  'checkout',
  'cherry-pick',
  'citool',
  'clean',
  'clone',
  'commit',
  'config',
  'describe',
  'diff',
  'fetch',
  'format-patch',
  'fsck',
  'gc',
  'gitk',
  'grep',
  'gui',
  'help',
  'init',
  'log',
  'maintenance',
  'merge',
  'mv',
  'notes',
  'pull',
  'push',
  'range-diff',
  'rebase',
  'reflog',
  'remote',
  'reset',
  'restore',
  'revert',
  'rm',
  'scalar',
  'shortlog',
  'show',
  'sparse-checkout',
  'stash',
  'status',
  'submodule',
  'switch',
  'tag',
  'version',
  'worktree',
  // plumbing
  'cat-file',
  'hash-object',
  'rev-parse',
  'ls-files',
  'ls-tree',
  'write-tree',
  'read-tree',
  'update-index',
  'symbolic-ref',
  'update-ref',
  'commit-tree',
  'show-ref',
  'pack-objects',
  'rev-list',
])

/**
 * Реальные опции `git <команда>`, которые раздел 1 НЕ разбирает — второй ответ правила 1,
 * не третий. Короткие и длинные формы хранятся как отдельные строки без значения (для формы
 * `--длинная=значение` сравнение идёт по части до "="; см. classifyOption в commands.ts).
 * Опции из SECTION_SCOPE.options[cmd].flags сюда сознательно не дублируются.
 * Сверено с `git add --help` / `git commit --help` / `man git-commit` / `git status -x` (git 2.53.0).
 */
export const REAL_GIT_OPTIONS: Record<ScopedOptionCommand, readonly string[]> = {
  add: [
    '-n',
    '--dry-run',
    '-v',
    '--verbose',
    '-i',
    '--interactive',
    '-p',
    '--patch',
    '-U',
    '--unified',
    '--inter-hunk-context',
    '-e',
    '--edit',
    '-f',
    '--force',
    '-u',
    '--update',
    '--renormalize',
    '-N',
    '--intent-to-add',
    '--ignore-removal',
    '--no-all',
    '--refresh',
    '--ignore-errors',
    '--ignore-missing',
    '--sparse',
    '--chmod',
    '--pathspec-from-file',
    '--pathspec-file-nul',
    '--literal-pathspecs',
    '--no-warn-embedded-repo',
  ],
  commit: [
    '-p',
    '--patch',
    '-U',
    '--unified',
    '--inter-hunk-context',
    '-C',
    '--reuse-message',
    '-c',
    '--reedit-message',
    '--fixup',
    '--squash',
    '--reset-author',
    '--short',
    '--branch',
    '--porcelain',
    '--long',
    '-z',
    '--null',
    '-F',
    '--file',
    '--author',
    '--date',
    '--message',
    '-t',
    '--template',
    '-s',
    '--signoff',
    '--no-signoff',
    '--trailer',
    '-n',
    '--verify',
    '--no-verify',
    '--allow-empty',
    '--allow-empty-message',
    '--cleanup',
    '-e',
    '--edit',
    '--no-edit',
    '--amend',
    '--no-post-rewrite',
    '-i',
    '--include',
    '-o',
    '--only',
    '--pathspec-from-file',
    '--pathspec-file-nul',
    '-u',
    '--untracked-files',
    '-v',
    '--verbose',
    '-q',
    '--quiet',
    '--dry-run',
    '--status',
    '--no-status',
    '-S',
    '--gpg-sign',
    '--no-gpg-sign',
  ],
  status: [
    '-v',
    '--verbose',
    '-b',
    '--branch',
    '--show-stash',
    '--ahead-behind',
    '--porcelain',
    '--long',
    '-z',
    '--null',
    '-u',
    '--untracked-files',
    '--ignored',
    '--ignore-submodules',
    '--column',
    '--no-renames',
    '--renames',
    '-M',
    '--find-renames',
  ],
}

/**
 * Полный набор опций, которые настоящий git принимает у add/commit/status: вывод
 * `git <команда> -h` плюс `git <команда> --git-completion-helper` (сверено на git 2.53.0,
 * 04.10.2026). Нужен для
 * границы «принимает git, но раздел не разбирает» (отказ), а не «такой опции нет» (ошибка git):
 * опция вне этого набора и вне REAL_GIT_OPTIONS заведомо не существует. Формы
 * `--no-<имя>` отдельно не перечислены — см. isNegatedRealOption. Список кандидатов для
 * «ambiguous» он не расширяет (A13: считается по SECTION_SCOPE и REAL_GIT_OPTIONS); однозначный
 * префикс из него даёт отказ.
 */
const VERIFIED_GIT_OPTIONS: Record<ScopedOptionCommand, readonly string[]> = {
  add: [
    '--all',
    '--chmod',
    '--dry-run',
    '--edit',
    '--force',
    '--ignore-errors',
    '--ignore-missing',
    '--ignore-removal',
    '--intent-to-add',
    '--inter-hunk-context',
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
    '--patch',
    '--pathspec-file-nul',
    '--pathspec-from-file',
    '--refresh',
    '--renormalize',
    '--sparse',
    '--unified',
    '--update',
    '--verbose',
    '-A',
    '-N',
    '-U',
    '-e',
    '-f',
    '-i',
    '-n',
    '-p',
    '-u',
    '-v',
  ],
  commit: [
    '--ahead-behind',
    '--all',
    '--amend',
    '--author',
    '--branch',
    '--cleanup',
    '--date',
    '--dry-run',
    '--edit',
    '--file',
    '--fixup',
    '--gpg-sign',
    '--include',
    '--inter-hunk-context',
    '--interactive',
    '--long',
    '--message',
    '--no-ahead-behind',
    '--no-all',
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
    '--pathspec-from-file',
    '--porcelain',
    '--post-rewrite',
    '--quiet',
    '--reedit-message',
    '--reset-author',
    '--reuse-message',
    '--short',
    '--signoff',
    '--squash',
    '--status',
    '--template',
    '--trailer',
    '--unified',
    '--untracked-files',
    '--verbose',
    '--verify',
    '-C',
    '-F',
    '-S',
    '-U',
    '-a',
    '-c',
    '-e',
    '-i',
    '-m',
    '-n',
    '-o',
    '-p',
    '-q',
    '-s',
    '-t',
    '-u',
    '-v',
    '-z',
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

/** `--no-<имя>`: git принимает отрицание любой длинной опции, которую знает (parse-options.c). */
function isNegatedRealOption(cmd: ScopedOptionCommand, bare: string): boolean {
  if (!bare.startsWith('--no-')) return false
  const base = '--' + bare.slice('--no-'.length)
  return [...SECTION_SCOPE.options[cmd].flags, ...REAL_GIT_OPTIONS[cmd], ...VERIFIED_GIT_OPTIONS[cmd]].includes(base)
}

/** Классификация одной опции по правилу 1 — используется во всех трёх обработчиках (add/commit/status). */
export type OptionClassification = 'scope' | 'outOfScope' | 'unknown' | 'ambiguous' | 'help'

export interface ClassifiedOption {
  kind: OptionClassification
  /**
   * Каноническое имя опции с учётом сокращения (см. ниже) — например "--mess" разрешается в
   * "--message". Для точного совпадения (без сокращения) совпадает с `bare` (флаг без "=значения").
   * Для kind === 'unknown'/'ambiguous' смысла не имеет как "разрешённое имя" — это просто то,
   * что ввёл игрок.
   */
  resolved: string
  /** Только при kind === 'ambiguous': варианты, которым введённая аббревиатура — префикс (см. abbreviatedOptionCandidates), отсортированы по алфавиту. */
  candidates?: readonly string[]
}

/**
 * @param cmd команда, к которой относится опция
 * @param flag токен опции как он есть, например "-p", "--dry-run=foo" или сокращение "--mess"
 */
export function classifyOption(cmd: ScopedOptionCommand, flag: string): ClassifiedOption {
  // `-h`, `--help-all` печатают usage (код 129), `--help` у git открывает справку (код 0) — это
  // не «unknown». `--help` справкой считается только первым аргументом после подкоманды: с
  // другими аргументами и не первым git отвечает usage или ошибкой `git help` (код 129), и в
  // этих случаях тренажёр тоже отказывает честно, а не печатает справку. Сокращения вроде
  // `--he`, `--help-al` справкой не считаются: для них git отвечает `unknown option`.
  // Сверено на git 2.53.0, 06.10.2026.
  if (flag === '-h' || flag === '--help' || flag === '--help-all') return { kind: 'help', resolved: flag }
  // `--git-completion-helper` и `--end-of-options` у git существуют (список опций для
  // автодополнения; разделитель, как `--`), но раздел их не разбирает — честный отказ области, а
  // не «unknown option». Сверено на git 2.53.0, 06.10.2026.
  if (flag === '--git-completion-helper' || flag === '--end-of-options') return { kind: 'outOfScope', resolved: flag }
  const bare = flag.startsWith('--') ? flag.split('=')[0] : flag
  if (SECTION_SCOPE.options[cmd].flags.includes(bare)) return { kind: 'scope', resolved: bare }
  if (REAL_GIT_OPTIONS[cmd].includes(bare)) return { kind: 'outOfScope', resolved: bare }
  if (bare.startsWith('--') && bare.length > 2) {
    // Поиск ведётся по ОБЪЕДИНЕНИЮ SECTION_SCOPE.options[cmd].flags и REAL_GIT_OPTIONS[cmd] — тех же
    // двух curated-списков, что и точное сравнение выше, а не по полному набору опций настоящего git
    // (REAL_GIT_OPTIONS сознательно не исчерпывающий, см. A10). Значит однозначность здесь
    // определяется относительно НАШИХ списков: если у настоящего git есть опции вне REAL_GIT_OPTIONS,
    // что-то, что мы считаем однозначным, у него самого может оказаться неоднозначным, и наоборот —
    // это продолжение уже принятого для REAL_GIT_OPTIONS риска, не новый (см. abbreviatedOptionCandidates,
    // optionAbbrev.ts).
    const all: readonly string[] = [...SECTION_SCOPE.options[cmd].flags, ...REAL_GIT_OPTIONS[cmd]]
    const candidates = abbreviatedOptionCandidates(all, bare)
    if (candidates.length === 1) {
      const full = candidates[0]
      return { kind: SECTION_SCOPE.options[cmd].flags.includes(full) ? 'scope' : 'outOfScope', resolved: full }
    }
    if (candidates.length > 1) {
      // Сортировка по алфавиту — то самое сознательное упрощение из target.md, A13
      // (см. подробный комментарий у ambiguousOptionOutput, optionAbbrev.ts): настоящий git выбирает
      // пару кандидатов для "(could be A or B)" по своей внутренней логике, а не по алфавиту.
      return { kind: 'ambiguous', resolved: bare, candidates: [...candidates].sort() }
    }
  }
  // Не сокращение из curated-списков: опцию, которую git знает (полный набор или , либо
  // однозначный префикс из полного набора), раздел не разбирает — отказ. Заведомо несуществующая
  // остаётся ошибкой git (B9).
  const cls = classifyOptionToken(bare, {
    inScope: SECTION_SCOPE.options[cmd].flags,
    verifiedReal: [...REAL_GIT_OPTIONS[cmd], ...VERIFIED_GIT_OPTIONS[cmd]],
    exhaustive: true,
  })
  if (cls === 'refuse' || isNegatedRealOption(cmd, bare)) return { kind: 'outOfScope', resolved: bare }
  if (bare.startsWith('--') && bare.length > 2 && VERIFIED_GIT_OPTIONS[cmd].some((o) => o.startsWith(bare))) {
    return { kind: 'outOfScope', resolved: bare }
  }
  return { kind: 'unknown', resolved: bare }
}

/**
 * target.md, часть III, правило 1, случай 2 (ru.errors.optionOutOfScope): полный человекочитаемый
 * список того, что раздел 1 реально умеет для команды `cmd` — не только флаги
 * (SECTION_SCOPE.options[cmd].flags), но и остальные элементы области (обычный pathspec, ".",
 * "*", разделитель "--"), которые тоже заданы данными в SECTION_SCOPE: список "здесь
 * поддерживается" в тексте отказа обязан совпадать с тем, что раздел 1 реально поддерживает
 * (например `git add .`/`git add <файл>` — не только его флаги).
 */
export function describedScope(cmd: ScopedOptionCommand): string[] {
  const opts = SECTION_SCOPE.options[cmd]
  const items: string[] = []
  if ('pathspec' in opts && opts.pathspec) {
    items.push(cmd === 'commit' ? 'git commit -m "..." <файл>' : `git ${cmd} <файл>`)
  }
  if ('dot' in opts && opts.dot) items.push(`git ${cmd} .`)
  items.push(...opts.flags)
  if ('shellGlobStar' in opts && opts.shellGlobStar) items.push(`git ${cmd} *`)
  if ('separator' in opts && opts.separator) items.push('--')
  return items
}

/** Является ли имя подкоманды тем, что раздел 1 реализует буквально (первый ответ правила 1). */
export function isSectionCommand(sub: string): sub is SectionCommand {
  return (SECTION_SCOPE.commands as readonly string[]).includes(sub)
}

/**
 * Разбивает ОДИН токен-кластер коротких опций на отдельные опции: "-sb" → ["-s", "-b"].
 * Ровно то же самое, что делает parse-options.c настоящего git с любой командой (проверено
 * напрямую: `git status -sb` — рабочая команда, "-s" и "-b" разбираются по отдельности).
 * Не трогает длинные опции ("--foo"), разделитель "--" и уже однобуквенный короткий флаг
 * ("-s") — они и так атомарны, возвращаются как есть.
 *
 * commit уже разбирает свои кластеры посимвольно (parseCommitArgs, там же значение "-m"
 * может быть приклеено к остатку кластера — see target.md, A6) — эта функция даёт ту же модель
 * add/status, у которых в разделе 1 нет коротких флагов со значением, поэтому здесь достаточно
 * чистого разбиения без специального случая "остаток кластера — значение".
 */
export function splitShortOptionCluster(token: string): string[] {
  if (!token.startsWith('-') || token.startsWith('--') || token.length <= 2) return [token]
  return token
    .slice(1)
    .split('')
    .map((c) => '-' + c)
}

/**
 * Опции самого git (не подкоманды!) — то, что в SYNOPSIS `git-help(1)` стоит ДО имени команды:
 * `git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>] ...`. Сверено напрямую
 * (`git --help`, git 2.53.0, 20.09.2026): именно этот список выводит сама команда.
 *
 * Раздел 1 их не разбирает (второй ответ правила 1) — это касается и `-C`/`-c`, у которых
 * значение обычно отдельным словом (`git -C <path> status`): раздел 1 не подменяет собой
 * файловую систему/директорию, поэтому не пытается "доразобрать" аргумент и выполнить команду
 * после него — вся строка получает честный отказ по первому же глобальному флагу.
 *
 * Список общий для "--version", "--help"/"-h"/"-C"/"-c" и соседей: git.c обрабатывает такие
 * опции сам, до поиска подкоманды, и на неизвестную отвечает "unknown option: %s" — НЕ "is not
 * a git command" (это сообщение только для имени команды, см. help.c). Правило одно на весь
 * список: любая глобальная опция git получает честный второй ответ, а не выдуманную ошибку про
 * несуществующую команду.
 */
export const GLOBAL_GIT_OPTIONS: ReadonlySet<string> = new Set([
  '-v',
  '--version',
  '-h',
  '--help',
  '-C',
  '-c',
  '--exec-path',
  '--html-path',
  '--man-path',
  '--info-path',
  '-p',
  '--paginate',
  '-P',
  '--no-pager',
  '--no-replace-objects',
  '--no-lazy-fetch',
  '--no-optional-locks',
  '--no-advice',
  '--bare',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
])

/** Токен `git ...` перед подкомандой — настоящая опция самого git (не путать с REAL_GIT_OPTIONS, те относятся к конкретной подкоманде). */
export function isGlobalGitOption(token: string): boolean {
  const bare = token.startsWith('--') ? token.split('=')[0] : token
  return GLOBAL_GIT_OPTIONS.has(bare)
}
