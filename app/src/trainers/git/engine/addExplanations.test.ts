// ============================================================
// Раздел 1: пояснения к git add выбираются по тому, что реально случилось с индексом
// (target.md, A2 и A4), а «*» названа работой шелла. Факты сверены на git 2.53.0:
// - git add ., -A, <файл>, * без изменений: пустой вывод, код 0;
// - «*» из шелла не содержит скрытых и удалённых файлов; если подставлять нечего, git
//   получает «*» буквально и сам сопоставляет её со скрытыми и удалёнными файлами.
// ============================================================
import { describe, expect, it } from 'vitest'
import { createFile, createSection, deleteFile, runCommand } from './index'
import type { SectionState } from './index'
import { ru } from '../locales/ru'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

/** Репозиторий с закоммиченным index.html. */
function committed(): SectionState {
  return run(createSection(), 'git init', 'git add index.html', 'git commit -m "one"')
}

describe('git add без изменений: «копировать нечего» (target.md, A2)', () => {
  it.each(['git add .', 'git add -A', 'git add index.html', 'git add *'])('%s после коммита — addNothingNew, вывод пуст', (cmd) => {
    const { result } = runCommand(committed(), cmd)
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe('')
    expect(result?.explanation).toContain(ru.explain.addNothingNew)
    expect(result?.explanation).not.toContain('скопирован')
  })

  it('git add . в репозитории без файлов — тоже addNothingNew', () => {
    const state = deleteFile(run(createSection(), 'git init'), 'index.html')
    const { result } = runCommand(state, 'git add .')
    expect(result?.explanation).toBe(ru.explain.addNothingNew)
  })

  it('повторный git add того же подготовленного файла — addNothingNew', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    expect(runCommand(state, 'git add index.html').result?.explanation).toBe(ru.explain.addNothingNew)
  })

  it('когда файл действительно скопирован, прежний текст сохраняется', () => {
    const { result } = runCommand(run(createSection(), 'git init'), 'git add .')
    expect(result?.explanation).toBe(ru.explain.addContent(1))
  })
})

