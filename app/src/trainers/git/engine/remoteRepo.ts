// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): данные и чистые операции —
// граф коммитов ЛОКАЛЬНОЙ копии и СЕРВЕРА (у сервера нет индекса и рабочего
// каталога, target.md, часть VII, «Движок»), синхронизация (clone/fetch/push/
// pull), кнопка «Коллега пушит», статус относительно origin/*. Разбора
// командной строки здесь нет (см. remoteCommands.ts) — только модель.
//
// checkSafety/applyTreeChange ПОРТИРОВАНЫ (переписаны заново, не импортированы)
// из branchRepo.ts раздела 2 — тот же приём и то же обоснование, что и в
// undoRepo.ts (раздел 4): типы состояния разные (BranchingState требует
// branchOrder/lastMerge/missionsDone раздела 2 — RemoteState.local их не
// имеет), подгонять LocalRepo под чужой интерфейс фиктивными полями было бы
// нечестным трюком. Здесь адаптация ещё и по сигнатуре: вместо `state:
// BranchingState` эти функции принимают HEAD/индекс/рабочее дерево как
// отдельные деревья — это позволяет reuse'ить их и для checkout (одно
// дерево — целевая ветка), и для интеграции при pull (другое дерево —
// результат fast-forward/слияния), без промежуточного State-подобного объекта.
// mergeTrees/mergeFileContent/sameTree — чистые функции над FileTree,
// импортируются НАПРЯМУЮ из branchRepo.ts без копии (раздел 2 не редактируется
// ни строкой).
//
// Строки-литералы настоящего git ("Everything up-to-date", "Fast-forward",
// "fatal: …", hint-блоки) — буквальный вывод, сверенный напрямую запуском
// git 2.53.0 (LC_ALL=C, без глобального конфига) во временном каталоге
// 26.09.2026 (см. docs/git-trainer/reports/section5-git-runs.txt) — не по
// памяти. Диффстат после fast-forward/слияния при pull НЕ печатается — то же
// сознательное упрощение, что и в branchCommands.ts (target.md, часть VII,
// опасное место 9: «Раздел 2 диффстат не печатает… Раздел 5 его наследует»).
// ============================================================
import type { LocalRepo, RemoteCommit, ServerState, FileTree } from './remoteTypes'
import { mergeTrees, mergeFileContent, sameTree } from './branchRepo'
import type { TreeMergeResult } from './branchRepo'
import { commitHashCore, has } from './util'

export { mergeTrees, mergeFileContent, sameTree }
export type { TreeMergeResult }

type CommitMap = Record<string, RemoteCommit>

export function remoteCommitHash(message: string, tree: FileTree, parents: string[], clock: number): string {
  return commitHashCore(message, tree, parents, clock)
}

/** Короткий вид id — id раздела 5 УЖЕ 7 hex-символов (util.ts, hashString), `slice` здесь — то же защитное соглашение, что и в branchCommands.ts/undoCommands.ts (id не станет короче, но явно оговаривает ожидание). */
export function short(id: string): string {
  return id.slice(0, 7)
}

export function commitTree(commits: CommitMap, id: string): FileTree {
  return commits[id]?.tree ?? {}
}

// ---------- граф коммитов: предки, общий предок ----------

function ancestorSet(commits: CommitMap, id: string): Set<string> {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    const c = commits[cur]
    if (c) c.parents.forEach((p) => stack.push(p))
  }
  return seen
}

/** Является ли коммит `a` предком (или тем же коммитом, что и) `b` — тот же алгоритм, что и isAncestor раздела 2 (branchRepo.ts), портирован под явную карту коммитов вместо BranchingState (см. шапку файла). */
export function isAncestor(commits: CommitMap, a: string, b: string): boolean {
  return ancestorSet(commits, b).has(a)
}

export type MergeBaseResult = { ambiguous: false; base: string } | { ambiguous: true; bases: string[] }

