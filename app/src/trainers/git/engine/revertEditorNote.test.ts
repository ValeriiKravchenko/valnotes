// ============================================================
// Раздел 4: git revert без --no-edit. Настоящий git в терминале открывает редактор с
// сообщением «Revert "…"» и строкой «This reverts commit <хэш>.»; с --no-edit редактор не
// открывается, сообщение то же (сверено на git 2.53.0 в псевдотерминале). В тренажёре редактора
// нет, и пояснение говорит об этом прямо (target.md, часть VI, опасное место 5).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createUndoSection, runUndoCommand } from './undoSection'
import type { UndoState } from './undoTypes'
import { ru } from '../locales/ru'

function base(): UndoState {
  return createUndoSection({ commits: ru.undo.seed.commits })
}

describe('git revert: пояснение про редактор', () => {
  it('без --no-edit: прежнее пояснение про «нейтрализован» и пояснение, что редактора нет', () => {
    const { result } = runUndoCommand(base(), 'git revert HEAD')
    expect(result?.ok).toBe(true)
    const message = 'Revert "Добавить структуру страницы"'
    expect(result?.output.endsWith(message)).toBe(true)
    expect(result?.explanation).toContain(ru.undo.explain.revertSuccess)
    expect(result?.explanation).toContain(ru.undo.explain.revertEditorNote(message))
    expect(result?.explanation).toContain('редактор')
    expect(result?.explanation).toContain('This reverts commit')
  })

  it('с --no-edit (в любой позиции) — только прежнее пояснение, редактор не упоминается', () => {
    for (const cmd of ['git revert --no-edit HEAD', 'git revert HEAD --no-edit']) {
      const { result } = runUndoCommand(base(), cmd)
      expect(result?.ok).toBe(true)
      expect(result?.explanation).toBe(ru.undo.explain.revertSuccess)
    }
  })

  it('пояснение не подменяет поведение: коммит создан с тем же сообщением и при --no-edit, и без него', () => {
    const a = runUndoCommand(base(), 'git revert HEAD').result
    const b = runUndoCommand(base(), 'git revert --no-edit HEAD').result
    expect(a?.output.replace(/^\[\S+ \S+\]/, '')).toBe(b?.output.replace(/^\[\S+ \S+\]/, ''))
  })

  it('отказы revert пояснения про редактор не получают', () => {
    expect(runUndoCommand(base(), 'git revert').result?.explanation).toBe(ru.undo.explain.revertNeedsCommit)
    expect(runUndoCommand(base(), 'git revert nosuch').result?.explanation).toBeNull()
  })
})
