// ============================================================
// Раздел 1 git-тренажёра: миссии «Что попробовать» (spec 2.8).
//
// Упрощение относительно source.html/spec.md, требуемое target.md (п.2,
// «Миссии — запоминаются везде»): в исходном коде миссии пересчитывались
// заново при каждой перерисовке и могли «слетать», если состояние потом
// менялось (например, S1-112: git rm снимает миссию 3). target.md прямо
// требует обратного для всех разделов — поведение раздела 7 (миссия,
// однажды выполненная, остаётся выполненной). Здесь это и реализовано:
// `updateMissions` только добавляет true, никогда не сбрасывает флаг,
// кроме явного `resetSection` (кнопка «Начать раздел заново», S1-26; см. section.ts).
// ============================================================
import type { MissionId, MissionView, SectionState } from './types'
import { MISSION_IDS } from './types'
import { ru } from '../locales/ru'
import { SEED_FILE } from './repo'
import { has } from './util'

/** Текущее (сиюминутное) состояние критерия миссии — без учёта того, что было засчитано раньше. */
const CHECKS: Record<MissionId, (state: SectionState) => boolean> = {
  init: (state) => state.initialized,
  // spec S1-111: засчитывается только по УСПЕШНОЙ команде git status в истории.
  // target.md, B1: ведущие пробелы не мешают выполнению команды — не должны мешать
  // и зачёту миссии, поэтому \s* перед git (history.input хранит сырой ввод как есть).
  status: (state) => state.history.some((h) => h.kind === 'command' && h.ok && /^\s*git\s+status\b/.test(h.input)),
  addIndexHtml: (state) => has(state.index, SEED_FILE),
  firstCommit: (state) => state.commits.length >= 1,
  secondCommit: (state) => state.commits.length >= 2,
}

/** Создаёт словарь «все миссии не выполнены» — используется и для начального состояния, и для сброса раздела. */
export function initialMissionsDone(): Record<MissionId, boolean> {
  const result = {} as Record<MissionId, boolean>
  MISSION_IDS.forEach((id) => {
    result[id] = false
  })
  return result
}

/**
 * Пересчитывает миссии по текущему состоянию и ОБЪЕДИНЯЕТ результат с уже сохранённым
 * (логическое ИЛИ) — см. пояснение к упрощению в шапке файла. Вызывать после любого
 * действия, меняющего состояние (команда терминала, файловая операция).
 */
export function updateMissions(state: SectionState): SectionState {
  const nextDone = { ...state.missionsDone }
  let changed = false
  MISSION_IDS.forEach((id) => {
    if (!nextDone[id] && CHECKS[id](state)) {
      nextDone[id] = true
      changed = true
    }
  })
  // Ничего не изменилось (в т.ч. файловая операция была no-op'ом) — возвращаем тот же объект,
  // чтобы вызывающая сторона могла полагаться на ссылочное равенство при отсутствии изменений.
  return changed ? { ...state, missionsDone: nextDone } : state
}

/** Список миссий для отображения — порядок соответствует spec 2.8 (S1-110..S1-114). */
export function getMissions(state: SectionState): MissionView[] {
  return MISSION_IDS.map((id) => ({
    id,
    text: ru.missions[id].text,
    hint: ru.missions[id].hint,
    done: state.missionsDone[id],
  }))
}