/**
 * Общий предок (merge-base) — тот же алгоритм, что и mergeBase раздела 2 (branchRepo.ts,
 * см. её подробный комментарий про «лучший общий предок»/крест-накрест истории). История
 * раздела 5 устроена проще (не больше одного коммита слияния подряд — `git pull --no-rebase`
 * выполняется явным действием игрока, крест-накрест сценариев в «Что входит» нет), поэтому
 * неоднозначность (`ambiguous: true`) практически не должна возникать; там, где она всё же
 * появится (не покрыто прогоном), вызывающий код (aheadBehindCounts) берёт первую базу списка —
 * тот же принцип принятия риска, что и в разделе 3 (inspectRepo.ts, неоднозначный короткий хэш).
 */
export function mergeBase(commits: CommitMap, a: string, b: string): MergeBaseResult {
  const ancestorsOfA = ancestorSet(commits, a)
  const ancestorsOfB = ancestorSet(commits, b)
  const common: string[] = []
  ancestorsOfA.forEach((id) => {
    if (ancestorsOfB.has(id)) common.push(id)
  })
  if (!common.length) throw new Error('invariant: no common ancestor (история раздела 5 должна иметь общий корень — сервер и копия всегда происходят от одного clone)')
  const best = common.filter((c) => !common.some((d) => d !== c && isAncestor(commits, c, d)))
  if (best.length > 1) return { ambiguous: true, bases: best }
  return { ambiguous: false, base: best[0] }
}

/** Сколько коммитов есть только у `a` (ahead) и только у `b` (behind) — считается через merge-base, нужно для строк "ahead of.../behind.../have diverged" (target.md, часть VII, опасное место 1 и таблица "Что входит", «Статус относительно сервера»). */
export function aheadBehindCounts(commits: CommitMap, a: string, b: string): { ahead: number; behind: number } {
  if (a === b) return { ahead: 0, behind: 0 }
  const baseResult = mergeBase(commits, a, b)
  const baseId = baseResult.ambiguous ? baseResult.bases[0] : baseResult.base
  const baseSize = ancestorSet(commits, baseId).size
  return { ahead: ancestorSet(commits, a).size - baseSize, behind: ancestorSet(commits, b).size - baseSize }
}

/** Копирует в `target` все коммиты, достижимые из `tipId` в `source`, которых там ещё нет (обход по родителям) — модель передачи объектов git при clone/fetch/push (у каждого репозитория своя объектная база, target.md, часть VII, шапка файла remoteTypes.ts). */
export function collectReachable(source: CommitMap, target: CommitMap, tipId: string): CommitMap {
  if (has(target, tipId)) return target
  const next = { ...target }
  const stack = [tipId]
  while (stack.length) {
    const id = stack.pop() as string
    if (has(next, id)) continue
    const c = source[id]
    if (!c) continue
    next[id] = c
    c.parents.forEach((p) => {
      if (!has(next, p)) stack.push(p)
    })
  }
  return next
}

// ---------- «грязное» рабочее дерево: checkSafety/applyTreeChange (портировано из branchRepo.ts) ----------

function localChangeFiles(head: FileTree, index: FileTree, working: FileTree): Set<string> {
  const files = new Set<string>([...Object.keys(head), ...Object.keys(index), ...Object.keys(working)])
  const dirty = new Set<string>()
  files.forEach((f) => {
    const h = has(head, f) ? head[f] : undefined
    const idx = has(index, f) ? index[f] : undefined
    const w = has(working, f) ? working[f] : undefined
    if (idx !== h || w !== idx) dirty.add(f)
  })
  return dirty
}

export interface SafetyBlock {
  modified: string[]
  untracked: string[]
}

