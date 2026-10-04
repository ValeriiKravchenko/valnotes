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

/** Классификация одной опции по правилу 1 — используется во всех трёх обработчиках (add/commit/status). */
export type OptionClassification = 'scope' | 'outOfScope' | 'unknown' | 'ambiguous'

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
