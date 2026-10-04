// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): миссии «Что попробовать»
// (target.md, часть V, «Миссии» — из spec.md, S3-38: «Засчитываются по
// событию (суть миссии — в действии)»).
//
// В отличие от разделов 1–2, где часть миссий смотрит на устойчивое
// состояние репозитория (индекс/граф коммитов), ВСЕ четыре миссии раздела 3
// проверяются по факту успешного вызова команды в заданной форме — раздел 3
// не создаёт новых коммитов и не меняет граф (add/commit/branch/merge вне
// области, inspectScope.ts), поэтому единственный наблюдаемый след
// прохождения миссии — запись в `state.history` (тот же приём, что и у
// миссий 1/4/6 раздела 2 — см. branchMissions.ts).
//
// Форма команды в проверке — та же, что и текст миссии (target.md,
// «Миссии»): голый `git log`, `git log --oneline`, голый `git diff`,
// `git diff --staged`/`--cached`. Другие формы этих же команд (`git log -1`,
// `git diff HEAD` и т.п.) миссию не закрывают — они честно проверяют другие
// навыки (S3-01…S3-30), а не эти четыре конкретные.
// ============================================================
import type { InspectMissionId, InspectMissionView, InspectState } from './inspectTypes'
import { INSPECT_MISSION_IDS } from './inspectTypes'
import { ru } from '../locales/ru'

function ranExactly(state: InspectState, pattern: RegExp): boolean {
  return state.history.some((h) => h.kind === 'command' && h.ok && pattern.test(h.input))
}

const CHECKS: Record<InspectMissionId, (state: InspectState) => boolean> = {
  log: (state) => ranExactly(state, /^\s*git\s+log\s*$/),
  logOneline: (state) => ranExactly(state, /^\s*git\s+log\s+--oneline\s*$/),
  diff: (state) => ranExactly(state, /^\s*git\s+diff\s*$/),
  diffStaged: (state) => ranExactly(state, /^\s*git\s+diff\s+(--staged|--cached)\s*$/),
}

/** Словарь «все миссии не выполнены» — для начального состояния раздела и для его сброса. */
export function initialInspectMissionsDone(): Record<InspectMissionId, boolean> {
  const result = {} as Record<InspectMissionId, boolean>
  INSPECT_MISSION_IDS.forEach((id) => {
    result[id] = false
  })
  return result
}

/** Пересчитывает миссии по текущему состоянию и объединяет результат с уже сохранённым (логическое ИЛИ) — «однажды true — навсегда true» (target.md, п.2). */
export function updateInspectMissions(state: InspectState): InspectState {
  const nextDone = { ...state.missionsDone }
  let changed = false
  INSPECT_MISSION_IDS.forEach((id) => {
    if (!nextDone[id] && CHECKS[id](state)) {
      nextDone[id] = true
      changed = true
    }
  })
  return changed ? { ...state, missionsDone: nextDone } : state
}

/** Список миссий для отображения — порядок соответствует target.md, часть V, «Миссии». */
export function getInspectMissions(state: InspectState): InspectMissionView[] {
  return INSPECT_MISSION_IDS.map((id) => ({
    id,
    text: ru.inspecting.missions[id].text,
    hint: ru.inspecting.missions[id].hint,
    done: state.missionsDone[id],
  }))
}
