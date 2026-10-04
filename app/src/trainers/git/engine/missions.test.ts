import { describe, expect, it } from 'vitest'
import { createSection, deleteFile, editFile, getMissions, resetSection, runCommand } from './index'
import type { SectionState } from './index'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

function doneMap(state: SectionState): Record<string, boolean> {
  return Object.fromEntries(getMissions(state).map((m) => [m.id, m.done]))
}

describe('spec 2.8 — миссии раздела 1', () => {
  it('spec S1-110..S1-114: изначально все 5 миссий не выполнены, порядок соответствует спеку', () => {
    const missions = getMissions(createSection())
    expect(missions.map((m) => m.id)).toEqual(['init', 'status', 'addIndexHtml', 'firstCommit', 'secondCommit'])
    expect(missions.every((m) => !m.done)).toBe(true)
  })

  it('spec S1-110: миссия 1 — git init', () => {
    const state = run(createSection(), 'git init')
    expect(doneMap(state).init).toBe(true)
  })

  it('spec S1-111: миссия 2 — успешная команда git status в истории; отказ до init не считается', () => {
    const failed = run(createSection(), 'git status') // Ш0 → отказ
    expect(doneMap(failed).status).toBe(false)
    const ok = run(createSection(), 'git init', 'git status')
    expect(doneMap(ok).status).toBe(true)
  })

  it('target.md, B1: миссия 2 засчитывается и при ведущих пробелах перед командой — команда всё равно выполнилась', () => {
    const state = run(createSection(), 'git init', '   git status')
    expect(doneMap(state).status).toBe(true)
  })

  it('spec S1-112: миссия 3 — index.html в индексе', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    expect(doneMap(state).addIndexHtml).toBe(true)
  })

  it('spec S1-113: миссия 4 — хотя бы один коммит', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "x"')
    expect(doneMap(state).firstCommit).toBe(true)
  })

  it('spec S1-114: миссия 5 — не меньше двух коммитов', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    expect(doneMap(state).secondCommit).toBe(false)
    state = editFile(state, 'index.html')
    state = run(state, 'git add index.html', 'git commit -m "Второй"')
    expect(doneMap(state).secondCommit).toBe(true)
  })

  it('target.md п.2: миссия, однажды засчитанная, остаётся засчитанной, даже если условие перестало выполняться', () => {
    let state = run(createSection(), 'git init', 'git add index.html')
    expect(doneMap(state).addIndexHtml).toBe(true)
    // "снимаем" файл с учёта иначе, чем в исходном spec (git rm вне границ раздела 1): удаляем сам файл.
    state = deleteFile(state, 'index.html')
    state = run(state, 'git add index.html') // теперь фиксирует удаление, index.html выходит из индекса как ключ
    expect('index.html' in state.index).toBe(false)
    // По исходной spec (без target.md) миссия 3 сейчас должна была бы "слететь" — но per target.md она остаётся выполненной.
    expect(doneMap(state).addIndexHtml).toBe(true)
  })

  it('spec S1-26 (сброс раздела): resetSection снимает все миссии', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "x"')
    expect(Object.values(doneMap(state)).some(Boolean)).toBe(true)
    expect(Object.values(doneMap(resetSection())).some(Boolean)).toBe(false)
  })

  it('тексты и подсказки миссий соответствуют словарю (без склейки строк в движке)', () => {
    const missions = getMissions(createSection())
    expect(missions[0]).toMatchObject({ text: 'Инициализируй репозиторий.', hint: 'git init' })
    expect(missions[2]).toMatchObject({ text: 'Добавь index.html в индекс.', hint: 'git add index.html' })
  })
})