/** Портировано из branchRepo.ts, checkSafety (см. её подробный комментарий про две разные проверки git — двусторонний тест «застейджено»/«не застейджено»). Сигнатура — явные деревья вместо BranchingState (см. шапку файла). */
export function checkSafety(head: FileTree, index: FileTree, working: FileTree, resultTree: FileTree): SafetyBlock {
  const dirty = localChangeFiles(head, index, working)
  const modified: string[] = []
  const untracked: string[] = []
  dirty.forEach((f) => {
    const oldVal = has(head, f) ? head[f] : undefined
    const newVal = has(resultTree, f) ? resultTree[f] : undefined
    const knownToGit = has(head, f) || has(index, f)
    if (!knownToGit) {
      if (newVal !== undefined) untracked.push(f)
      return
    }
    const idxVal = has(index, f) ? index[f] : undefined
    const notStaged = idxVal === oldVal
    const missingOnDisk = !has(working, f)
    if (notStaged && missingOnDisk) return
    if (oldVal !== newVal && idxVal !== newVal) modified.push(f)
  })
  return { modified: modified.sort(), untracked: untracked.sort() }
}

/** Портировано из branchRepo.ts, applyTreeChange (см. её подробный комментарий). Возвращает новые index/working — какой из них применить (только index/working или ещё и branches/commits) решает вызывающий код (remoteCommands.ts). */
export function applyTreeChange(head: FileTree, index: FileTree, working: FileTree, resultTree: FileTree): { index: FileTree; working: FileTree } {
  const dirty = localChangeFiles(head, index, working)
  const files = new Set<string>([...Object.keys(head), ...Object.keys(resultTree), ...Object.keys(working), ...Object.keys(index)])
  const nextIndex: FileTree = {}
  const nextWorking: FileTree = {}

  files.forEach((f) => {
    const oldVal = has(head, f) ? head[f] : undefined
    const resVal = has(resultTree, f) ? resultTree[f] : undefined
    const idxVal = has(index, f) ? index[f] : undefined
    const missingUnstagedOnTouchedPath = dirty.has(f) && oldVal !== resVal && idxVal === oldVal && !has(working, f)

    if (dirty.has(f) && !missingUnstagedOnTouchedPath) {
      if (has(index, f)) nextIndex[f] = index[f]
      if (has(working, f)) nextWorking[f] = working[f]
      return
    }
    if (has(resultTree, f)) {
      nextIndex[f] = resultTree[f]
      nextWorking[f] = resultTree[f]
    }
  })

  return { index: nextIndex, working: nextWorking }
}

// ---------- git status локальной копии ----------

export interface RemoteFileStatusEntry {
  file: string
  type: 'new file' | 'modified' | 'deleted'
}

export interface RemoteStatusSnapshot {
  staged: RemoteFileStatusEntry[]
  notStaged: RemoteFileStatusEntry[]
  untracked: string[]
}

/** Та же независимая реализация "index vs HEAD"/"working vs index", что и branchingStatus раздела 2 (branchRepo.ts) — не импортируется (другой тип состояния, см. шапку файла). */
export function remoteStatus(local: LocalRepo): RemoteStatusSnapshot {
  const head = commitTree(local.commits, local.branches[local.head])
  const files = new Set<string>([...Object.keys(head), ...Object.keys(local.index), ...Object.keys(local.working)])
  const staged: RemoteFileStatusEntry[] = []
  const notStaged: RemoteFileStatusEntry[] = []
  const untracked: string[] = []

  files.forEach((f) => {
    const inHead = has(head, f)
    const inIndex = has(local.index, f)
    const inWorking = has(local.working, f)

    if (inIndex && !inHead) staged.push({ file: f, type: 'new file' })
    else if (inIndex && inHead && local.index[f] !== head[f]) staged.push({ file: f, type: 'modified' })
    else if (!inIndex && inHead) staged.push({ file: f, type: 'deleted' })

    if (!inIndex && inWorking) {
      untracked.push(f)
      return
    }
    if (inIndex && inWorking && local.index[f] !== local.working[f]) notStaged.push({ file: f, type: 'modified' })
    else if (inIndex && !inWorking) notStaged.push({ file: f, type: 'deleted' })
  })

  return { staged, notStaged, untracked }
}

function byFileName(a: RemoteFileStatusEntry, b: RemoteFileStatusEntry): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0
}

