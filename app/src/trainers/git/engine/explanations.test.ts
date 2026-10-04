import { describe, expect, it } from 'vitest'
import { createFile, createSection, deleteFile, runCommand } from './index'
import type { SectionState } from './index'
import { ru } from '../locales/ru'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

describe('spec 2.6 — пояснения 💡 раздела 1 (полный список условий)', () => {
  it('git init (новый репозиторий) — explainInitNew', () => {
    const { result } = runCommand(createSection(), 'git init')
    expect(result?.explanation).toBe(ru.explain.initNew)
  })

  it('git init (существующий репозиторий) — explainInitReinit', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git init')
    expect(result?.explanation).toBe(ru.explain.initReinit)
  })

  it('git status (любой вариант, включая -s) — explainStatus', () => {
    const state = run(createSection(), 'git init')
    expect(runCommand(state, 'git status').result?.explanation).toBe(ru.explain.status)
    expect(runCommand(state, 'git status -s').result?.explanation).toBe(ru.explain.status)
    expect(runCommand(state, 'git status --short').result?.explanation).toBe(ru.explain.status)
  })

  it('target.md, A3: три области названы HEAD, индекс, рабочее дерево — не «отслеживается / в индексе / нет»', () => {
    expect(ru.explain.status).toContain('HEAD')
    expect(ru.explain.status).toContain('индекс')
    expect(ru.explain.status).toContain('рабочее дерево')
    expect(ru.explain.status).not.toContain('отслеживается')
  })

  it('git add … добавляет содержимое (одна и та же фраза для add, add ., add -A) — explainAddContent', () => {
    const state = run(createSection(), 'git init')
    expect(runCommand(state, 'git add index.html').result?.explanation).toBe(ru.explain.addContent(1))
    expect(runCommand(state, 'git add .').result?.explanation).toBe(ru.explain.addContent(1))
    expect(runCommand(state, 'git add -A').result?.explanation).toBe(ru.explain.addContent(1))
  })

  it('git add . с несколькими новыми файлами сразу — множественное число', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, 'second.txt')
    const { result } = runCommand(state, 'git add .')
    expect(result?.ok).toBe(true)
    expect(result?.explanation).toBe(ru.explain.addContent(2))
    expect(result?.explanation).not.toBe(ru.explain.addContent(1))
    expect(result?.explanation).toContain('Файлы скопированы')
  })

  it('target.md, A2: git add удалённого файла — explainAddRemoval, а не "скопирован"', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    const deleted = deleteFile(state, 'index.html')
    const { result } = runCommand(deleted, 'git add index.html')
    expect(result?.ok).toBe(true)
    expect(result?.explanation).toBe(ru.explain.addRemoval)
    expect(result?.explanation).not.toContain('скопирован')
  })

  it('target.md, A2: git add . по смеси добавленного и удалённого файла — explainAddMixed', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = deleteFile(state, 'index.html')
    state = createFile(state, 'new.txt')
    const { result } = runCommand(state, 'git add .')
    expect(result?.ok).toBe(true)
    expect(result?.explanation).toBe(ru.explain.addMixed)
  })

  it('git commit … (успех) — explainCommitSuccess', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -m "x"')
    expect(result?.explanation).toBe(ru.explain.commitSuccess)
  })

  it('отказ commit с pathspec ПОСЛЕ -m — подсказка про кавычки', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -m текст два')
    expect(result?.explanation).toBe(ru.explain.commitQuotesPathspec)
  })

  it('отказ commit, "untracked files present" — explainCommitNeedsAdd с реальным именем файла (target.md, п.5)', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git commit -am "x"')
    expect(result?.explanation).toBe(ru.explain.commitNeedsAdd('index.html'))
  })

  it('отказ commit, "working tree clean" — explainCommitClean', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "x"')
    const { result } = runCommand(state, 'git commit -m "y"')
    expect(result?.explanation).toBe(ru.explain.commitClean)
  })

  it('отказ commit, "Aborting" (нет сообщения) — explainCommitAborting', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit')
    expect(result?.explanation).toBe(ru.explain.commitAborting)
  })

  it('отказ add с pathspec — explainAddPathspecNotFound', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git add nosuch')
    expect(result?.explanation).toBe(ru.explain.addPathspecNotFound)
  })

  it('любой отказ "not a git repository" — explainNotAGitRepo', () => {
    const { result } = runCommand(createSection(), 'git status')
    expect(result?.explanation).toBe(ru.explain.notAGitRepo)
  })

  it('всё остальное (неподдерживаемые флаги, вне границ раздела 1) — пояснения нет', () => {
    const state = run(createSection(), 'git init')
    expect(runCommand(state, 'git status -x').result?.explanation).toBeNull()
    expect(runCommand(state, 'git add -p').result?.explanation).toBeNull()
    expect(runCommand(state, 'git commit -x').result?.explanation).toBeNull()
    expect(runCommand(state, 'ls').result?.explanation).toBeNull()
    expect(runCommand(state, 'git').result?.explanation).toBeNull()
    expect(runCommand(state, 'git --version').result?.explanation).toBeNull()
  })
})
