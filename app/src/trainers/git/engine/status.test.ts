import { describe, expect, it } from 'vitest'
import { createFile, createSection, deleteFile, getStatus, runCommand } from './index'
import type { SectionState } from './index'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

describe('spec 2.4 — git status в разделе 1', () => {
  it('spec S1-30: Ш1, файл неотслеживаемый', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git status')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe(
      'On branch master\n\nNo commits yet\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tindex.html\n\nnothing added to commit but untracked files present (use "git add" to track)',
    )
    expect(result?.explanation).toBe(
      'git status ничего не меняет — он просто показывает три области: HEAD (последний коммит), индекс (что подготовлено к следующему коммиту) и рабочее дерево (что сейчас лежит на диске; в некоторых текстах его называют «рабочий каталог» — это то же самое).',
    )
  })

  it('spec S1-31: Ш2 — только "Changes to be committed", без итоговой строки', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git status')
    expect(result?.output).toBe('On branch master\n\nNo commits yet\n\nChanges to be committed:\n\tnew file:   index.html')
  })

  it('spec S1-32: Ш3 — working tree clean', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    const { result } = runCommand(state, 'git status')
    expect(result?.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  it('spec S1-33: Ш4, правка не подготовлена', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { result } = runCommand(state, 'git status')
    expect(result?.output).toBe(
      'On branch master\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n\tmodified:   index.html\n\nno changes added to commit (use "git add" and/or "git commit -a")',
    )
  })

  it('spec S1-34: Ш4, подготовлена правка, затем файл изменён ещё раз — два блока', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    state = run(state, 'git add index.html')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + ещё' } }
    const { result } = runCommand(state, 'git status')
    expect(result?.output).toContain('Changes to be committed:\n\tmodified:   index.html')
    expect(result?.output).toContain('Changes not staged for commit:')
    expect(result?.output).toContain('\tmodified:   index.html')
  })

  it('spec S1-35: файл удалён кнопкой — deleted в notStaged, затем git add переносит его в staged как deleted', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = deleteFile(state, 'index.html')
    const beforeAdd = runCommand(state, 'git status')
    expect(beforeAdd.result?.output).toContain('Changes not staged for commit:')
    expect(beforeAdd.result?.output).toContain('\tdeleted:    index.html')
    expect(beforeAdd.result?.output).toContain('no changes added to commit (use "git add" and/or "git commit -a")')

    const afterAdd = run(state, 'git add index.html')
    const { result } = runCommand(afterAdd, 'git status')
    expect(result?.output).toBe('On branch master\n\nChanges to be committed:\n\tdeleted:    index.html')
  })

  it('spec S1-36: Ш1, единственный файл удалён кнопкой — "nothing to commit (create/copy..."', () => {
    let state = run(createSection(), 'git init')
    state = deleteFile(state, 'index.html')
    const { result } = runCommand(state, 'git status')
    expect(result?.output).toBe('On branch master\n\nNo commits yet\n\nnothing to commit (create/copy files and use "git add" to track)')
  })

  it('spec S1-37: Ш0 — отказ not a git repository (см. S1-11)', () => {
    const { result } = runCommand(createSection(), 'git status')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe('fatal: not a git repository (or any of the parent directories): .git')
  })

  it('spec S1-38: git status -s/--short — короткий формат, отслеживаемые по алфавиту, потом ?? неотслеживаемые', () => {
    const s1 = run(createSection(), 'git init')
    expect(runCommand(s1, 'git status -s').result?.output).toBe('?? index.html')

    const s2 = run(s1, 'git add index.html')
    expect(runCommand(s2, 'git status -s').result?.output).toBe('A  index.html')

    let s3 = run(s2, 'git commit -m "Первый"')
    s3 = { ...s3, working: { ...s3.working, 'index.html': s3.working['index.html'] + ' + правка' } }
    expect(runCommand(s3, 'git status -s').result?.output).toBe(' M index.html')

    const s4 = run(s3, 'git add index.html')
    const s4dirty = { ...s4, working: { ...s4.working, 'index.html': s4.working['index.html'] + ' + ещё' } }
    expect(runCommand(s4dirty, 'git status --short').result?.output).toBe('MM index.html')

    const s5 = deleteFile(s3, 'index.html')
    expect(runCommand(s5, 'git status -s').result?.output).toBe(' D index.html')

    let empty = run(createSection(), 'git init')
    empty = deleteFile(empty, 'index.html')
    empty = run(empty, 'git add .', 'git commit -m "root"')
    expect(runCommand(empty, 'git status -s').result?.ok).toBe(true)
    expect(runCommand(empty, 'git status -s').result?.output).toBe('')
  })

  it('target.md, часть III, правило 1, случай 3: git status -x — такой опции у git нет, буквальная ошибка git, без пояснения', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git status -x')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: unknown switch `x'")
    expect(result?.explanation).toBeNull()
  })

  it('target.md, часть III, правило 1, случай 2: git status --porcelain/-b — опции реальны, но раздел 1 их не разбирает (не "unknown")', () => {
    const state = run(createSection(), 'git init')
    for (const cmd of ['git status --porcelain', 'git status -b', 'git status --ignored']) {
      const { result } = runCommand(state, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).not.toContain('unknown')
      expect(result?.output, cmd).toContain('настоящая опция git')
      expect(result?.explanation, cmd).toBeNull()
    }
  })

  it('target.md, часть III, правило 1, случай 2: git status <pathspec> — честный отказ, не молчаливое игнорирование аргумента', () => {
    // Настоящий git фильтрует вывод status по pathspec (git-status(1)) — раздел 1 этой
    // фильтрации не реализует, поэтому отказывает честно, а не отбрасывает аргумент молча и
    // не выдаёт полный status: тренажёр не должен притворяться, что понял то, чего не разбирает.
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git status что-угодно')
    expect(result?.ok).toBe(false)
    expect(result?.output).toContain('[тренажёр]')
    expect(result?.output).toContain('git status')
    expect(result?.output).toContain('pathspec')
    expect(result?.explanation).toBeNull()

    // Полный вывод status при этом не показывается: аргумент не игнорируется молча.
    const plain = runCommand(state, 'git status')
    expect(result?.output).not.toBe(plain.result?.output)
  })

  it('target.md, часть III, правило 1, случай 2: git status <pathspec> — тот же отказ и с валидной опцией (-s), и с "--" перед путём', () => {
    const state = run(createSection(), 'git init')
    for (const cmd of ['git status -s index.html', 'git status -- index.html']) {
      const { result } = runCommand(state, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).toContain('pathspec')
    }
  })

  it('target.md, A1: untracked определяется по индексу, а не по HEAD — коммит, удаление, git add, создание заново → "??"', () => {
    // Сценарий из target.md (A1): закоммитить файл, удалить, git add (фиксирует удаление —
    // файл уходит из индекса), создать файл заново. Настоящий git покажет одновременно
    // "Changes to be committed: deleted" (индекс разошёлся с HEAD) и "Untracked files" (файла
    // нет в индексе, но он есть в рабочем дереве) — так же, как git rm --cached с последующим
    // воссозданием файла. Untracked определяется по индексу, а не по HEAD: файл, который есть
    // в HEAD, но не в индексе, — неотслеживаемый, а не "изменённый".
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = deleteFile(state, 'index.html')
    state = run(state, 'git add index.html')
    expect('index.html' in state.index).toBe(false)
    state = createFile(state, 'index.html')

    const snapshot = getStatus(state)
    expect(snapshot.untracked).toEqual(['index.html'])
    expect(snapshot.staged).toEqual([{ file: 'index.html', type: 'deleted' }])
    expect(snapshot.notStaged).toEqual([])

    const { result } = runCommand(state, 'git status')
    expect(result?.output).toBe(
      'On branch master\n\nChanges to be committed:\n\tdeleted:    index.html\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tindex.html',
    )

    const short = runCommand(state, 'git status -s').result
    expect(short?.output).toBe('D  index.html\n?? index.html')
  })

  it('доп.: git status после create/delete нескольких файлов не падает и не выходит за рамки формата', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, 'todo.txt')
    const { result } = runCommand(state, 'git status')
    expect(result?.ok).toBe(true)
    expect(result?.output).toContain('todo.txt')
    expect(result?.output).toContain('index.html')
  })

  it('target.md, часть III, правило 1 (пункт 4): git status -sb — кластер коротких опций разбирается посимвольно, "-s" в области, "-b" — честный второй ответ (не "unknown switch \'sb\'")', () => {
    // Проверено на git 2.53.0: "git status -sb" — рабочая команда настоящего git.
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git status -sb')
    expect(result?.ok).toBe(false)
    expect(result?.output).not.toBe("error: unknown switch `sb'")
    expect(result?.output).not.toContain('unknown')
    expect(result?.output).toContain('git status -b')
    expect(result?.output).toContain('настоящая опция git')
  })

  it('кластер "-bs" (обратный порядок) — падает на первом же символе не в области, "-b", даже если "-s" после него', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git status -bs')
    expect(result?.ok).toBe(false)
    expect(result?.output).toContain('git status -b')
  })

  it('кластер с неизвестным git символом внутри — буквальная git-ошибка именно для этого символа, а не для всего токена', () => {
    // Проверено на git 2.53.0: "git status -sx" → "error: unknown switch `x'" (не "sx").
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git status -sx')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: unknown switch `x'")
  })

  it('одиночный короткий флаг не задет кластерным разбором — "-s" и "--short" принимаются без ошибки', () => {
    const state = run(createSection(), 'git init')
    expect(runCommand(state, 'git status -s').result?.ok).toBe(true)
    expect(runCommand(state, 'git status --short').result?.ok).toBe(true)
  })

  it('target.md, часть III, правила 1–2: "--" в status отделяет опции от pathspec так же, как в add/commit — путь после "--", начинающийся с "-", не считается флагом', () => {
    // После "--" всё — пути, даже если начинается с "-": "-weird.txt" не разбирается как флаг.
    let state = run(createSection(), 'git init')
    state = createFile(state, '-weird.txt')
    const { result } = runCommand(state, 'git status -- -weird.txt')
    expect(result?.ok).toBe(false) // pathspec вне области (status.pathspec === false) — честный отказ, не "unknown switch"
    expect(result?.output).toContain('pathspec')
    expect(result?.output).not.toContain('unknown')
  })

  it('target.md, часть III, правила 1–2: порядок файлов в «дружелюбном» status — по алфавиту, а не по порядку операций', () => {
    // Настоящий git печатает пути отсортированными, независимо от порядка, в котором файлы
    // создавались или добавлялись: "alpha.txt" идёт перед "zebra.txt".
    let state = run(createSection(), 'git init')
    state = createFile(state, 'zebra.txt')
    state = createFile(state, 'alpha.txt')
    state = run(state, 'git add zebra.txt', 'git add alpha.txt', 'git add index.html')
    const { result } = runCommand(state, 'git status')
    const zeroIdx = result?.output.indexOf('zebra.txt') ?? -1
    const alphaIdx = result?.output.indexOf('alpha.txt') ?? -1
    const indexIdx = result?.output.indexOf('index.html') ?? -1
    expect(alphaIdx).toBeGreaterThanOrEqual(0)
    expect(alphaIdx).toBeLessThan(indexIdx)
    expect(indexIdx).toBeLessThan(zeroIdx)
  })
})