/**
 * `On branch <head>` + строки про upstream (опасное место 1: «status сравнивает с origin/<ветка>,
 * то есть с записью, сделанной при последнем контакте», а не с текущим сервером) + обычный статус
 * (staged/notStaged/untracked — тот же формат, что и formatBranchingStatus раздела 2, портирован
 * под RemoteStatusSnapshot). Ветка без upstream (опасное место 7) — строк про сервер нет вовсе,
 * и пустой строки после "On branch <head>" тоже нет (сверено напрямую, git 2.53.0, 26.09.2026).
 */
export function formatRemoteStatus(local: LocalRepo): string {
  const branch = local.head
  const upstreamName = has(local.upstream, branch) ? local.upstream[branch] : undefined
  const upstreamLines: string[] = []
  if (upstreamName !== undefined) {
    const remoteRef = `origin/${upstreamName}`
    const localTip = local.branches[branch]
    const remoteTip = has(local.remoteBranches, upstreamName) ? local.remoteBranches[upstreamName] : undefined
    if (remoteTip === undefined) {
      // Защитный случай (не должен происходить: upstream ставится clone/push -u одновременно с
      // remoteBranches) — веток без записи в remoteBranches при настроенном upstream не бывает.
    } else if (localTip === remoteTip) {
      upstreamLines.push(`Your branch is up to date with '${remoteRef}'.`)
    } else {
      const { ahead, behind } = aheadBehindCounts(local.commits, localTip, remoteTip)
      if (behind === 0) {
        upstreamLines.push(`Your branch is ahead of '${remoteRef}' by ${ahead} commit${ahead === 1 ? '' : 's'}.`)
        upstreamLines.push('  (use "git push" to publish your local commits)')
      } else if (ahead === 0) {
        upstreamLines.push(`Your branch is behind '${remoteRef}' by ${behind} commit${behind === 1 ? '' : 's'}, and can be fast-forwarded.`)
        upstreamLines.push('  (use "git pull" to update your local branch)')
      } else {
        upstreamLines.push(`Your branch and '${remoteRef}' have diverged,`)
        upstreamLines.push(`and have ${ahead} and ${behind} different commits each, respectively.`)
        upstreamLines.push('  (use "git pull" if you want to integrate the remote branch with yours)')
      }
    }
  }

  const s = remoteStatus(local)
  const blocks: string[][] = []

  if (s.staged.length) {
    const block = ['Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)']
    s.staged
      .slice()
      .sort(byFileName)
      .forEach((x) => block.push(`\t${(x.type + ':').padEnd(12)}${x.file}`))
    blocks.push(block)
  }
  if (s.notStaged.length) {
    const addOrRm = s.notStaged.some((x) => x.type === 'deleted') ? 'git add/rm' : 'git add'
    const block = [
      'Changes not staged for commit:',
      `  (use "${addOrRm} <file>..." to update what will be committed)`,
      '  (use "git restore <file>..." to discard changes in working directory)',
    ]
    s.notStaged
      .slice()
      .sort(byFileName)
      .forEach((x) => block.push(`\t${(x.type + ':').padEnd(12)}${x.file}`))
    blocks.push(block)
  }
  if (s.untracked.length) {
    const block = ['Untracked files:', '  (use "git add <file>..." to include in what will be committed)']
    s.untracked
      .slice()
      .sort()
      .forEach((f) => block.push(`\t${f}`))
    blocks.push(block)
  }
  if (!s.staged.length) {
    if (s.notStaged.length) blocks.push(['no changes added to commit (use "git add" and/or "git commit -a")'])
    else if (s.untracked.length) blocks.push(['nothing added to commit but untracked files present (use "git add" to track)'])
    else blocks.push(['nothing to commit, working tree clean'])
  }

  let output = `On branch ${branch}`
  if (upstreamLines.length) output += '\n' + upstreamLines.join('\n')
  const priorContent = upstreamLines.length > 0
  blocks.forEach((block, i) => {
    output += (i === 0 && !priorContent ? '\n' : '\n\n') + block.join('\n')
  })
  if (s.staged.length) output += '\n'
  return output
}

// ---------- формат строк push/fetch (target.md, часть VII, опасное место 3) ----------

