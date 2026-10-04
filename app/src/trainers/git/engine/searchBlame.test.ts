// ============================================================
// Раздел 6 git-тренажёра, шаг A: вычисление и форматирование `git blame`
// (searchBlame.ts). Ожидания — буквально из
// docs/git-trainer/reports/section6-git-runs.txt (блок BLAME, Д5, Д13).
// ============================================================
import { describe, expect, it } from 'vitest'
import { computeBlame, formatBlame } from './searchBlame'
import { createSearchSection } from './searchSection'
import { ru } from '../locales/ru'

function makeState() {
  return createSearchSection({ commits: ru.searching.seed.commits })
}

describe('computeBlame — коммит ПОСЛЕДНЕГО изменения строки (target.md, опасное место 9)', () => {
  it('app.js: строка 3 — commit 2 (Марина), строка 5 — commit 3 (Марина), остальные — корневой (Валера)', () => {
    const state = makeState()
    const head = state.branches[state.head]
    const lines = computeBlame(state, head, 'app.js')
    expect(lines).toHaveLength(7)

    const ids = Object.keys(state.commits)
    const byMessage = (msg: string) => ids.find((id) => state.commits[id].message === msg) as string
    const root = byMessage('Первая версия renderCard')
    const c2 = byMessage('Добавить класс card для карточек')
    const c3 = byMessage('Сохранять id товара в data-атрибуте')

    expect(lines.map((l) => l.commitId)).toEqual([root, root, c2, root, c3, root, root])
    expect(lines.map((l) => l.isRoot)).toEqual([true, true, false, true, false, true, true])
    expect(lines.map((l) => l.content)).toEqual([
      'function renderCard(item) {',
      '  const el = document.createElement("div");',
      '  el.className = "card";',
      '  el.textContent = item.title;',
      '  el.dataset.id = item.id;',
      '  return el;',
      '}',
    ])
  })

  it('utils.js и README.md целиком — только корневой коммит (не менялись позже)', () => {
    const state = makeState()
    const head = state.branches[state.head]
    const root = Object.values(state.commits).find((c) => c.message === 'Первая версия renderCard')!.id
    expect(computeBlame(state, head, 'utils.js').every((l) => l.commitId === root)).toBe(true)
    expect(computeBlame(state, head, 'README.md').every((l) => l.commitId === root)).toBe(true)
  })
})

describe('formatBlame — форматы (target.md, «Форматы», опасное место 9/10)', () => {
  it('git blame app.js — полный формат, ^ + 7 знаков у корневого, 8 знаков у остальных', () => {
    const state = makeState()
    const head = state.branches[state.head]
    const lines = computeBlame(state, head, 'app.js')
    const output = formatBlame(state, lines, { suppressAuthor: false })
    const rendered = output.split('\n')
    expect(rendered[0]).toMatch(/^\^[0-9a-f]{7} \(Валера 2026-03-12 10:00:00 \+0300 1\) function renderCard\(item\) \{$/)
    expect(rendered[2]).toMatch(/^[0-9a-f]{8} \(Марина 2026-03-18 11:00:00 \+0300 3\) {3}el\.className = "card";$/)
    expect(rendered[4]).toMatch(/^[0-9a-f]{8} \(Марина 2026-04-02 12:00:00 \+0300 5\) {3}el\.dataset\.id = item\.id;$/)
  })

  it('git blame -s app.js — без автора/даты, тот же порядок хэшей и номеров', () => {
    const state = makeState()
    const head = state.branches[state.head]
    const lines = computeBlame(state, head, 'app.js')
    const output = formatBlame(state, lines, { suppressAuthor: true })
    const rendered = output.split('\n')
    expect(rendered[0]).toMatch(/^\^[0-9a-f]{7} 1\) function renderCard\(item\) \{$/)
    expect(rendered[2]).toMatch(/^[0-9a-f]{8} 3\) {3}el\.className = "card";$/)
  })

  it('ширина номера строки — по максимальному номеру В ЭТОМ ВЫВОДЕ, не по всему файлу (Д13)', () => {
    const state = makeState()
    const head = state.branches[state.head]
    const all = computeBlame(state, head, 'utils.js')

    // -L 1,3: максимум 3 — ширина 1, без отступа
    const slice13 = all.filter((l) => l.line >= 1 && l.line <= 3)
    expect(formatBlame(state, slice13, { suppressAuthor: true }).split('\n')[0]).toMatch(/^\^[0-9a-f]{7} 1\) export function formatDate\(d\) \{$/)

    // -L 9,11: максимум 11 — ширина 2, "9" получает отступ " 9"
    const slice911 = all.filter((l) => l.line >= 9 && l.line <= 11)
    const rendered = formatBlame(state, slice911, { suppressAuthor: true }).split('\n')
    expect(rendered[0]).toMatch(/^\^[0-9a-f]{7} {2}9\) {5}t = setTimeout/)
    expect(rendered[1]).toMatch(/^\^[0-9a-f]{7} 10\) {3}\};$/)
    expect(rendered[2]).toMatch(/^\^[0-9a-f]{7} 11\) \}$/)
  })

  it('пустая строка файла (README.md, строка 2) печатается с пробелом после ")"', () => {
    const state = makeState()
    const head = state.branches[state.head]
    const all = computeBlame(state, head, 'README.md')
    const line2 = all.filter((l) => l.line === 2)
    expect(line2[0].content).toBe('')
    const rendered = formatBlame(state, line2, { suppressAuthor: true })
    expect(rendered.endsWith(') ')).toBe(true)
    expect(rendered).toMatch(/^\^[0-9a-f]{7} 2\) $/)
  })
})
