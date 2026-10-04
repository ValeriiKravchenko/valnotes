// ============================================================
// Раздел 6 git-тренажёра, шаг A: миссии «Что попробовать» (target.md, часть
// VIII, «Миссии», п.1–2). В отличие от раздела 3 (inspectMissions.ts, где
// проверка — точная форма команды в истории) здесь проверка идёт через
// побочные каналы состояния (searchTypes.ts, SearchState) — потому что
// подходящих форм команды больше одной (например, миссию 1 засчитывают и
// `-n`, и `-i`, и `-l`, и `-c`, target.md: «Подходят -n, -i, -l, -c и
// кавычки»), и решает не форма ввода, а то, ЧТО было найдено/показано
// (searchCommands.ts сам взводит эти каналы по факту).
// ============================================================
import type { SearchMissionId, SearchMissionView, SearchState } from './searchTypes'
import { SEARCH_MISSION_IDS } from './searchTypes'
import { ru } from '../locales/ru'

const CHECKS: Record<SearchMissionId, (state: SearchState) => boolean> = {
  grepDebounce: (state) => state.grepFoundDebounceScenario,
  blameDatasetId: (state) => state.blameLine5WithAuthor || (state.blameLine5Suppressed && state.shownDatasetCommit),
}

/** Словарь «обе миссии не выполнены» — для начального состояния и для сброса раздела. */
export function initialSearchMissionsDone(): Record<SearchMissionId, boolean> {
  const result = {} as Record<SearchMissionId, boolean>
  SEARCH_MISSION_IDS.forEach((id) => {
    result[id] = false
  })
  return result
}

/** Пересчитывает миссии и объединяет с уже сохранённым (логическое ИЛИ) — «однажды true — навсегда true» (target.md, часть I, п.2). Побочные каналы (grepFoundDebounceScenario и т.п.) сами уже монотонны, но проверка выполняется так же явно, как и в остальных разделах — на случай, если вычисление CHECKS когда-нибудь перестанет быть монотонным по построению. */
export function updateSearchMissions(state: SearchState): SearchState {
  const nextDone = { ...state.missionsDone }
  let changed = false
  SEARCH_MISSION_IDS.forEach((id) => {
    if (!nextDone[id] && CHECKS[id](state)) {
      nextDone[id] = true
      changed = true
    }
  })
  return changed ? { ...state, missionsDone: nextDone } : state
}

/** Список миссий шага A для отображения — порядок соответствует target.md, часть VIII, «Миссии». */
export function getSearchMissions(state: SearchState): SearchMissionView[] {
  return SEARCH_MISSION_IDS.map((id) => ({
    id,
    text: ru.searching.missions[id].text,
    hint: ru.searching.missions[id].hint,
    done: state.missionsDone[id],
  }))
}