describe('git add * — «*» подставляет шелл (target.md, A4)', () => {
  it('новый файл рядом с закоммитенным: шелл назван исполнителем, подставленные файлы перечислены', () => {
    const state = createFile(committed(), 'b.txt')
    const { result } = runCommand(state, 'git add *')
    expect(result?.explanation).toContain(ru.explain.addContent(1))
    expect(result?.explanation).toContain(ru.explain.addStarExpanded(['b.txt', 'index.html']))
    expect(result?.explanation).toContain('шелл')
  })

  it('скрытый файл с изменениями и удалённый файл: пояснение называет обоих пропущенных', () => {
    let state = createFile(committed(), 'b.txt')
    state = createFile(state, '.hidden')
    state = deleteFile(state, 'index.html')
    const { state: after, result } = runCommand(state, 'git add *')
    // Состояние соответствует git: подготовлен только b.txt, удаление и скрытый файл остались.
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  b.txt\n D index.html\n?? .hidden')
    expect(result?.explanation).toContain(ru.explain.addStarExpanded(['b.txt']))
    expect(result?.explanation).toContain(ru.explain.addStarSkippedHidden(['.hidden']))
    expect(result?.explanation).toContain(ru.explain.addStarSkippedDeleted(['index.html']))
  })

  it('пропущенных нет — о них ничего не сказано', () => {
    const state = createFile(committed(), 'b.txt')
    const text = runCommand(state, 'git add *').result?.explanation ?? ''
    expect(text).not.toContain('Скрытые файлы не добавлены')
    expect(text).not.toContain('Удаление не подготовлено')
  })

  it('скрытый файл без отличий от индекса пропущенным не называется', () => {
    let state = createFile(committed(), '.hidden')
    state = run(state, 'git add .hidden', 'git commit -m "h"')
    state = createFile(state, 'b.txt')
    const text = runCommand(state, 'git add *').result?.explanation ?? ''
    expect(text).not.toContain('Скрытые файлы не добавлены')
  })

  it('нет видимых файлов: «*» остаётся буквальной, git берёт скрытые и удалённые (addStarLiteral)', () => {
    let state = createFile(committed(), '.hidden')
    state = deleteFile(state, 'index.html')
    const { state: after, result } = runCommand(state, 'git add *')
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  .hidden\nD  index.html')
    expect(result?.explanation).toContain(ru.explain.addStarLiteral)
    expect(result?.explanation).not.toContain('подставил шелл')
  })

  it('«*» в кавычках — работа git, пояснение про подстановку шелла не добавляется', () => {
    const state = createFile(committed(), 'b.txt')
    const text = runCommand(state, "git add '*'").result?.explanation ?? ''
    expect(text).not.toContain('подставил шелл')
    expect(text).not.toContain(ru.explain.addStarLiteral)
  })

  // Смешанные аргументы: списки «не добавлено» строятся по индексу ПОСЛЕ команды.
  // Рабочее дерево: b.txt (новый), .hidden (новый), index.html удалён с диска. Прогон git 2.53.0:
  //   git add * .hidden      -> A  .hidden / A  b.txt /  D index.html
  //   git add * .            -> A  .hidden / A  b.txt / D  index.html
  //   git add * index.html   -> A  b.txt / D  index.html / ?? .hidden
  function mixedTree(): SectionState {
    let state = createFile(committed(), 'b.txt')
    state = createFile(state, '.hidden')
    return deleteFile(state, 'index.html')
  }

  it('git add * .hidden: скрытый файл подготовлен явно — пропущенным не называется, удаление названо', () => {
    const { state: after, result } = runCommand(mixedTree(), 'git add * .hidden')
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  .hidden\nA  b.txt\n D index.html')
    expect(result?.explanation).not.toContain(ru.explain.addStarSkippedHidden(['.hidden']))
    expect(result?.explanation).toContain(ru.explain.addStarSkippedDeleted(['index.html']))
  })

  it('git add * .: подготовлено всё — ни скрытые, ни удалённые пропущенными не называются', () => {
    const { state: after, result } = runCommand(mixedTree(), 'git add * .')
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  .hidden\nA  b.txt\nD  index.html')
    expect(result?.explanation).not.toContain(ru.explain.addStarSkippedHidden(['.hidden']))
    expect(result?.explanation).not.toContain(ru.explain.addStarSkippedDeleted(['index.html']))
  })

  it('git add * index.html: удаление подготовлено явно — не названо, скрытый файл назван', () => {
    const { state: after, result } = runCommand(mixedTree(), 'git add * index.html')
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  b.txt\nD  index.html\n?? .hidden')
    expect(result?.explanation).not.toContain(ru.explain.addStarSkippedDeleted(['index.html']))
    expect(result?.explanation).toContain(ru.explain.addStarSkippedHidden(['.hidden']))
  })

  it('git add * в пустом репозитории: fatal, а не молчание (git: код 128; раздел 1 код выхода не ведёт)', () => {
    const state = deleteFile(run(createSection(), 'git init'), 'index.html')
    const { result } = runCommand(state, 'git add *')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("fatal: pathspec '*' did not match any files")
  })

  // Прогон git 2.53.0 на mixedTree():
  //   git add * -- b.txt   -> A  b.txt /  D index.html / ?? .hidden
  //   git add 'b*' .hidden -> A  .hidden / A  b.txt /  D index.html
  //   git add * nosuch     -> fatal: pathspec 'nosuch' did not match any files, код 128, индекс не изменён
  //   git add * *          -> A  b.txt /  D index.html / ?? .hidden, код 0
  it('git add * -- b.txt: после «--» b.txt — путь, «*» всё равно подставил шелл', () => {
    const { state: after, result } = runCommand(mixedTree(), 'git add * -- b.txt')
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  b.txt\n D index.html\n?? .hidden')
    expect(result?.explanation).toContain(ru.explain.addStarExpanded(['b.txt']))
  })

  it("git add 'b*' .hidden: шаблон в кавычках — работа git, про шелл ни слова", () => {
    const { state: after, result } = runCommand(mixedTree(), "git add 'b*' .hidden")
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  .hidden\nA  b.txt\n D index.html')
    expect(result?.explanation).not.toContain('подставил шелл')
  })

  it('git add * nosuch: отказ атомарный, индекс не изменён, пояснение про настоящее имя', () => {
    const before = mixedTree()
    const { state: after, result } = runCommand(before, 'git add * nosuch')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("fatal: pathspec 'nosuch' did not match any files")
    expect(result?.explanation).toBe(ru.explain.addPathspecNotFound)
    expect(runCommand(after, 'git status -s').result?.output).toBe(' D index.html\n?? .hidden\n?? b.txt')
  })

  it('git add * *: состояние как у одной «*», файл в пояснении назван один раз', () => {
    const { state: after, result } = runCommand(mixedTree(), 'git add * *')
    expect(runCommand(after, 'git status -s').result?.output).toBe('A  b.txt\n D index.html\n?? .hidden')
    expect(result?.explanation).toContain(ru.explain.addStarExpanded(['b.txt']))
    expect(result?.explanation).not.toContain('«b.txt», «b.txt»')
  })

  it('git add * в пустом репозитории: пояснение — «*» шаблон без совпадений, а не про имя файла', () => {
    const state = deleteFile(run(createSection(), 'git init'), 'index.html')
    const { result } = runCommand(state, 'git add *')
    expect(result?.explanation).toBe(ru.explain.addStarNoMatch)
    expect(result?.explanation).not.toContain('Имя должно совпадать')
    // git: и при дополнительных аргументах первой отказывает «*» (код 128)
    expect(runCommand(state, 'git add * nosuch').result?.output).toBe("fatal: pathspec '*' did not match any files")
    expect(runCommand(state, 'git add * nosuch').result?.explanation).toBe(ru.explain.addStarNoMatch)
  })

  it('настоящее имя, которого нет, — прежнее пояснение addPathspecNotFound', () => {
    const { result } = runCommand(committed(), 'git add nosuch')
    expect(result?.explanation).toBe(ru.explain.addPathspecNotFound)
  })

  it('git add . и git add -A про шелл не говорят', () => {
    const state = createFile(committed(), 'b.txt')
    expect(runCommand(state, 'git add .').result?.explanation).toBe(ru.explain.addContent(1))
    expect(runCommand(state, 'git add -A').result?.explanation).toBe(ru.explain.addContent(1))
  })
})

describe('git init с аргументами — честный отказ, а не поддельный вывод', () => {
  it.each(['git init extra', 'git init -q', 'git init -b main', 'git init --bare', 'git init .'])('%s — отказ с маркером, состояние не меняется', (cmd) => {
    const before = createSection()
    const { state, result } = runCommand(before, cmd)
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(ru.errors.initArgumentsOutOfScope(cmd))
    expect(result?.output.startsWith('[тренажёр]')).toBe(true)
    expect(state.initialized).toBe(false)
  })
})
