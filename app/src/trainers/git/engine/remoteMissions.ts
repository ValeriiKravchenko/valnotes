// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): миссии (target.md, часть VII,
// «Миссии» — пять миссий из source.html, формулировка 5 переписана под
// опасные места 2 и 5). Тот же приём «однажды true — навсегда true», что и
// в missions.ts/branchMissions.ts/undoMissions.ts: updateRemoteMissions
// только добавляет true, никогда не сбрасывает уже выполненную миссию.
//
// Миссии 2, 3 и 4 засчитываются ПО СОБЫТИЮ (успешная команда конкретной
// формы), а не по устойчивому состоянию репозитория — target.md прямо
// объясняет, почему: проверка по состоянию (как в source.html) даёт дыры
// (замечания к миссиям 2 и 4, часть VII). Миссии 4 и 5 читают побочные
// каналы состояния (`commitAfterColleagueEvent`/`rejectPullPushProgress`,
// remoteTypes.ts) — момент события решает сам обработчик команды
// (remoteCommands.ts), не эта миссия задним числом.
// ============================================================
import type { RemoteMissionId, RemoteMissionView, RemoteState } from './remoteTypes'
import { REMOTE_MISSION_IDS } from './remoteTypes'
import { ru } from '../locales/ru'

function successfulCommand(state: RemoteState, pattern: RegExp): boolean {
  return state.history.some((h) => h.kind === 'command' && h.ok && pattern.test(h.input))
}

const CHECKS: Record<RemoteMissionId, (state: RemoteState) => boolean> = {
  /** target.md, часть VII, миссия 1: «Склонируй серверный репозиторий к себе». `local !== null` только после УСПЕШНОГО clone (remoteCommands.ts) — эквивалент проверки по событию. */
  cloneRepo: (state) => state.local !== null,

  /**
   * target.md, часть VII, миссия 2: «Отредактируй README.md, затем добавь и закоммить изменение
   * локально». По событию (замечание к миссии 2: проверка по состоянию засчитывала бы миссию
   * сразу после clone, если коллега нажимался до него, без единого своего коммита) — любой
   * успешный `git commit` в истории ТЕРМИНАЛА LOCAL (коммиты коллеги сюда не попадают —
   * «Коллега пушит» пишет в `serverNotes`, не в `history`, см. remoteTypes.ts).
   */
  commitLocally: (state) => successfulCommand(state, /^\s*git\s+commit\b/),

  /** target.md, часть VII, миссия 3: успешный `git push`, который что-то ОТПРАВИЛ (не «Everything up-to-date») — вывод такой отправки всегда начинается строкой "To …" (remoteCommands.ts, doPush). */
  pushCommit: (state) =>
    state.history.some((h) => h.kind === 'command' && h.ok && /^\s*git\s+push\b/.test(h.input) && h.output.startsWith('To ')),

  /** target.md, часть VII, миссия 4: успешный commit ПОСЛЕ первого нажатия «Коллега пушит» — читает побочный канал (remoteTypes.ts, remoteCommands.ts, handleCommit). */
  commitAfterColleague: (state) => state.commitAfterColleagueEvent,

  /** target.md, часть VII, миссия 5: цепочка «отклонённый push → успешный pull → push, который что-то отправил» — читает побочный канал-автомат (remoteTypes.ts). */
  rejectPullPush: (state) => state.rejectPullPushProgress === 'done',
}

/** Словарь «все миссии не выполнены» — для начального состояния раздела. */
export function initialRemoteMissionsDone(): Record<RemoteMissionId, boolean> {
  const result = {} as Record<RemoteMissionId, boolean>
  REMOTE_MISSION_IDS.forEach((id) => {
    result[id] = false
  })
  return result
}

/** Пересчитывает миссии по текущему состоянию и ОБЪЕДИНЯЕТ результат с уже сохранённым (логическое ИЛИ) — та же схема, что и в разделах 1–4. Вызывать после любой команды/действия, меняющего состояние (см. remoteSection.ts). */
export function updateRemoteMissions(state: RemoteState): RemoteState {
  const nextDone = { ...state.missionsDone }
  let changed = false
  REMOTE_MISSION_IDS.forEach((id) => {
    if (!nextDone[id] && CHECKS[id](state)) {
      nextDone[id] = true
      changed = true
    }
  })
  return changed ? { ...state, missionsDone: nextDone } : state
}

/** Список миссий для отображения — порядок соответствует target.md, часть VII, «Миссии». */
export function getRemoteMissions(state: RemoteState): RemoteMissionView[] {
  return REMOTE_MISSION_IDS.map((id) => ({
    id,
    text: ru.remote.missions[id].text,
    hint: ru.remote.missions[id].hint,
    done: state.missionsDone[id],
  }))
}
