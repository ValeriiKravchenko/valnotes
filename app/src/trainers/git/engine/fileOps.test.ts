import { describe, expect, it } from 'vitest'
import { createFile, createSection, deleteFile, editFile, runCommand } from './index'

describe('spec 2.9 — файловые операции', () => {
  it('spec S1-120/S1-121/S1-122: последовательные ✎ на index.html — заготовленные версии, потом суффикс "+ правка"', () => {
    let state = createSection()
    state = editFile(state, 'index.html')
    expect(state.working['index.html']).toBe('<h1>Мой сайт</h1><p>Обо мне</p>')
    state = editFile(state, 'index.html')
    expect(state.working['index.html']).toBe('<h1>Мой сайт</h1><p>Обо мне</p><footer>© 2026</footer>')
    state = editFile(state, 'index.html')
    expect(state.working['index.html']).toBe('<h1>Мой сайт</h1><p>Обо мне</p><footer>© 2026</footer> + правка')
    state = editFile(state, 'index.html')
    expect(state.working['index.html']).toBe('<h1>Мой сайт</h1><p>Обо мне</p><footer>© 2026</footer> + правка + правка')
  })

  it('spec S1-120: правка добавляет заметку в историю (без "✎" в тексте, префикс "#" — дело интерфейса)', () => {
    const state = editFile(createSection(), 'index.html')
    expect(state.history).toContainEqual({ kind: 'note', text: 'отредактировал(а) файл «index.html» в редакторе' })
  })

  it('spec S1-123: у файла без заготовленных версий (создан пользователем) сразу дописывается "+ правка"', () => {
    let state = createFile(createSection(), 'todo.txt')
    expect(state.working['todo.txt']).toBe('новый файл')
    state = editFile(state, 'todo.txt')
    expect(state.working['todo.txt']).toBe('новый файл + правка')
    state = editFile(state, 'todo.txt')
    expect(state.working['todo.txt']).toBe('новый файл + правка + правка')
  })

  it('spec S1-124: удаление файла убирает его только из рабочего дерева; в индексе/репозитории остаётся', () => {
    let state = createSection()
    state = runCommand(state, 'git init').state
    state = runCommand(state, 'git add index.html').state
    state = runCommand(state, 'git commit -m "root"').state
    state = deleteFile(state, 'index.html')
    expect('index.html' in state.working).toBe(false)
    expect(state.index['index.html']).toBe('<h1>Мой сайт</h1>')
    expect(state.commits[0]?.tree['index.html']).toBe('<h1>Мой сайт</h1>')
    expect(state.history).toContainEqual({
      kind: 'note',
      text: 'удалил(а) файл «index.html» из рабочего дерева (в git — ещё нет, это просто файловая система)',
    })
  })

  it('spec S1-125: единственный файл удалён — рабочее дерево пусто', () => {
    const state = deleteFile(createSection(), 'index.html')
    expect(Object.keys(state.working)).toHaveLength(0)
  })

  it('spec S1-126: создание файла с новым именем — untracked, заметка в истории', () => {
    const state = createFile(createSection(), 'todo.txt')
    expect(state.working['todo.txt']).toBe('новый файл')
    expect(state.history).toContainEqual({ kind: 'note', text: 'создал(а) файл «todo.txt» в редакторе' })
    const status = runCommand(runCommand(state, 'git init').state, 'git status').result
    expect(status?.output).toContain('todo.txt')
  })

  it('spec S1-127: создание файла с уже занятым именем не затирает его, только заметка', () => {
    let state = editFile(createSection(), 'index.html') // содержимое стало не исходным
    const before = state.working['index.html']
    state = createFile(state, 'index.html')
    expect(state.working['index.html']).toBe(before) // не затёрто "новый файл"
    expect(state.history[state.history.length - 1]).toEqual({
      kind: 'note',
      text: 'файл «index.html» уже есть в рабочем дереве — выбери другое имя (или измени его кнопкой «✎ изменить»)',
    })
  })

  it('spec S1-128: создание файла с пустым/пробельным именем — ничего не происходит, даже заметки', () => {
    const before = createSection()
    const afterEmpty = createFile(before, '')
    const afterBlank = createFile(before, '   ')
    expect(afterEmpty).toBe(before)
    expect(afterBlank).toBe(before)
  })

  it('редактирование/удаление несуществующего файла — защитный no-op, не бросает', () => {
    const before = createSection()
    expect(() => editFile(before, 'nope.txt')).not.toThrow()
    expect(() => deleteFile(before, 'nope.txt')).not.toThrow()
    expect(editFile(before, 'nope.txt')).toBe(before)
    expect(deleteFile(before, 'nope.txt')).toBe(before)
  })
})
