// ============================================================
// Раздел 2 git-тренажёра, шаг A: файловые операции над BranchingState
// (branchFileOps.ts) — аналог fileOps.test.ts раздела 1, адаптированный
// под то, что шаг A не владеет бизнес-контентом конкретных файлов (нет
// заготовленных версий, как у index.html в разделе 1) — см. шапку
// branchFileOps.ts. Без этих функций миссии 3, 5 и 6 недостижимы через
// публичный набор движка (см. шапку branchFileOps.ts).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createBranchingSection, createFile, deleteFile, editFile } from './branchSection'
import { ru } from '../locales/ru'

function baseState() {
  return createBranchingSection('Начальный коммит', { 'style.css': 'body { color: black; }' })
}

describe('раздел 2, шаг A — файловые операции (branchFileOps.ts)', () => {
  it('editFile дописывает суффикс к текущему содержимому (нет заготовленных версий, в отличие от раздела 1)', () => {
    let state = editFile(baseState(), 'style.css')
    expect(state.working['style.css']).toBe('body { color: black; }' + ru.fileOps.editedSuffix)
    state = editFile(state, 'style.css')
    expect(state.working['style.css']).toBe('body { color: black; }' + ru.fileOps.editedSuffix + ru.fileOps.editedSuffix)
  })

  it('editFile добавляет заметку в историю — тот же текст словаря, что и в разделе 1', () => {
    const state = editFile(baseState(), 'style.css')
    expect(state.history).toContainEqual({ kind: 'note', text: ru.fileOps.editedNote('style.css') })
  })

  it('editFile не трогает индекс и коммиты — только рабочее дерево', () => {
    const before = baseState()
    const after = editFile(before, 'style.css')
    expect(after.index).toEqual(before.index)
    expect(after.commits).toEqual(before.commits)
  })

  it('editFile несуществующего файла — защитный no-op, не бросает', () => {
    const before = baseState()
    expect(() => editFile(before, 'nope.txt')).not.toThrow()
    expect(editFile(before, 'nope.txt')).toBe(before)
  })

  it('deleteFile убирает файл только из рабочего дерева; в индексе/коммите остаётся', () => {
    const state = deleteFile(baseState(), 'style.css')
    expect('style.css' in state.working).toBe(false)
    expect(state.index['style.css']).toBe('body { color: black; }')
    expect(state.history).toContainEqual({ kind: 'note', text: ru.fileOps.deletedNote('style.css') })
  })

  it('deleteFile несуществующего файла — защитный no-op', () => {
    const before = baseState()
    expect(deleteFile(before, 'nope.txt')).toBe(before)
  })

  it('createFile с новым именем — untracked, заметка в истории', () => {
    const state = createFile(baseState(), 'app.js')
    expect(state.working['app.js']).toBe(ru.fileOps.newFileContent)
    expect(state.history).toContainEqual({ kind: 'note', text: ru.fileOps.createdNote('app.js') })
  })

  it('createFile с уже занятым именем не затирает файл, только заметка', () => {
    let state = editFile(baseState(), 'style.css')
    const before = state.working['style.css']
    state = createFile(state, 'style.css')
    expect(state.working['style.css']).toBe(before)
    expect(state.history[state.history.length - 1]).toEqual({ kind: 'note', text: ru.fileOps.duplicateNote('style.css') })
  })

  it('createFile с пустым/пробельным именем — ничего не происходит, даже заметки', () => {
    const before = baseState()
    expect(createFile(before, '')).toBe(before)
    expect(createFile(before, '   ')).toBe(before)
  })
})
