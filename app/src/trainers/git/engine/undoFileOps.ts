// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): файловые операции над рабочим
// деревом — аналог branchFileOps.ts/inspectFileOps.ts («✎ изменить»,
// «🗑 удалить из каталога», «создать файл»), но для UndoState. Эти функции
// меняют только state.working — индекс и коммиты не трогают напрямую
// (застейджить правку — дело `git add`, undoCommands.ts).
//
// Без них у раздела нет способа создать несохранённую правку через
// публичный набор движка (target.md, часть VI, «Что входит»: «Несохранённая
// правка мешает» — S4-14/S4-15/S4-18/S4-19 нуждаются именно в такой правке).
// ============================================================
import type { HistoryEntry, UndoState } from './undoTypes'
import { ru } from '../locales/ru'
import { has } from './util'

function pushNote(state: UndoState, text: string): UndoState {
  const entry: HistoryEntry = { kind: 'note', text }
  return { ...state, history: [...state.history, entry] }
}

/** Кнопка «✎ изменить» — дописывает суффикс к текущему содержимому файла (тот же приём, что и в branchFileOps.ts/inspectFileOps.ts). */
export function editFile(state: UndoState, file: string): UndoState {
  if (!has(state.working, file)) return state
  const content = state.working[file] + ru.fileOps.editedSuffix
  const withNote = pushNote(state, ru.fileOps.editedNote(file))
  return { ...withNote, working: { ...withNote.working, [file]: content } }
}

/** Кнопка «🗑 удалить из каталога» — убирает файл только из рабочего дерева. */
export function deleteFile(state: UndoState, file: string): UndoState {
  if (!has(state.working, file)) return state
  const nextWorking = { ...state.working }
  delete nextWorking[file]
  const withNote = pushNote(state, ru.fileOps.deletedNote(file))
  return { ...withNote, working: nextWorking }
}

/** «создать файл» — новый неотслеживаемый файл в рабочем дереве. */
export function createFile(state: UndoState, rawName: string): UndoState {
  const name = rawName.trim()
  if (!name) return state
  if (has(state.working, name)) {
    return pushNote(state, ru.fileOps.duplicateNote(name))
  }
  const withNote = pushNote(state, ru.fileOps.createdNote(name))
  return { ...withNote, working: { ...withNote.working, [name]: ru.fileOps.newFileContent } }
}