/**
 * Строка ссылки push/fetch: пробел, флаг, пробел, поле сводки (дополнено до 17 символов),
 * пробел, `<откуда> -> <куда>` (у fetch `from` ещё дополняется до ширины самого длинного имени в
 * этом выводе, минимум 10 — передаётся через `padFrom`; у push имя не выравнивается, `padFrom`
 * не передаётся). Сверено напрямую по байтам (см. отчёт о переносе, раздел «Формат строк push
 * и fetch»).
 */
export function refLine(flag: ' ' | '+' | '*' | '!', summary: string, from: string, to: string, suffix = '', padFrom?: number): string {
  const fromPart = padFrom !== undefined ? from.padEnd(padFrom) : from
  return ` ${flag} ${summary.padEnd(17)} ${fromPart} -> ${to}${suffix}`
}

// ---------- clone ----------

/** Создаёт локальную копию (target.md, часть VII, «Движок»): локальная ветка — только для ветки по умолчанию сервера, остальные ветки сервера — только как origin/* (клон копирует ВСЮ историю сервера в свою объектную базу). */
export function performClone(server: ServerState): LocalRepo {
  const commits: CommitMap = { ...server.commits }
  const tip = server.branches[server.defaultBranch]
  return {
    commits,
    branches: { [server.defaultBranch]: tip },
    branchOrder: [server.defaultBranch],
    head: server.defaultBranch,
    index: { ...commitTree(commits, tip) },
    working: { ...commitTree(commits, tip) },
    remoteBranches: { ...server.branches },
    remoteHeadBranch: server.defaultBranch,
    upstream: { [server.defaultBranch]: server.defaultBranch },
    pullRebaseFalse: false,
    pullFfOnly: false,
  }
}

// ---------- «Коллега пушит» (target.md, часть VII, «Кнопка «Коллега пушит»») ----------

/**
 * Двигает `master` СЕРВЕРА на новый коммит поверх его текущего конца — ровно так, как если бы
 * коллега сам сделал pull → commit → push без единого отказа (вторая копия не моделируется).
 * Первое нажатие создаёт CHANGELOG.md, каждое следующее дописывает строку — тексты задаёт
 * интегратор/словарь через `changelogLine`/`commitMessage` (бизнес-контент, не дело этого модуля,
 * тот же принцип, что и остальные seed-тексты движка).
 */
export function performColleaguePush(
  server: ServerState,
  clock: number,
  n: number,
  changelogTree: (previous: string | undefined) => string,
  commitMessage: (n: number) => string,
): { server: ServerState; commit: RemoteCommit; clock: number } {
  const parentId = server.branches.master
  const parentTree = commitTree(server.commits, parentId)
  const nextTree: FileTree = { ...parentTree, 'CHANGELOG.md': changelogTree(parentTree['CHANGELOG.md']) }
  const message = commitMessage(n)
  const id = remoteCommitHash(message, nextTree, [parentId], clock)
  const commit: RemoteCommit = { id, parents: [parentId], message, tree: nextTree }
  const nextServer: ServerState = { ...server, commits: { ...server.commits, [id]: commit }, branches: { ...server.branches, master: id } }
  return { server: nextServer, commit, clock: clock + 1 }
}

// ---------- fetch (переиспользуется и внутри pull) ----------

export interface FetchUpdate {
  name: string
  isNew: boolean
  oldId?: string
  newId: string
}

/**
 * Скачивает коммиты и двигает `origin/*` (target.md, часть VII, «Что входит», «Скачивание»).
 * `onlyBranch` — для `git pull origin <ветка>` (обновляется только эта ветка, но строка
 * FETCH_HEAD печатается вызывающим кодом всегда — см. remoteCommands.ts). Возвращает `updates`
 * (для построения строк — с шириной поля, единой для всего вывода, remoteCommands.ts) и
 * обновлённый `LocalRepo`; если `onlyBranch` указывает на несуществующую на сервере ветку,
 * `updates` пуст и `notFound: true` — вызывающий код печатает «couldn't find remote ref».
 */
