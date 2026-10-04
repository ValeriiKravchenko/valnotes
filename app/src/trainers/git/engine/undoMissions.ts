// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): миссии «Что попробовать»
// (target.md, часть VI, «Миссии» — из spec.md, S4-31/S4-32: «Засчитываются
// по событию», формулировки и проверки — из source.html, ch4.missions).
//
// Три из четырёх миссий смотрят на факт успешного вызова команды нужной
// формы в `state.history` (тот же приём, что и у миссий раздела 3,
// inspectMissions.ts) — findComicSans (голый `git log` в любой форме, как в
// source.html: `/^git\s+log/`), resetSoft, resetHard. Миссия revertComicSans
// смотрит на СОСТОЯНИЕ (есть ли среди когда-либо созданных коммитов такой,
// чьё сообщение начинается с `Revert "…Comic Sans`) — раздел 4 коммиты не
// удаляет (даже после reset они остаются в state.commits, см. undoRepo.ts,
// getOrphanCommits), поэтому результат этой проверки так же необратимо
// становится true, как и у событийных проверок (target.md, п.2: «однажды
// true — навсегда true»).
// ============================================================
import type { UndoMissionId, UndoMissionView, UndoState } from './undoTypes'
import { UNDO_MISSION_IDS } from './undoTypes'
import { ru } from '../locales/ru'

function ranOk(state: UndoState, pattern: RegExp): boolean {
  return state.history.some((h) => h.kind === 'command' && h.ok && pattern.test(h.input))
}

const REVERT_COMIC_SANS_MESSAGE = /^Revert ".*Comic Sans/

const CHECKS: Record<UndoMissionId, (state: UndoState) => boolean> = {
  findComicSans: (state) => ranOk(state, /^\s*git\s+log\b/),
  revertComicSans: (state) => Object.values(state.commits).some((c) => REVERT_COMIC_SANS_MESSAGE.test(c.message)),
  resetSoft: (state) => ranOk(state, /^\s*git\s+reset\s+--soft\b/),
  resetHard: (state) => ranOk(state, /^\s*git\s+reset\s+--hard\b/),
}

/** Словарь «все миссии не выполнены» — для начального состояния раздела и для его сброса. */
export function initialUndoMissionsDone(): Record<UndoMissionId, boolean> {
  const result = {} as Record<UndoMissionId, boolean>
  UNDO_MISSION_IDS.forEach((id) => {
    result[id] = false
  })
  return result
}

/** Пересчитывает миссии по текущему состоянию и объединяет результат с уже сохранённым (логическое ИЛИ) — «однажды true — навсегда true» (target.md, п.2). */
export function updateUndoMissions(state: UndoState): UndoState {
  const nextDone = { ...state.missionsDone }
  let changed = false
  UNDO_MISSION_IDS.forEach((id) => {
    if (!nextDone[id] && CHECKS[id](state)) {
      nextDone[id] = true
      changed = true
    }
  })
  return changed ? { ...state, missionsDone: nextDone } : state
}

/** Список миссий для отображения — порядок соответствует target.md, часть VI, «Миссии». */
export function getUndoMissions(state: UndoState): UndoMissionView[] {
  return UNDO_MISSION_IDS.map((id) => ({
    id,
    text: ru.undo.missions[id].text,
    hint: ru.undo.missions[id].hint,
    done: state.missionsDone[id],
  }))
}
