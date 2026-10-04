// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): файловые операции над рабочим
// деревом ЛОКАЛЬНОЙ копии — аналог branchFileOps.ts/undoFileOps.ts, но для
// RemoteState.local. До `git clone` рабочего дерева нет (`local === null`) —
// все три операции в этом случае ничего не делают (тот же защитный приём,
// что и «файла нет» в branchFileOps.ts): кнопки редактора неактивны до
// клона на уровне интерфейса, но движок не должен падать, если это всё же
// произошло.
// ============================================================
import type { HistoryEntry, RemoteState } from './remoteTypes'
import { ru } from '../locales/ru'
import { has } from './util'

function pushNote(state: RemoteState, text: string): RemoteState {
  const entry: HistoryEntry = { kind: 'note', text }
  return { ...state, history: [...state.history, entry] }
}

/** Кнопка «✎ изменить» (target.md, часть VII, «Исходное состояние»: перебирает версии `fileVersions` — бизнес-контент, не дело этого модуля; здесь, как и в branchFileOps.ts, правка дописывает суффикс). */
export function editFile(state: RemoteState, file: string): RemoteState {
  if (!state.local || !has(state.local.working, file)) return state
  const content = state.local.working[file] + ru.fileOps.editedSuffix
  const withNote = pushNote(state, ru.fileOps.editedNote(file))
  return { ...withNote, local: { ...withNote.local!, working: { ...withNote.local!.working, [file]: content } } }
}

/** Кнопка «🗑 удалить из каталога» — убирает файл только из рабочего дерева локальной копии. */
export function deleteFile(state: RemoteState, file: string): RemoteState {
  if (!state.local || !has(state.local.working, file)) return state
  const nextWorking = { ...state.local.working }
  delete nextWorking[file]
  const withNote = pushNote(state, ru.fileOps.deletedNote(file))
  return { ...withNote, local: { ...withNote.local!, working: nextWorking } }
}

/** «создать файл» — тот же принцип, что и в branchFileOps.ts/undoFileOps.ts. */
export function createFile(state: RemoteState, rawName: string): RemoteState {
  const name = rawName.trim()
  if (!state.local || !name) return state
  if (has(state.local.working, name)) return pushNote(state, ru.fileOps.duplicateNote(name))
  const withNote = pushNote(state, ru.fileOps.createdNote(name))
  return { ...withNote, local: { ...withNote.local!, working: { ...withNote.local!.working, [name]: ru.fileOps.newFileContent } } }
}