export function performFetch(local: LocalRepo, server: ServerState, onlyBranch?: string): { local: LocalRepo; updates: FetchUpdate[]; notFound: boolean } {
  if (onlyBranch !== undefined && !has(server.branches, onlyBranch)) {
    return { local, updates: [], notFound: true }
  }
  const targets = onlyBranch !== undefined ? [onlyBranch] : server.branchOrder
  let commits = local.commits
  const remoteBranches = { ...local.remoteBranches }
  const updates: FetchUpdate[] = []
  targets.forEach((name) => {
    const newId = server.branches[name]
    if (newId === undefined) return
    const oldId = has(local.remoteBranches, name) ? local.remoteBranches[name] : undefined
    if (oldId === newId) return
    commits = collectReachable(server.commits, commits, newId)
    remoteBranches[name] = newId
    updates.push(oldId === undefined ? { name, isNew: true, newId } : { name, isNew: false, oldId, newId })
  })
  return { local: { ...local, commits, remoteBranches }, updates, notFound: false }
}

/** Строит строки вывода `git fetch`/блока fetch внутри `pull` из уже посчитанных `updates` (target.md, часть VII, опасное место 3: ширина поля имени = максимум среди имён ЭТОГО вывода, минимум 10). Пустой список — вызывающий код ничего не печатает (опасное место 4: пустой fetch молчит). */
export function formatFetchUpdates(updates: FetchUpdate[]): string[] {
  if (!updates.length) return []
  const width = Math.max(10, ...updates.map((u) => u.name.length))
  return updates.map((u) => {
    const to = `origin/${u.name}`
    if (u.isNew) return refLine('*', '[new branch]', u.name, to, '', width)
    return refLine(' ', `${short(u.oldId as string)}..${short(u.newId)}`, u.name, to, '', width)
  })
}

// ---------- push одной ветки ----------

export type PushOutcome =
  | { kind: 'upToDate' }
  | { kind: 'newBranch'; line: string; server: ServerState; local: LocalRepo }
  | { kind: 'updated'; line: string; server: ServerState; local: LocalRepo }
  | { kind: 'forced'; line: string; server: ServerState; local: LocalRepo }
  | { kind: 'rejected'; reason: 'fetch first' | 'non-fast-forward' }

/**
 * Отправляет ветку `branchName` (её текущий локальный кончик) на сервер (target.md, часть VII,
 * «Что входит», «Отправка», и опасное место 2 — критерий "fetch first"/"non-fast-forward"
 * решает наличие коммита сервера В КОПИИ, а не совпадение origin/<ветка>). `force` — `git push
 * --force`: обычная строка без "+"/"(forced update)", если реального расхождения не было
 * (перемотка), иначе "+ …" (target.md, опасное место 3: «push --force без расхождения печатает
 * обычную строку»).
 */
export function pushBranch(local: LocalRepo, server: ServerState, branchName: string, force: boolean): PushOutcome {
  const localTip = local.branches[branchName]
  const serverTip = server.branches[branchName]

  if (serverTip === undefined) {
    const nextServer: ServerState = {
      ...server,
      branches: { ...server.branches, [branchName]: localTip },
      branchOrder: [...server.branchOrder, branchName],
      commits: collectReachable(local.commits, server.commits, localTip),
    }
    const nextLocal: LocalRepo = { ...local, remoteBranches: { ...local.remoteBranches, [branchName]: localTip } }
    return { kind: 'newBranch', line: refLine('*', '[new branch]', branchName, branchName), server: nextServer, local: nextLocal }
  }

  if (serverTip === localTip) return { kind: 'upToDate' }

  const ff = isAncestor(local.commits, serverTip, localTip)

  if (!force && !ff) {
    const reason: 'fetch first' | 'non-fast-forward' = has(local.commits, serverTip) ? 'non-fast-forward' : 'fetch first'
    return { kind: 'rejected', reason }
  }

  const nextServerCommits = collectReachable(local.commits, server.commits, localTip)
  const nextServer: ServerState = { ...server, commits: nextServerCommits, branches: { ...server.branches, [branchName]: localTip } }
  const nextLocal: LocalRepo = { ...local, remoteBranches: { ...local.remoteBranches, [branchName]: localTip } }

  if (ff) {
    return { kind: 'updated', line: refLine(' ', `${short(serverTip)}..${short(localTip)}`, branchName, branchName), server: nextServer, local: nextLocal }
  }
  return { kind: 'forced', line: refLine('+', `${short(serverTip)}...${short(localTip)}`, branchName, branchName, ' (forced update)'), server: nextServer, local: nextLocal }
}

