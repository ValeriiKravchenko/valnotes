// ============================================================
// Раздел 2 git-тренажёра, шаг A: файловые операции над рабочим деревом —
// аналог fileOps.ts раздела 1 («✎ изменить», «🗑 удалить из каталога»,
// «создать файл»), но для BranchingState (граф веток, не одна ветка). Как
// и в разделе 1, эти функции меняют только state.working — индекс и
// коммиты они не трогают напрямую.
//
// Без них у шага A нет способа менять рабочее дерево через публичный
// набор движка вовсе — миссии 3, 5 и 6 требуют правки файла, а
// executeBranchingCommand (branchCommands.ts) сам файлы не редактирует,
// только читает.
//
// Заготовленные версии содержимого для конкретного файла (FILE_VERSIONS,
// fileOps.ts) — бизнес-контент раздела 1 (текст index.html), в разделе 2
// ему взяться неоткуда: набор файлов рабочего дерева здесь целиком задаёт
// интегратор через rootFiles (см. branchSection.ts, createBranchingSection,
// её комментарий про то, что этот модуль не придумывает бизнес-контент).
// Поэтому правка здесь всегда дописывает суффикс к текущему содержимому —
// тот же общий приём и та же строка словаря, что и «версии исчерпаны» в
// разделе 1 (ru.fileOps.editedSuffix).
// ============================================================
import type { BranchingState, HistoryEntry } from './branchTypes'
import { ru } from '../locales/ru'
import { has } from './util'

function pushNote(state: BranchingState, text: string): BranchingState {
  const entry: HistoryEntry = { kind: 'note', text }
  return { ...state, history: [...state.history, entry] }
}

/**
 * Кнопка «✎ изменить» — дописывает суффикс к текущему содержимому файла (см. шапку файла: в
 * отличие от раздела 1 здесь нет заготовленных версий для конкретных имён). Если файла нет в
 * рабочем дереве — ничего не делает (тот же защитный случай, что и в fileOps.ts раздела 1).
 */
export function editFile(state: BranchingState, file: string): BranchingState {
  if (!has(state.working, file)) return state
  const content = state.working[file] + ru.fileOps.editedSuffix
  const withNote = pushNote(state, ru.fileOps.editedNote(file))
  return { ...withNote, working: { ...withNote.working, [file]: content } }
}

/**
 * Кнопка «🗑 удалить из каталога» — убирает файл только из рабочего дерева (не из git: индекс и
 * коммиты не трогаются). Если файла нет — ничего не делает.
 */
export function deleteFile(state: BranchingState, file: string): BranchingState {
  if (!has(state.working, file)) return state
  const nextWorking = { ...state.working }
  delete nextWorking[file]
  const withNote = pushNote(state, ru.fileOps.deletedNote(file))
  return { ...withNote, working: nextWorking }
}

/**
 * «создать файл» (кнопка или Enter в поле имени — в разделе 1 они равнозначны, см. fileOps.ts).
 * Пустое/пробельное имя — ничего не происходит, даже заметки. Уже занятое имя — файл не
 * затирается, только заметка.
 */
export function createFile(state: BranchingState, rawName: string): BranchingState {
  const name = rawName.trim()
  if (!name) return state
  if (has(state.working, name)) {
    return pushNote(state, ru.fileOps.duplicateNote(name))
  }
  const withNote = pushNote(state, ru.fileOps.createdNote(name))
  return { ...withNote, working: { ...withNote.working, [name]: ru.fileOps.newFileContent } }
}
