// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): прямые проверки чистых
// функций undoRepo.ts, которые не всегда удобно продемонстрировать через
// полный терминал (undoCommands.test.ts) — разбор ссылок, недостижимые
// коммиты, трёхстороннее слияние revert.
// ============================================================
import { describe, expect, it } from 'vitest'
import { createUndoSection, getAllCommits, runUndoCommand } from './undoSection'
import type { UndoState } from './undoTypes'
import { resolveRef, looksLikeUnimplementedRevisionExpression, getOrphanCommits, computeRevert } from './undoRepo'
import { ru } from '../locales/ru'

function run(state: UndoState, input: string) {
  const { state: next, result } = runUndoCommand(state, input)
  if (result === null) throw new Error('ожидалась команда, а не пустая строка')
  return { state: next, result }
}

function baseState(): UndoState {
  return createUndoSection({ commits: ru.undo.seed.commits })
}

function commitByMessage(state: UndoState, message: string) {
  const found = getAllCommits(state).find((c) => c.message === message)
  if (!found) throw new Error(`коммит «${message}» не найден`)
  return found
}

describe('resolveRef (target.md, часть VI — HEAD/HEAD~N/имя ветки/хэш-префикс)', () => {
  it('HEAD — вершина текущей ветки', () => {
    const s = baseState()
    const structure = commitByMessage(s, 'Добавить структуру страницы')
    expect(resolveRef(s, 'HEAD')).toBe(structure.id)
  })

  it('HEAD~1/HEAD~2 — предки по цепочке, HEAD~3 (за пределы корня) — null', () => {
    const s = baseState()
    const comic = commitByMessage(s, 'сменить шрифт на Comic Sans')
    const styles = commitByMessage(s, 'Добавить стили')
    expect(resolveRef(s, 'HEAD~1')).toBe(comic.id)
    expect(resolveRef(s, 'HEAD~2')).toBe(styles.id)
    expect(resolveRef(s, 'HEAD~3')).toBeNull()
  })

  it('имя ветки — резолвится в её вершину', () => {
    const s = baseState()
    expect(resolveRef(s, 'master')).toBe(commitByMessage(s, 'Добавить структуру страницы').id)
  })

  it('хэш целиком и однозначный префикс (от 4 символов) резолвятся; неизвестная строка — null', () => {
    const s = baseState()
    const structure = commitByMessage(s, 'Добавить структуру страницы')
    expect(resolveRef(s, structure.id)).toBe(structure.id)
    expect(resolveRef(s, structure.id.slice(0, 4))).toBe(structure.id)
    expect(resolveRef(s, 'zzzzzzz')).toBeNull()
    expect(resolveRef(s, 'nosuchbranch')).toBeNull()
  })

  it('looksLikeUnimplementedRevisionExpression — HEAD^/@/HEAD@{0} опознаются как настоящие, но не разбираемые формы', () => {
    expect(looksLikeUnimplementedRevisionExpression('HEAD^')).toBe(true)
    expect(looksLikeUnimplementedRevisionExpression('@')).toBe(true)
    expect(looksLikeUnimplementedRevisionExpression('HEAD@{0}')).toBe(true)
    expect(looksLikeUnimplementedRevisionExpression('HEAD~1')).toBe(false)
    expect(looksLikeUnimplementedRevisionExpression('master')).toBe(false)
  })
})

describe('git revert HEAD^ — правило области (выражение ревизии, не разбирается, не выдуманная ошибка)', () => {
  it('честный отказ, а не «bad revision»', () => {
    const s = baseState()
    const { result } = run(s, 'git revert HEAD^')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toContain('bad revision')
  })
})

describe('getOrphanCommits — коммит не удаляется, только становится недостижим', () => {
  it('после нескольких reset подряд без rescue — накапливаются РАЗНЫЕ осиротевшие коммиты', () => {
    let s = baseState()
    const comic = commitByMessage(s, 'сменить шрифт на Comic Sans')
    const structure = commitByMessage(s, 'Добавить структуру страницы')
    s = run(s, 'git reset --hard HEAD~1').state // отбрасывает structure
    s = run(s, 'git reset --hard HEAD~1').state // отбрасывает comic (текущий HEAD теперь на "Добавить стили")
    const orphans = getOrphanCommits(s).map((c) => c.id).sort()
    expect(orphans).toEqual([comic.id, structure.id].sort())
  })
})

describe('computeRevert — трёхстороннее слияние (переиспользует mergeTrees, branchRepo.ts)', () => {
  it('revert корневого коммита — родителя нет, «до» считается пустым деревом (style.css менялся позже — настоящий конфликт modify/delete, сверено с той же классификацией, что и merge раздела 2)', () => {
    const s = baseState()
    const styles = commitByMessage(s, 'Добавить стили')
    const { merged } = computeRevert(s, styles.id)
    expect(merged.conflicts).toHaveLength(1)
    expect(merged.conflicts[0]).toEqual({ file: 'style.css', kind: 'modify-delete' })
  })

  it('непересекающиеся правки после отменяемого коммита — сливаются автоматически, без конфликта (сверено напрямую, git 2.53.0)', () => {
    // index.html меняется ПОСЛЕ Comic Sans (третий коммит seed) — другой файл, не пересекается со style.css.
    const s = baseState()
    const comic = commitByMessage(s, 'сменить шрифт на Comic Sans')
    const { merged } = computeRevert(s, comic.id)
    expect(merged.conflicts).toHaveLength(0)
    expect(merged.tree['style.css']).toBe('body { color: black; }')
    expect(merged.tree['index.html']).toBe('<h1>Мой сайт</h1>')
  })
})
