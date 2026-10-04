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
// Упрощение (см. отчёт о переносе, «список упрощений»): в отличие от
// branchScope.ts здесь НЕТ разбора сокращений длинных опций и однобуквенных
// кластеров ("-графов") — списки опций ниже проверяются точным совпадением.
// Раздел 3 — черновик («сырая версия»), это сознательно упрощённый (менее
// строгий, чем у раздела 2) вариант классификации: он всё равно различает
// три ответа правила 1 корректно (ничего не выдумывает), просто не пытается
// угадывать однозначные сокращения вроде "git log --one" — такой ввод
// получит честный "unknown option" (третий ответ) там, где настоящий git
// придирчивее не был бы, хотя реально принял бы сокращение. Это чуть более
// строгий тренажёр, чем настоящий git, а не более снисходительный — ошибка
// в консервативную сторону, а не в сторону выдумки.
// ============================================================
export { GLOBAL_GIT_OPTIONS, isGlobalGitOption, REAL_GIT_COMMANDS, gitNotACommand } from './branchScope'

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
  return 'unknown'
}
