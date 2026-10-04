// ============================================================
// git reset <ссылка> -- [<пути>]: если ссылка не разобралась, текст ошибки зависит от того, есть ли
// пути после "--". Без путей git проверяет ссылку как ревизию ("valid revision"), с путями — как
// дерево ("valid tree"). Ответы сверены на git 2.53.0 (временный каталог, 04.10.2026).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createUndoSection, runUndoCommand } from './undoSection'
import type { UndoState } from './undoTypes'
import { ru } from '../locales/ru'

function baseState(): UndoState {
  return createUndoSection({ commits: ru.undo.seed.commits })
}

function expectFailure(line: string, expected: string) {
  const state = baseState()
  const { state: next, result } = runUndoCommand(state, line)
  expect(result?.ok, line).toBe(false)
  expect(result?.output, line).toBe(expected)
  expect(next.head, line).toBe(state.head)
  expect(next.branches, line).toEqual(state.branches)
  expect(next.index, line).toEqual(state.index)
  expect(next.working, line).toEqual(state.working)
  expect(Object.keys(next.commits), line).toEqual(Object.keys(state.commits))
}

describe('git reset <несуществующая ссылка> --', () => {
  it('без путей после "--" — "valid revision"', () => {
    expectFailure('git reset nosuch --', "fatal: Failed to resolve 'nosuch' as a valid revision.")
    expectFailure('git reset --soft nosuch --', "fatal: Failed to resolve 'nosuch' as a valid revision.")
  })

  it('с путями после "--" — "valid tree"', () => {
    expectFailure('git reset nosuch -- style.css', "fatal: Failed to resolve 'nosuch' as a valid tree.")
    expectFailure('git reset --hard nosuch -- style.css', "fatal: Failed to resolve 'nosuch' as a valid tree.")
  })

  it('код возврата не задаётся, как у соседних ошибок раздела 4', () => {
    const { result } = runUndoCommand(baseState(), 'git reset nosuch --')
    expect(result?.exitCode).toBeUndefined()
  })
})