// ---------- интеграция pull (fast-forward / merge / отказ) ----------

export type PullIntegrationOutcome =
  | { kind: 'upToDate' }
  | { kind: 'fastForward'; local: LocalRepo; fromShort: string; toShort: string }
  | { kind: 'merged'; local: LocalRepo; clock: number }
  | { kind: 'conflict'; conflicts: Array<{ file: string; kind: 'content' | 'modify-delete' | 'add-add' }> }
  | { kind: 'needsChoice' }
  | { kind: 'ffOnlyRefused' }

export interface PullReconcileOptions {
  /** `--no-rebase` на этом вызове ИЛИ ранее выполненная `git config pull.rebase false` — сливать. */
  merge: boolean
  /** `--ff-only` на этом вызове ИЛИ `git config pull.ff only` — только перемотка. */
  ffOnly: boolean
}

/**
 * Что делать после fetch-части pull (target.md, часть VII, опасное место 5): нечего интегрировать
 * / перемотка / слияние (только если явно выбрано) / отказ с честным «конфликт» (правило области)
 * / отказ «нужно выбрать способ» / отказ «--ff-only не может перемотать».
 * `mergeMessage` — сообщение коммита слияния (задаёт вызывающий код: `Merge branch '<ветка>' of
 * <путь>` — опасное место 6, интерполяция пути/имени ветки — дело remoteCommands.ts).
 */
export function pullIntegrate(local: LocalRepo, branch: string, remoteTip: string, opts: PullReconcileOptions, clock: number, mergeMessage: string): PullIntegrationOutcome {
  const localTip = local.branches[branch]
  if (localTip === remoteTip || isAncestor(local.commits, remoteTip, localTip)) return { kind: 'upToDate' }

  if (isAncestor(local.commits, localTip, remoteTip)) {
    const head = commitTree(local.commits, localTip)
    const target = commitTree(local.commits, remoteTip)
    const { index, working } = applyTreeChange(head, local.index, local.working, target)
    const nextLocal: LocalRepo = { ...local, branches: { ...local.branches, [branch]: remoteTip }, index, working }
    return { kind: 'fastForward', local: nextLocal, fromShort: short(localTip), toShort: short(remoteTip) }
  }

  // Ветки разошлись.
  if (opts.ffOnly) return { kind: 'ffOnlyRefused' }
  if (!opts.merge) return { kind: 'needsChoice' }

  const baseResult = mergeBase(local.commits, localTip, remoteTip)
  const baseId = baseResult.ambiguous ? baseResult.bases[0] : baseResult.base
  const merged = mergeTrees(commitTree(local.commits, baseId), commitTree(local.commits, localTip), commitTree(local.commits, remoteTip))
  if (merged.conflicts.length) return { kind: 'conflict', conflicts: merged.conflicts }

  const id = remoteCommitHash(mergeMessage, merged.tree, [localTip, remoteTip], clock)
  const commit: RemoteCommit = { id, parents: [localTip, remoteTip], message: mergeMessage, tree: merged.tree }
  const head = commitTree(local.commits, localTip)
  const { index, working } = applyTreeChange(head, local.index, local.working, merged.tree)
  const nextLocal: LocalRepo = {
    ...local,
    commits: { ...local.commits, [id]: commit },
    branches: { ...local.branches, [branch]: id },
    index,
    working,
  }
  return { kind: 'merged', local: nextLocal, clock: clock + 1 }
}
