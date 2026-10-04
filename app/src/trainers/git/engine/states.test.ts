import { describe, expect, it } from 'vitest'
import { createSection, deleteFile, getHeadTree, getMissions, getStage, repoHasNoFiles, resetSection, runCommand, Stage } from './index'
import type { SectionState } from './index'
import { ru } from '../locales/ru'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

describe('spec 2.3 — состояния и переходы', () => {
  it('spec 2.2/2.3: начальное состояние — Ш0, index.html лежит в рабочем дереве', () => {
    const s = createSection()
    expect(getStage(s)).toBe(Stage.NoRepo)
    expect(s.working['index.html']).toBe('<h1>Мой сайт</h1>')
    expect(s.initialized).toBe(false)
    expect(s.branch).toBeNull()
  })

  it('spec S1-10: git init в Ш0 создаёт репозиторий, ветку master → Ш1', () => {
    const { state, result } = runCommand(createSection(), 'git init')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe('Initialized empty Git repository in site/.git/')
    expect(state.branch).toBe('master')
    expect(getStage(state)).toBe(Stage.Empty)
  })

  it('target.md, п.3: Stage.Empty смешивает два случая — repoHasNoFiles их различает', () => {
    // Сразу после git init: index.html лежит в рабочем дереве неотслеживаемым — Stage.Empty
    // (Ш1), но это НЕ «нет ни одного файла»: подпись «пусто» тут будет неправдой.
    const withFile = run(createSection(), 'git init')
    expect(getStage(withFile)).toBe(Stage.Empty)
    expect(repoHasNoFiles(withFile)).toBe(false)

    // Тот же Stage.Empty, но единственный файл удалён кнопкой — здесь действительно "пусто".
    const trulyEmpty = deleteFile(withFile, 'index.html')
    expect(getStage(trulyEmpty)).toBe(Stage.Empty)
    expect(repoHasNoFiles(trulyEmpty)).toBe(true)
  })

  it('spec S1-11: команда раздела 1 (in scope) в Ш0 — отказ "not a git repository", состояние не меняется', () => {
    // "git foo" в этот список не входит — target.md, A9: имя неизвестной команды проверяется
    // до репозитория и даёт другой отказ независимо от Ш0/Ш1+ (см. scope.test.ts).
    const base = createSection()
    for (const cmd of ['git status', 'git add index.html', 'git commit -m "x"']) {
      const { state, result } = runCommand(base, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).toBe('fatal: not a git repository (or any of the parent directories): .git')
      expect(result?.explanation, cmd).toBe('Пока нет репозитория — сначала git init.')
      expect(getStage(state), cmd).toBe(Stage.NoRepo)
    }
  })

  it('target.md, часть III («команды, не требующие репозитория» — clone/help/config): реальная команда вне области в Ш0 — честный отказ о границе, НЕ "not a git repository"', () => {
    // Ответ "fatal: not a git repository" здесь не даётся: git clone/help/config репозиторий
    // не нужен вовсе, а git log/branch/blame раздел 1 не реализует. Правило 1 «при сомнении — второй
    // ответ»: раздел 1 просто не берётся судить, что случилось бы для НЕ реализованной здесь
    // команды, — ни успеха, ни "not a git repository" тренажёр не утверждает.
    const base = createSection()
    for (const cmd of ['git log', 'git branch', 'git blame a', 'git clone', 'git help', 'git config -l']) {
      const { state, result } = runCommand(base, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).not.toContain('not a git repository')
      expect(result?.output, cmd).toContain('не реализована в этой части тренажёра')
      expect(getStage(state), cmd).toBe(Stage.NoRepo)
    }
  })

  it('spec S1-12 / target.md B2: "git" без аргументов — отказ и без репозитория тоже; --version/version — тоже честный отказ (правило 1, случай 2), не выдуманный успех', () => {
    // target.md, часть III, правило 1/2: "--version"/"version" — реальная опция, но раздел 1
    // её не разбирает, поэтому это случай 2 (честный отказ), а не имитация успешного вывода
    // git version.
    const base = createSection()
    const noArgs = runCommand(base, 'git')
    expect(noArgs.result?.ok).toBe(false)
    expect(getStage(noArgs.state)).toBe(Stage.NoRepo)
    const version = runCommand(base, 'git --version')
    expect(version.result?.ok).toBe(false)
    expect(getStage(version.state)).toBe(Stage.NoRepo) // тоже не зависит от репозитория
    const version2 = runCommand(base, 'git version')
    expect(version2.result?.ok).toBe(false)
  })

  it('spec S1-13: не-git строка — отказ до проверки репозитория, в любом состоянии', () => {
    const { result: r0 } = runCommand(createSection(), 'ls')
    expect(r0?.ok).toBe(false)
    expect(r0?.output).toBe(ru.errors.bashCommandNotFound('ls'))
    expect(r0?.explanation).toBeNull()

    const initialized = run(createSection(), 'git init')
    const { result: r1 } = runCommand(initialized, 'ls')
    expect(r1?.output).toBe(ru.errors.bashCommandNotFound('ls'))
  })

  it('spec S1-15: повторный git init в Ш1 — успех (не отказ), Ш1 не меняется', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git init')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe('Reinitialized existing Git repository in site/.git/')
    expect(result?.explanation).toBe('Репозиторий уже был создан — повторный git init безопасен: история и файлы не затрагиваются.')
    expect(getStage(after)).toBe(Stage.Empty)
  })

  it('spec S1-16: git add в Ш1 переводит в Ш2', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add index.html')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe('')
    expect(after.index['index.html']).toBe('<h1>Мой сайт</h1>')
    expect(getStage(after)).toBe(Stage.Staged)
  })

  it('spec S1-17: commit в Ш1 (индекс пуст) — отказ с "настоящим" статусом, остаётся Ш1', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git commit -m "x"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(
      'On branch master\n\nNo commits yet\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tindex.html\n\nnothing added to commit but untracked files present (use "git add" to track)',
    )
    expect(result?.explanation).toBe(
      'Коммит берёт только то, что лежит в индексе. Сначала добавь файл: git add index.html — и только потом git commit.',
    )
    expect(getStage(after)).toBe(Stage.Empty)
  })

  it('spec S1-18: commit в Ш2 — root-commit, граф пополняется → Ш3', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m "Первый коммит"')
    expect(result?.ok).toBe(true)
    expect(result?.output).toMatch(/^\[master \(root-commit\) [0-9a-f]{7}\] Первый коммит$/)
    expect(result?.explanation).toBe(
      'Git сохранил содержимое индекса как новый коммит — теперь это часть истории и он появился на графе справа.',
    )
    expect(after.commits).toHaveLength(1)
    expect(getStage(after)).toBe(Stage.Clean)
  })

  it('spec S1-19: commit без -m в Ш2 — отказ "Aborting" (буквальный текст git), индекс не меняется, остаётся Ш2', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit')
    expect(result?.ok).toBe(false)
    // target.md, часть III, правило 2: вывод — буквальная строка git, а объяснение про
    // редактор — в пояснении (см. commands.ts, handleCommit, message === null).
    expect(result?.output).toBe('Aborting commit due to empty commit message.')
    expect(result?.explanation).toBe(ru.explain.commitAborting)
    expect(after.index).toEqual(state.index)
    expect(getStage(after)).toBe(Stage.Staged)
  })

  it('spec S1-21/S1-22: правка → add → commit переводит Ш4 (staged) → Ш3, второй коммит без root-commit', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } } // эмулируем ✎
    expect(getStage(state)).toBe(Stage.Dirty) // Ш4, не подготовлено

    const staged = runCommand(state, 'git add index.html').state
    expect(staged.index['index.html']).toBe(state.working['index.html'])
    expect(getStage(staged)).toBe(Stage.Dirty) // Ш4, подготовлено (ещё не закоммичено)

    const { state: after, result } = runCommand(staged, 'git commit -m "Второй"')
    expect(result?.ok).toBe(true)
    expect(result?.output).toMatch(/^\[master [0-9a-f]{7}\] Второй$/)
    expect(result?.output).not.toContain('root-commit')
    expect(after.commits).toHaveLength(2)
    expect(getStage(after)).toBe(Stage.Clean)
  })

  it('spec S1-23: Ш4 (не подготовлено) commit -m — отказ "no changes added", остаётся Ш4', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { state: after, result } = runCommand(state, 'git commit -m "x"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toContain('Changes not staged for commit:')
    expect(result?.output).toContain('no changes added to commit (use "git add" and/or "git commit -a")')
    expect(result?.explanation).toBe(
      'Коммит берёт только то, что лежит в индексе. Сначала добавь файл: git add index.html — и только потом git commit.',
    )
    expect(getStage(after)).toBe(Stage.Dirty)
  })

  it('spec S1-24: Ш4 (не подготовлено) commit -am "x" стейджит и коммитит одним шагом → Ш3', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { state: after, result } = runCommand(state, 'git commit -am "x"')
    expect(result?.ok).toBe(true)
    expect(after.commits).toHaveLength(2)
    expect(getStage(after)).toBe(Stage.Clean)
  })

  it('spec S1-25: Ш3, commit -m "x" (и просто commit) — отказ "nothing to commit, working tree clean", остаётся Ш3', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    for (const cmd of ['git commit -m "x"', 'git commit']) {
      const { state: after, result } = runCommand(state, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).toBe('On branch master\nnothing to commit, working tree clean')
      expect(result?.explanation, cmd).toBe(
        'Индекс совпадает с последним коммитом — коммитить нечего. Измени файл (✎), сделай git add и повтори commit.',
      )
      expect(getStage(after)).toBe(Stage.Clean)
    }
  })

  it('spec S1-26: "Начать раздел заново" (resetSection) возвращает к Ш0 с пустой историей и снятыми миссиями', () => {
    const dirty = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    const fresh = resetSection()
    expect(getStage(fresh)).toBe(Stage.NoRepo)
    expect(fresh.history).toHaveLength(0)
    expect(getMissions(fresh).every((m) => !m.done)).toBe(true)
    expect(dirty.commits).toHaveLength(1) // сброс не мутирует прежнее состояние (чистая функция)
  })
})

