// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): файловые операции над
// рабочим деревом — аналог fileOps.ts/branchFileOps.ts («✎ изменить»,
// «🗑 удалить из каталога», «создать файл»), но для InspectState. Эти
// функции меняют только state.working — индекс и коммиты не трогают
// напрямую (как и в разделах 1–2, `git add`/`git commit` вне области
// раздела 3 — inspectScope.ts — эти изменения нельзя застейджить командой,
// только увидеть их в `git diff`/`git status -s`, что и есть цель раздела).
//
// Без них у раздела нет способа создать неотслеживаемый файл через
// публичный набор движка (target.md, часть V, S3-28/S3-29/S3-32: `todo.txt`)
// или показать разницу между «изменено» и «изменено и подготовлено» иначе,
// чем зафиксировано в исходных данных раздела.
// ============================================================
import type { HistoryEntry, InspectState } from './inspectTypes'
import { ru } from '../locales/ru'
import { has } from './util'

function pushNote(state: InspectState, text: string): InspectState {
  const entry: HistoryEntry = { kind: 'note', text }
  return { ...state, history: [...state.history, entry] }
}

/** Кнопка «✎ изменить» — дописывает суффикс к текущему содержимому файла (тот же приём, что и в branchFileOps.ts раздела 2 — набор файлов задаёт интегратор, заготовленных версий для конкретных имён здесь нет). */
export function editFile(state: InspectState, file: string): InspectState {
  if (!has(state.working, file)) return state
  const content = state.working[file] + ru.fileOps.editedSuffix
  const withNote = pushNote(state, ru.fileOps.editedNote(file))
  return { ...withNote, working: { ...withNote.working, [file]: content } }
}

/** Кнопка «🗑 удалить из каталога» — убирает файл только из рабочего дерева. */
export function deleteFile(state: InspectState, file: string): InspectState {
  if (!has(state.working, file)) return state
  const nextWorking = { ...state.working }
  delete nextWorking[file]
  const withNote = pushNote(state, ru.fileOps.deletedNote(file))
  return { ...withNote, working: nextWorking }
}

/** «создать файл» — новый неотслеживаемый файл в рабочем дереве. */
export function createFile(state: InspectState, rawName: string): InspectState {
  const name = rawName.trim()
  if (!name) return state
  if (has(state.working, name)) {
    return pushNote(state, ru.fileOps.duplicateNote(name))
  }
  const withNote = pushNote(state, ru.fileOps.createdNote(name))
  return { ...withNote, working: { ...withNote.working, [name]: ru.fileOps.newFileContent } }
}
