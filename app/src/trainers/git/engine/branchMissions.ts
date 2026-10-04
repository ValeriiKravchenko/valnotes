// ============================================================
// Раздел 2 git-тренажёра, шаг A: миссии «Что попробовать» (target.md, часть IV,
// «Миссии шага A»). Устройство — прямой аналог missions.ts раздела 1: тот же
// приём «однажды true — навсегда true» (target.md, п.2 «Миссии — запоминаются
// везде») — updateBranchMissions только добавляет true, никогда не сбрасывает
// уже выполненную миссию.
//
// Отличие от раздела 1 — в том, ПО ЧЕМУ считается критерий. У раздела 1 всего
// одна ветка, поэтому миссии там смотрят на индекс/коммиты напрямую. Здесь
// (кроме миссий 1, 4 и 6, см. ниже) критерий — это структура ГРАФА коммитов
// (branchRepo.ts): это надёжнее произвольного текста команды и не зависит от
// того, каким именно путём игрок туда пришёл — `git checkout -b <имя>` или
// `git branch <имя>` + `git checkout <имя>` приводят к одному и тому же
// состоянию графа, и обе миссии засчитываются одинаково.
//
// По СОБЫТИЮ (а не по устойчивому состоянию репозитория) засчитываются миссии
// 1, 4 и 6 — у всех трёх суть именно в ДЕЙСТВИИ, а не в чём-то, что можно было
// бы однозначно прочитать из графа коммитов постфактум:
// - миссия 1 (увидеть список веток) и миссия 6 (получить отказ) проверяются
//   по `state.history` — факту, что нужная команда была выполнена;
// - миссия 4 (слияние перемоткой) проверяется по `state.lastMerge`
//   (branchTypes.ts) — полю, которое пишет сам handleMerge (branchCommands.ts)
//   по тому, какую ветку кода он реально прошёл, а не по тексту вывода и не
//   по графу: перемотка не создаёт нового коммита, поэтому в графе она
//   неотличима от «ветки только что созданы и ещё указывают на один и тот же
//   коммит» — см. комментарий у fastForwardMerge ниже.
// ============================================================
import type { BranchMissionId, BranchMissionView, BranchingState } from './branchTypes'
import { BRANCH_MISSION_IDS } from './branchTypes'
import { currentTip, isAncestor } from './branchRepo'
import { ru } from '../locales/ru'

