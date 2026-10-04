// ============================================================
// Раздел 1 git-тренажёра: файловые операции («✎ изменить», «🗑 удалить
// из каталога», «создать файл») — см. spec 2.9. Работают всегда, вне
// зависимости от состояния репозитория (Ш0..Ш4), и меняют только рабочее
// дерево — индекс и коммиты они не трогают напрямую.
// ============================================================
import type { HistoryEntry, SectionState } from './types'
import { ru } from '../locales/ru'
import { has } from './util'

function pushNote(state: SectionState, text: string): SectionState {
  const entry: HistoryEntry = { kind: 'note', text }
  return { ...state, history: [...state.history, entry] }
}

/**
 * Заготовленные версии содержимого для последовательных нажатий «✎ изменить» — только
 * у файла index.html (см. spec 2.9, S1-120..S1-122). У остальных файлов версий нет —
 * они всегда переходят сразу к варианту «дописать суффикс» (S1-123).
 */
const FILE_VERSIONS: Record<string, string[]> = {
  'index.html': [ru.fileOps.indexHtmlSeed, ...ru.fileOps.indexHtmlVersions],
}

/**
 * Кнопка «✎ изменить». Первое нажатие переключает файл на заготовленную «версию 1», второе —
 * на «версию 2»; после исчерпания заготовленных версий (или если их нет вовсе — файл создан
 * пользователем) каждое следующее нажатие дописывает суффикс к ТЕКУЩЕМУ содержимому (S1-122, S1-123).
 * Если файла не существует — ничего не делает (защитный случай, не описан в спеке).
 */
export function editFile(state: SectionState, file: string): SectionState {
  if (!has(state.working, file)) return state
  const versions = FILE_VERSIONS[file]
  const currentIdx = state.fileVersionIndex[file] || 0
  const nextIdx = currentIdx + 1
  let content: string
  let newIdx = currentIdx
  if (versions && versions[nextIdx] !== undefined) {
    content = versions[nextIdx]
    newIdx = nextIdx
  } else {
    content = state.working[file] + ru.fileOps.editedSuffix
  }
  const withNote = pushNote(state, ru.fileOps.editedNote(file))
  return {
    ...withNote,
    working: { ...withNote.working, [file]: content },
    fileVersionIndex: { ...withNote.fileVersionIndex, [file]: newIdx },
  }
}

/**
 * Кнопка «🗑 удалить из каталога» — убирает файл только из рабочего дерева (не из git:
 * индекс и коммиты не трогаются, см. S1-124). Если файла нет — ничего не делает.
 */
export function deleteFile(state: SectionState, file: string): SectionState {
  if (!has(state.working, file)) return state
  const nextWorking = { ...state.working }
  delete nextWorking[file]
  const withNote = pushNote(state, ru.fileOps.deletedNote(file))
  return { ...withNote, working: nextWorking }
}

/**
 * «создать файл» (кнопка или Enter в поле имени — в разделе 1 они равнозначны, S1-126).
 * Пустое/пробельное имя — ничего не происходит, даже заметки (S1-128).
 * Уже занятое имя — файл не затирается, только заметка (S1-127).
 */
export function createFile(state: SectionState, rawName: string): SectionState {
  const name = rawName.trim()
  if (!name) return state
  if (has(state.working, name)) {
    return pushNote(state, ru.fileOps.duplicateNote(name))
  }
  const withNote = pushNote(state, ru.fileOps.createdNote(name))
  return { ...withNote, working: { ...withNote.working, [name]: ru.fileOps.newFileContent } }
}
