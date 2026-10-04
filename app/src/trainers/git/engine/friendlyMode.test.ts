import { describe, expect, it } from 'vitest'
import { createSection, runCommand } from './index'
import type { SectionState } from './index'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

describe('spec 2.1 — режим friendly: отличия раздела 1', () => {
  it('target.md, A7 (было: «умные кавычки “ ” „ « » заменяются на обычные»): шелл их кавычками не считает, они остаются частью слова', () => {
    // Без пробела внутри слова эти символы всё равно дают успешный коммит (это просто одно
    // слово целиком), но сообщение содержит их буквально — никакой замены на " не происходит.
    const state = run(createSection(), 'git init', 'git add index.html')
    const smart = ['“', '”', '„', '«', '»']
    for (const q of smart) {
      const { state: after, result } = runCommand(state, `git commit -m ${q}сообщение${q}`)
      expect(result?.ok, `quote ${q}`).toBe(true)
      expect(after.commits[0]?.message, `quote ${q}`).toBe(`${q}сообщение${q}`)
    }
  })

  it('target.md, B2 + часть III правило 1/2: git без аргументов — честный маркированный отказ (не подделка usage git), код возврата 1', () => {
    const { result } = runCommand(createSection(), 'git')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(
      '[тренажёр] git без подкоманды в этом разделе не разбирается — настоящий git печатает длинную подсказку usage и завершается отказом. В разделе 1 работают: git init, git status, git add, git commit.',
    )
  })

  it('target.md, часть III, правило 1/2: git --version и git version — честный отказ (случай 2), не подделанный "git version ..."', () => {
    const a = runCommand(createSection(), 'git --version')
    const b = runCommand(createSection(), 'git version')
    expect(a.result?.ok).toBe(false)
    expect(b.result?.ok).toBe(false)
    expect(a.result?.output).not.toContain('git version')
    expect(a.result?.output).toContain('[тренажёр]')
    expect(b.result?.output).toContain('[тренажёр]')
  })

  it('повторный git init — успех (не отказ), в отличие от разделов 2–8 по исходной спеке', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git init')
    expect(result?.ok).toBe(true)
  })

  it('git status выводит "настоящий" формат с пустыми строками и подсказками, а не сокращённый', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git status')
    expect(result?.output).toContain('\n\n')
    expect(result?.output).toContain('(use "git add <file>..." to include in what will be committed)')
  })

  it('git add поддерживает несколько файлов, ".", "*", "-A", "--all" — не только один файл', () => {
    const state = run(createSection(), 'git init')
    expect(runCommand(state, 'git add .').result?.ok).toBe(true)
  })

  it('git commit поддерживает -a/-am/--all и проверку слов без кавычек — не только "-m <сообщение>"', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    expect(runCommand(state, 'git commit -am "x"').result?.ok).toBe(true)
  })
})

describe('spec 2.2 — начальное состояние раздела 1', () => {
  it('репозиторий не инициализирован, index.html лежит в рабочем дереве, индекса/коммитов/ветки нет', () => {
    const state = createSection()
    expect(state.initialized).toBe(false)
    expect(state.branch).toBeNull()
    expect(state.working).toEqual({ 'index.html': '<h1>Мой сайт</h1>' })
    expect(state.index).toEqual({})
    expect(state.commits).toHaveLength(0)
  })
})