const CHECKS: Record<BranchMissionId, (state: BranchingState) => boolean> = {
  /**
   * target.md, миссия 1: «посмотреть список веток и понять, где стоишь». Засчитывается по
   * УСПЕШНОМУ голому `git branch` в истории — только эта форма печатает список
   * (formatBranchList, branchCommands.ts): `git branch <имя>` создаёт ветку молча (без
   * вывода), `git branch -d/-D <имя>` печатает совсем другое. `--` перед пустым остатком
   * тоже даёт список (handleBranch: `args[0] === '--'` → тот же handleBranchPositional) —
   * учтён отдельно как необязательный хвост регулярки.
   */
  viewBranches: (state) => state.history.some((h) => h.kind === 'command' && h.ok && /^\s*git\s+branch\s*(--\s*)?$/.test(h.input)),

  /**
   * target.md, миссия 2: «создать ветку и переключиться на неё». Состояние: веток больше
   * одной, и HEAD стоит НЕ на первой из них. «Первая» берётся из `state.branchOrder`
   * (branchTypes.ts) — явного списка имён в порядке создания, а НЕ из `Object.keys(state.branches)`:
   * порядок ключей обычного JS-объекта для ЧИСЛОВЫХ имён («42») не совпадает с порядком
   * добавления (JS переставляет такие ключи в начало по возрастанию независимо от того, когда
   * ветка создана), а git такие имена веток принимает буквально — ветка с числовым именем должна
   * засчитывать эту миссию так же честно, как и любая другая (см. branchOrder, branchTypes.ts).
   * Once true остаётся true и в честной редкой ситуации, когда стартовая ветка позже удалена
   * (git branch -d/-D) — за счёт общего приёма «однажды true».
   */
  createAndSwitch: (state) => {
    return state.branchOrder.length > 1 && state.head !== state.branchOrder[0]
  },

  /**
   * target.md, миссия 3: «сделать коммит в НОВОЙ ветке, вернуться на ПРЕЖНЮЮ» (уточнение к
   * миссии 3, target.md, часть IV). Просто «текущая ветка отстаёт от
   * какой-то другой» недостаточно: коммит мог быть сделан и в СТАРОЙ ветке,
   * пока игрок сидел в новой, а затем игрок вернулся в новую — граф выглядит так же (текущая
   * ветка отстаёт от другой), но коммит был не «в новой, с возвратом на прежнюю», а наоборот.
   *
   * Различить эти два случая по графу можно по ПОРЯДКУ ПОЯВЛЕНИЯ веток: `state.branchOrder`
   * (branchTypes.ts) — явный список имён в порядке создания (НЕ `Object.keys(state.branches)`,
   * см. комментарий у createAndSwitch выше про числовые имена веток) — первая по счёту ветка
   * «старше» второй. Миссия засчитана, только если ТЕКУЩАЯ (та, на которую вернулись) ветка была
   * создана РАНЬШЕ той, что ушла вперёд, — то есть коммит сделан в более молодой ветке, а
   * вернулись в более старую. Сознательное упрощение: «прежняя» ветка отождествляется именно с
   * более ранней по порядку создания, а не с конкретной веткой, с которой игрок переключался
   * непосредственно перед этим, — этого достаточно, чтобы отличить коммит в старой ветке с
   * последующим переключением на только что созданную (не засчитывается) от честного прохождения
   * миссии, не читая порядок переключений из истории.
   */
  commitAndReturn: (state) => {
    const order = state.branchOrder
    const myIndex = order.indexOf(state.head)
    const myTip = currentTip(state)
    return Object.entries(state.branches).some(
      ([name, tip]) => name !== state.head && tip !== myTip && isAncestor(state, myTip, tip) && myIndex < order.indexOf(name),
    )
  },

  /**
   * target.md, миссия 4: «слить ветку перемоткой» (fast-forward) — по событию, не по графу.
   * Перемотка НЕ создаёт нового коммита (branchCommands.ts, handleMerge, ветка fast-forward),
   * поэтому в графе коммитов её ничем не отличить от состояния «ветку только что создали, и обе
   * ветки ещё указывают на один и тот же коммит» (миссия 2) — оба случая дают буквально
   * одинаковый граф. Поэтому критерий — не форма графа, а `state.lastMerge` (branchTypes.ts):
   * поле, которое пишет сам handleMerge по тому, какую ветку кода он реально прошёл.
   */
  fastForwardMerge: (state) => state.lastMerge === 'fast-forward',

  /**
   * target.md, миссия 5: «развести ветки: коммит в каждой — и слить их коммитом слияния».
   * Состояние: среди предков текущего HEAD (включая его самого) есть коммит с ДВУМЯ
   * родителями — такой коммит существует только тогда, когда его реально создали
   * (branchCommands.ts, handleMerge, ветка «ветки разошлись» — трёхстороннее слияние).
   */
  divergedMerge: (state) => {
    const myTip = currentTip(state)
    return Object.entries(state.commits).some(([id, c]) => c.parents.length === 2 && isAncestor(state, id, myTip))
  },

  /**
   * target.md, миссия 6: «удалить слитую ветку. Затем сделать ветку с коммитом и не сливать
   * её — попробовать удалить эту неслитую ветку и прочитать отказ». Это ДВА разных события,
   * оба обязательны — одного отказа «is not fully merged» без предшествующего успешного
   * удаления слитой ветки недостаточно, первая половина миссии тоже должна быть пройдена:
   * - событие 1: успешное `git branch -d`/`--delete` (БЕЗ "-D") — сам факт успеха уже доказывает,
   *   что ветка была слитой: handleBranchDelete (branchCommands.ts) отказывает НЕ форсированному
   *   удалению неслитой ветки, значит успешное "-d" неслитую ветку удалить не могло. "-D"
   *   (форсированное) в этот критерий сознательно не включено — оно удаляет и неслитую тоже, то
   *   есть само по себе не доказывает «слитая» (см. тест «удачное принудительное удаление»).
   * - событие 2: неудачная команда с "is not fully merged" в выводе (как и раньше) — отказ
   *   `git branch -d` ничего не меняет в графе (handleBranchDelete возвращает fail без изменения
   *   state), единственный след события — запись в истории. Буквальный английский текст git не
   *   переводится и не идёт в словарь (CLAUDE.md) — сравнение с этой подстрокой здесь честное
   *   сравнение с выводом git, а не перевод.
   * Порядок событий в истории не важен — проверяются оба факта независимо.
   */
  deleteBranches: (state) => {
    // "--del\w*" ловит не только полное "--delete", но и её однозначные сокращения ("--del",
    // "--dele" и т.п., см. classifySection2Option, branchScope.ts) — проверка идёт по СЫРОМУ
    // тексту команды из истории, а не по уже распознанной команде, поэтому сокращение нужно
    // учитывать явно, а не полагаться на то, что handleBranchDelete его уже разрешил.
    const deletedMergedBranch = state.history.some(
      (h) => h.kind === 'command' && h.ok && /^\s*git\s+branch\s+(-d|--del\w*)\s+\S/.test(h.input),
    )
    const refusedUnmergedBranch = state.history.some((h) => h.kind === 'command' && !h.ok && h.output.includes('is not fully merged'))
    return deletedMergedBranch && refusedUnmergedBranch
  },
}

/** Словарь «все миссии не выполнены» — для начального состояния раздела и для его сброса. */
export function initialBranchMissionsDone(): Record<BranchMissionId, boolean> {
  const result = {} as Record<BranchMissionId, boolean>
  BRANCH_MISSION_IDS.forEach((id) => {
    result[id] = false
  })
  return result
}

/**
 * Пересчитывает миссии по текущему состоянию и ОБЪЕДИНЯЕТ результат с уже сохранённым
 * (логическое ИЛИ) — та же схема, что и в разделе 1 (missions.ts, updateMissions). Вызывать
 * после любой команды, меняющей состояние (см. branchSection.ts, runBranchingCommand).
 */
export function updateBranchMissions(state: BranchingState): BranchingState {
  const nextDone = { ...state.missionsDone }
  let changed = false
  BRANCH_MISSION_IDS.forEach((id) => {
    if (!nextDone[id] && CHECKS[id](state)) {
      nextDone[id] = true
      changed = true
    }
  })
  return changed ? { ...state, missionsDone: nextDone } : state
}

/** Список миссий для отображения — порядок соответствует target.md, часть IV, «Миссии шага A». */
export function getBranchMissions(state: BranchingState): BranchMissionView[] {
  return BRANCH_MISSION_IDS.map((id) => ({
    id,
    text: ru.branching.missions[id].text,
    hint: ru.branching.missions[id].hint,
    done: state.missionsDone[id],
  }))
}