describe('getHeadTree — публичный геттер HEAD (дерево последнего коммита; пусто, пока коммитов нет)', () => {
  it('до первого коммита (Ш0/Ш1/Ш2) HEAD пуст, даже если в индексе уже что-то есть', () => {
    expect(getHeadTree(createSection())).toEqual({})
    const initialized = run(createSection(), 'git init')
    expect(getHeadTree(initialized)).toEqual({})
    const staged = run(createSection(), 'git init', 'git add index.html')
    expect(getHeadTree(staged)).toEqual({}) // индекс непустой, HEAD — всё ещё нет коммитов
  })

  it('после коммита HEAD — дерево ИМЕННО последнего коммита, не первого', () => {
    const afterFirst = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    expect(getHeadTree(afterFirst)).toEqual({ 'index.html': '<h1>Мой сайт</h1>' })

    const withSecondFile = { ...afterFirst, working: { ...afterFirst.working, 'index.html': afterFirst.working['index.html'] + ' + правка' } }
    const afterSecond = run(withSecondFile, 'git add index.html', 'git commit -m "Второй"')
    expect(afterSecond.commits).toHaveLength(2)
    // HEAD — это ПОСЛЕДНИЙ коммит: содержимое второго, не первого.
    expect(getHeadTree(afterSecond)).toEqual({ 'index.html': '<h1>Мой сайт</h1> + правка' })
    expect(getHeadTree(afterSecond)).not.toEqual(afterSecond.commits[0].tree)
  })

  it('совпадает с деревом последнего коммита — state.commits[state.commits.length - 1]?.tree', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "x"')
    expect(getHeadTree(state)).toEqual(state.commits[state.commits.length - 1]?.tree ?? {})
    expect(getHeadTree(createSection())).toEqual(createSection().commits[createSection().commits.length - 1]?.tree ?? {})
  })
})
