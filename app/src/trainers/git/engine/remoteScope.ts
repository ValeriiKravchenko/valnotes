// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): граница области (target.md,
// часть III, правило 1; часть VII — что входит и не входит). По устройству —
// аналог undoScope.ts/inspectScope.ts: команды add/commit/branch/checkout/
// status ЭТОГО раздела разбираются той же классификацией флагов, что и раздел
// 2 (classifySection2Option, branchScope.ts — та же команда git даёт те же
// реальные флаги независимо от раздела), НОВЫЕ для раздела 5 команды
// (clone/remote/fetch/push/pull/config) получают свою, более простую
// классификацию — точным совпадением, без разбора сокращений и кластеров
// (тот же принцип и то же обоснование, что и в inspectScope.ts/undoScope.ts:
// раздел «сырая версия», ошибка в консервативную сторону, а не в сторону
// выдумки).
//
// Все буквальные тексты usage-блоков и хэш-подобные строки ниже — из
// docs/git-trainer/reports/section5-git-runs.txt (git 2.53.0, LC_ALL=C,
// GIT_CONFIG_GLOBAL=/dev/null, временный каталог, 26.09.2026) — НЕ по памяти.
// ============================================================
import { classifyOptionToken } from './outOfScopeForms'

export { GLOBAL_GIT_OPTIONS, isGlobalGitOption, REAL_GIT_COMMANDS, gitNotACommand } from './branchScope'

/** Условный адрес сервера/копии — тот же приём, что и /site в branchCommands.ts (target.md, часть VII, «Адрес сервера»): выдуман только корень /team, остальное — то, что git печатает буквально (To/From/failed to push some refs to). */
export const SERVER_PATH = '/team/origin'
export const LOCAL_PATH = '/team/local'

/** git-подкоманды, которые раздел 5 разбирает буквально. */
export const SECTION5_COMMANDS = ['clone', 'remote', 'branch', 'checkout', 'add', 'commit', 'status', 'fetch', 'push', 'pull', 'config'] as const
export type Section5Command = (typeof SECTION5_COMMANDS)[number]

export function isSection5Command(sub: string): sub is Section5Command {
  return (SECTION5_COMMANDS as readonly string[]).includes(sub)
}

/** Команды, которым не нужен существующий репозиторий (target.md, часть VII, «Исходное состояние»: до clone любая ДРУГАЯ команда отвечает "not a git repository"). Упрощение относительно раздела 1 (states.test.ts, там это же правило шире — включает help/config): здесь только clone, потому что до clone больше ничего из "Что входит" раздела 5 не имеет смысла выполнять (git config пишет в .git/config конкретного репозитория). */
export function commandNeedsNoRepo(sub: string): boolean {
  return sub === 'clone'
}

// ---------- usage-блоки (буквально, git 2.53.0, 26.09.2026) ----------

export const CLONE_USAGE =
  'usage: git clone [<options>] [--] <repo> [<dir>]\n' +
  '\n' +
  '    -v, --[no-]verbose    be more verbose\n' +
  '    -q, --[no-]quiet      be more quiet\n' +
  '    --[no-]progress       force progress reporting\n' +
  "    --[no-]reject-shallow don't clone shallow repository\n" +
  "    -n, --no-checkout     don't create a checkout\n" +
  '    --checkout            opposite of --no-checkout\n' +
  '    --[no-]bare           create a bare repository\n' +
  '    --[no-]mirror         create a mirror repository (implies --bare)\n' +
  '    -l, --[no-]local      to clone from a local repository\n' +
  "    --no-hardlinks        don't use local hardlinks, always copy\n" +
  '    --hardlinks           opposite of --no-hardlinks\n' +
  '    -s, --[no-]shared     setup as shared repository\n' +
  '    --[no-]recurse-submodules[=<pathspec>]\n' +
  '                          initialize submodules in the clone\n' +
  '    --[no-]recursive[=<pathspec>]\n' +
  '                          alias of --recurse-submodules\n' +
  '    -j, --[no-]jobs <n>   number of submodules cloned in parallel\n' +
  '    --[no-]template <template-directory>\n' +
  '                          directory from which templates will be used\n' +
  '    --[no-]reference <repo>\n' +
  '                          reference repository\n' +
  '    --[no-]reference-if-able <repo>\n' +
  '                          reference repository\n' +
  '    --[no-]dissociate     use --reference only while cloning\n' +
  "    -o, --[no-]origin <name>\n" +
  "                          use <name> instead of 'origin' to track upstream\n" +
  '    -b, --[no-]branch <branch>\n' +
  "                          checkout <branch> instead of the remote's HEAD\n" +
  '    --[no-]revision <rev> clone single revision <rev> and check out\n' +
  '    -u, --[no-]upload-pack <path>\n' +
  '                          path to git-upload-pack on the remote\n' +
  '    --[no-]depth <depth>  create a shallow clone of that depth\n' +
  '    --[no-]shallow-since <time>\n' +
  '                          create a shallow clone since a specific time\n' +
  '    --[no-]shallow-exclude <ref>\n' +
  '                          deepen history of shallow clone, excluding ref\n' +
  '    --[no-]single-branch  clone only one branch, HEAD or --branch\n' +
  '    --[no-]tags           clone tags, and make later fetches not to follow them\n' +
  '    --[no-]shallow-submodules\n' +
  '                          any cloned submodules will be shallow\n' +
  '    --[no-]separate-git-dir <gitdir>\n' +
  '                          separate git dir from working tree\n' +
  '    --[no-]ref-format <format>\n' +
  '                          specify the reference format to use\n' +
  '    -c, --[no-]config <key=value>\n' +
  '                          set config inside the new repository\n' +
  '    --[no-]server-option <server-specific>\n' +
  '                          option to transmit\n' +
  '    -4, --ipv4            use IPv4 addresses only\n' +
  '    -6, --ipv6            use IPv6 addresses only\n' +
  '    --[no-]filter <args>  object filtering\n' +
  '    --[no-]also-filter-submodules\n' +
  '                          apply partial clone filters to submodules\n' +
  '    --[no-]remote-submodules\n' +
  '                          any cloned submodules will use their remote-tracking branch\n' +
  '    --[no-]sparse         initialize sparse-checkout file to include only files at root\n' +
  '    --[no-]bundle-uri <uri>\n' +
  '                          a URI for downloading bundles before fetching from origin remote\n'

export const PUSH_USAGE =
  'usage: git push [<options>] [<repository> [<refspec>...]]\n' +
  '\n' +
  '    -v, --[no-]verbose    be more verbose\n' +
  '    -q, --[no-]quiet      be more quiet\n' +
  '    --[no-]repo <repository>\n' +
  '                          repository\n' +
  '    --[no-]all            push all branches\n' +
  '    --[no-]branches       alias of --all\n' +
  '    --[no-]mirror         mirror all refs\n' +
  '    -d, --[no-]delete     delete refs\n' +
  "    --[no-]tags           push tags (can't be used with --all or --branches or --mirror)\n" +
  '    -n, --[no-]dry-run    dry run\n' +
  '    --[no-]porcelain      machine-readable output\n' +
  '    -f, --[no-]force      force updates\n' +
  '    --[no-]force-with-lease[=<refname>:<expect>]\n' +
  '                          require old value of ref to be at this value\n' +
  '    --[no-]force-if-includes\n' +
  '                          require remote updates to be integrated locally\n' +
  '    --[no-]recurse-submodules (check|on-demand|no)\n' +
  '                          control recursive pushing of submodules\n' +
  '    --[no-]thin           use thin pack\n' +
  '    --[no-]receive-pack <receive-pack>\n' +
  '                          receive pack program\n' +
  '    --[no-]exec <receive-pack>\n' +
  '                          receive pack program\n' +
  '    -u, --[no-]set-upstream\n' +
  '                          set upstream for git pull/status\n' +
  '    --[no-]progress       force progress reporting\n' +
  '    --[no-]prune          prune locally removed refs\n' +
  '    --no-verify           bypass pre-push hook\n' +
  '    --verify              opposite of --no-verify\n' +
  '    --[no-]follow-tags    push missing but relevant tags\n' +
  '    --[no-]signed[=(yes|no|if-asked)]\n' +
  '                          GPG sign the push\n' +
  '    --[no-]atomic         request atomic transaction on remote side\n' +
  '    -o, --[no-]push-option <server-specific>\n' +
  '                          option to transmit\n' +
  '    -4, --ipv4            use IPv4 addresses only\n' +
  '    -6, --ipv6            use IPv6 addresses only\n'

export const FETCH_USAGE =
  'usage: git fetch [<options>] [<repository> [<refspec>...]]\n' +
  '   or: git fetch [<options>] <group>\n' +
  '   or: git fetch --multiple [<options>] [(<repository>|<group>)...]\n' +
  '   or: git fetch --all [<options>]\n' +
  '\n' +
  '    -v, --[no-]verbose    be more verbose\n' +
  '    -q, --[no-]quiet      be more quiet\n' +
  '    --[no-]all            fetch from all remotes\n' +
  '    --[no-]set-upstream   set upstream for git pull/fetch\n' +
  '    -a, --[no-]append     append to .git/FETCH_HEAD instead of overwriting\n' +
  '    --[no-]atomic         use atomic transaction to update references\n' +
  '    --[no-]upload-pack <path>\n' +
  '                          path to upload pack on remote end\n' +
  '    -f, --[no-]force      force overwrite of local reference\n' +
  '    -m, --[no-]multiple   fetch from multiple remotes\n' +
  '    -t, --[no-]tags       fetch all tags and associated objects\n' +
  '    -n                    do not fetch all tags (--no-tags)\n' +
  '    -j, --[no-]jobs <n>   number of submodules fetched in parallel\n' +
  '    --[no-]prefetch       modify the refspec to place all refs within refs/prefetch/\n' +
  '    -p, --[no-]prune      prune remote-tracking branches no longer on remote\n' +
  '    -P, --[no-]prune-tags prune local tags no longer on remote and clobber changed tags\n' +
  '    --[no-]recurse-submodules[=<on-demand>]\n' +
  '                          control recursive fetching of submodules\n' +
  '    --[no-]dry-run        dry run\n' +
  '    --[no-]porcelain      machine-readable output\n' +
  '    --[no-]write-fetch-head\n' +
  '                          write fetched references to the FETCH_HEAD file\n' +
  '    -k, --[no-]keep       keep downloaded pack\n' +
  '    -u, --[no-]update-head-ok\n' +
  '                          allow updating of HEAD ref\n' +
  '    --[no-]progress       force progress reporting\n' +
  '    --[no-]depth <depth>  deepen history of shallow clone\n' +
  '    --[no-]shallow-since <time>\n' +
  '                          deepen history of shallow repository based on time\n' +
  '    --[no-]shallow-exclude <ref>\n' +
  '                          deepen history of shallow clone, excluding ref\n' +
  '    --[no-]deepen <n>     deepen history of shallow clone\n' +
  '    --unshallow           convert to a complete repository\n' +
  '    --refetch             re-fetch without negotiating common commits\n' +
  '    --[no-]update-shallow accept refs that update .git/shallow\n' +
  '    --refmap <refmap>     specify fetch refmap\n' +
  '    -o, --[no-]server-option <server-specific>\n' +
  '                          option to transmit\n' +
  '    -4, --ipv4            use IPv4 addresses only\n' +
  '    -6, --ipv6            use IPv6 addresses only\n' +
  '    --[no-]negotiation-tip <revision>\n' +
  '                          report that we have only objects reachable from this object\n' +
  '    --[no-]negotiate-only do not fetch a packfile; instead, print ancestors of negotiation tips\n' +
  '    --[no-]filter <args>  object filtering\n' +
  '    --[no-]auto-maintenance\n' +
  "                          run 'maintenance --auto' after fetching\n" +
  '    --[no-]auto-gc        run \'maintenance --auto\' after fetching\n' +
  '    --[no-]show-forced-updates\n' +
  '                          check for forced-updates on all updated branches\n' +
  '    --[no-]write-commit-graph\n' +
  '                          write the commit-graph after fetching\n' +
  '    --[no-]stdin          accept refspecs from stdin\n'

export const PULL_USAGE =
  'usage: git pull [<options>] [<repository> [<refspec>...]]\n' +
  '\n' +
  '    -v, --[no-]verbose    be more verbose\n' +
  '    -q, --[no-]quiet      be more quiet\n' +
  '    --[no-]progress       force progress reporting\n' +
  '    --[no-]recurse-submodules[=<on-demand>]\n' +
  '                          control for recursive fetching of submodules\n' +
  '\n' +
  'Options related to merging\n' +
  '    -r, --[no-]rebase[=(false|true|merges|interactive)]\n' +
  '                          incorporate changes by rebasing rather than merging\n' +
  '    -n                    do not show a diffstat at the end of the merge\n' +
  '    --[no-]stat           show a diffstat at the end of the merge\n' +
  '    --[no-]compact-summary\n' +
  '                          show a compact-summary at the end of the merge\n' +
  '    --[no-]log[=<n>]      add (at most <n>) entries from shortlog to merge commit message\n' +
  '    --[no-]signoff[=...]  add a Signed-off-by trailer\n' +
  '    --[no-]squash         create a single commit instead of doing a merge\n' +
  '    --[no-]commit         perform a commit if the merge succeeds (default)\n' +
  '    --[no-]edit           edit message before committing\n' +
  '    --[no-]cleanup <mode> how to strip spaces and #comments from message\n' +
  '    --[no-]ff             allow fast-forward\n' +
  '    --ff-only             abort if fast-forward is not possible\n' +
  '    --[no-]verify         control use of pre-merge-commit and commit-msg hooks\n' +
  '    --[no-]verify-signatures\n' +
  '                          verify that the named commit has a valid GPG signature\n' +
  '    --[no-]autostash      automatically stash/stash pop before and after\n' +
  '    -s, --[no-]strategy <strategy>\n' +
  '                          merge strategy to use\n' +
  '    -X, --[no-]strategy-option <option=value>\n' +
  '                          option for selected merge strategy\n' +
  '    -S, --[no-]gpg-sign[=<key-id>]\n' +
  '                          GPG sign commit\n' +
  '    --[no-]allow-unrelated-histories\n' +
  '                          allow merging unrelated histories\n' +
  '\n' +
  'Options related to fetching\n' +
  '    --[no-]all            fetch from all remotes\n' +
  '    -a, --[no-]append     append to .git/FETCH_HEAD instead of overwriting\n' +
  '    --[no-]upload-pack <path>\n' +
  '                          path to upload pack on remote end\n' +
  '    -f, --[no-]force      force overwrite of local branch\n' +
  '    -t, --[no-]tags       fetch all tags and associated objects\n' +
  '    -p, --[no-]prune      prune remote-tracking branches no longer on remote\n' +
  '    -j, --[no-]jobs[=<n>] number of submodules pulled in parallel\n' +
  '    --[no-]dry-run        dry run\n' +
  '    -k, --[no-]keep       keep downloaded pack\n' +
  '    --[no-]depth <depth>  deepen history of shallow clone\n' +
  '    --[no-]shallow-since <time>\n' +
  '                          deepen history of shallow repository based on time\n' +
  '    --[no-]shallow-exclude <ref>\n' +
  '                          deepen history of shallow clone, excluding ref\n' +
  '    --[no-]deepen <n>     deepen history of shallow clone\n' +
  '    --unshallow           convert to a complete repository\n' +
  '    --[no-]update-shallow accept refs that update .git/shallow\n' +
  '    --refmap <refmap>     specify fetch refmap\n' +
  '    -o, --[no-]server-option <server-specific>\n' +
  '                          option to transmit\n' +
  '    -4, --[no-]ipv4       use IPv4 addresses only\n' +
  '    -6, --[no-]ipv6       use IPv6 addresses only\n' +
  '    --[no-]negotiation-tip <revision>\n' +
  '                          report that we have only objects reachable from this object\n' +
  '    --[no-]show-forced-updates\n' +
  '                          check for forced-updates on all updated branches\n' +
  '    --[no-]set-upstream   set upstream for git pull/fetch\n'

export const REMOTE_USAGE =
  'usage: git remote [-v | --verbose]\n' +
  '   or: git remote add [-t <branch>] [-m <master>] [-f] [--tags | --no-tags] [--mirror=<fetch|push>] <name> <url>\n' +
  '   or: git remote rename [--[no-]progress] <old> <new>\n' +
  '   or: git remote remove <name>\n' +
  '   or: git remote set-head <name> (-a | --auto | -d | --delete | <branch>)\n' +
  '   or: git remote [-v | --verbose] show [-n] <name>\n' +
  '   or: git remote prune [-n | --dry-run] <name>\n' +
  '   or: git remote [-v | --verbose] update [-p | --prune] [(<group> | <remote>)...]\n' +
  '   or: git remote set-branches [--add] <name> <branch>...\n' +
  '   or: git remote get-url [--push] [--all] <name>\n' +
  '   or: git remote set-url [--push] <name> <newurl> [<oldurl>]\n' +
  '   or: git remote set-url --add <name> <newurl>\n' +
  '   or: git remote set-url --delete <name> <url>\n' +
  '\n' +
  '    -v, --[no-]verbose    be verbose; must be placed before a subcommand\n'

/** `git push master`/`git pull master` — "master" не совпадает с именем ни одного настоящего сервера (у нас есть только "origin"), поэтому git пытается читать его как путь и получает эту ошибку (сверено напрямую — тот же текст у push и pull, отличается только код возврата, см. ниже). */
export const NOT_A_REPO_BLOCK = (name: string): string =>
  `fatal: '${name}' does not appear to be a git repository\n` +
  'fatal: Could not read from remote repository.\n' +
  '\n' +
  'Please make sure you have the correct access rights\n' +
  'and the repository exists.'

/** target.md, часть VII, опасное место 7 — push с текущей веткой без upstream, ключевое слово branch подставляется. */
export const PUSH_NO_UPSTREAM_BLOCK = (branch: string): string =>
  `fatal: The current branch ${branch} has no upstream branch.\n` +
  'To push the current branch and set the remote as upstream, use\n' +
  '\n' +
  `    git push --set-upstream origin ${branch}\n` +
  '\n' +
  'To have this happen automatically for branches without a tracking\n' +
  "upstream, see 'push.autoSetupRemote' in 'git help config'.\n"

/** target.md, часть VII, опасное место 7 — pull без upstream у текущей ветки. */
export const PULL_NO_TRACKING_BLOCK = (branch: string): string =>
  'There is no tracking information for the current branch.\n' +
  'Please specify which branch you want to merge with.\n' +
  'See git-pull(1) for details.\n' +
  '\n' +
  '    git pull <remote> <branch>\n' +
  '\n' +
  'If you wish to set tracking information for this branch you can do so with:\n' +
  '\n' +
  `    git branch --set-upstream-to=origin/<branch> ${branch}\n`

/** target.md, часть VII, опасное место 2 — два разных hint-блока отказа push, дословно (английский, не переводится). */
export const PUSH_FETCH_FIRST_HINT =
  'hint: Updates were rejected because the remote contains work that you do not\n' +
  'hint: have locally. This is usually caused by another repository pushing to\n' +
  'hint: the same ref. If you want to integrate the remote changes, use\n' +
  "hint: 'git pull' before pushing again.\n" +
  "hint: See the 'Note about fast-forwards' in 'git push --help' for details."

export const PUSH_NON_FF_HINT =
  'hint: Updates were rejected because the tip of your current branch is behind\n' +
  'hint: its remote counterpart. If you want to integrate the remote changes,\n' +
  "hint: use 'git pull' before pushing again.\n" +
  "hint: See the 'Note about fast-forwards' in 'git push --help' for details."

/** target.md, часть VII, опасное место 5 — git 2.53 отказывает на расхождении без настройки. */
export const PULL_DIVERGED_NEEDS_CHOICE_BLOCK =
  'hint: You have divergent branches and need to specify how to reconcile them.\n' +
  'hint: You can do so by running one of the following commands sometime before\n' +
  'hint: your next pull:\n' +
  'hint:\n' +
  'hint:   git config pull.rebase false  # merge\n' +
  'hint:   git config pull.rebase true   # rebase\n' +
  'hint:   git config pull.ff only       # fast-forward only\n' +
  'hint:\n' +
  'hint: You can replace "git config" with "git config --global" to set a default\n' +
  'hint: preference for all repositories. You can also pass --rebase, --no-rebase,\n' +
  'hint: or --ff-only on the command line to override the configured default per\n' +
  'hint: invocation.\n' +
  'fatal: Need to specify how to reconcile divergent branches.'

/** target.md, часть VII, опасное место 5 — `--ff-only`/`pull.ff only` на расхождении. */
export const PULL_FF_ONLY_DIVERGED_BLOCK =
  "hint: Diverging branches can't be fast-forwarded, you need to either:\n" +
  'hint:\n' +
  'hint: \tgit merge --no-ff\n' +
  'hint:\n' +
  'hint: or:\n' +
  'hint:\n' +
  'hint: \tgit rebase\n' +
  'hint:\n' +
  'hint: Disable this message with "git config set advice.diverging false"\n' +
  'fatal: Not possible to fast-forward, aborting.'

/** target.md, часть VII, опасное место 10 — нельзя удалить ветку, которую держит единственный "worktree" копии (LOCAL_PATH). */
export const BRANCH_DELETE_CURRENT_WORKTREE = (name: string): string => `error: cannot delete branch '${name}' used by worktree at '${LOCAL_PATH}'`

/** Совпадает с section2 (branchScope.ts, тот же текст сверен независимо): недостающий репозиторий. */
export const NOT_A_GIT_REPO = 'fatal: not a git repository (or any of the parent directories): .git'

/** Флаги push/fetch/pull/clone/remote, которые раздел 5 разбирает буквально (target.md, «Что входит») — точное совпадение, без сокращений (тот же принцип, что и в inspectScope.ts/undoScope.ts). */
export const PUSH_SCOPE_FLAGS = ['-u', '--set-upstream', '-f', '--force'] as const
export const PULL_SCOPE_FLAGS = ['--no-rebase', '--ff-only'] as const

/**
 * Реальные опции push/fetch/pull/clone/remote вне области (второй ответ) — списки НЕ
 * исчерпывающие (target.md, A10), покрывают явно названное в «Что НЕ входит» и соседние
 * распространённые формы. Классификация — точное совпадение (см. шапку файла).
 */
export const SECTION5_REAL_OPTIONS: Record<'push' | 'fetch' | 'pull' | 'clone' | 'remote', readonly string[]> = {
  push: ['--force-with-lease', '--force-if-includes', '--tags', '--all', '--delete', '-d', '--mirror', '--dry-run', '-n', '--prune'],
  fetch: ['--prune', '-p', '--all', '--tags', '-t', '--dry-run'],
  pull: ['--rebase', '-r', '--squash', '--ff', '--no-ff', '--commit', '--no-commit'],
  clone: ['--depth', '--bare', '--mirror', '--branch', '-b', '--single-branch', '--origin', '-o'],
  remote: ['add', 'remove', 'rename', 'set-url', 'set-head', 'set-branches', 'get-url', 'show', 'prune', 'update'],
}

/**
 * Полные наборы опций clone/fetch/push/pull/remote, которые настоящий git принимает: вывод
 * `git <команда> -h` плюс `git <команда> --git-completion-helper` (сверено на git 2.53.0,
 * 04.10.2026). Наборы исчерпывающие: опция вне них и вне форм `--no-<имя>` заведомо не существует.
 */
export const VERIFIED_SECTION5_OPTIONS: Record<'push' | 'fetch' | 'pull' | 'clone' | 'remote', readonly string[]> = {
  clone: [
    '--also-filter-submodules',
    '--bare',
    '--branch',
    '--bundle-uri',
    '--checkout',
    '--config',
    '--depth',
    '--dissociate',
    '--filter',
    '--hardlinks',
    '--ipv4',
    '--ipv6',
    '--jobs',
    '--local',
    '--mirror',
    '--no-also-filter-submodules',
    '--no-bare',
    '--no-branch',
    '--no-bundle-uri',
    '--no-checkout',
    '--no-config',
    '--no-depth',
    '--no-dissociate',
    '--no-filter',
    '--no-hardlinks',
    '--no-jobs',
    '--no-local',
    '--no-mirror',
    '--no-origin',
    '--no-progress',
    '--no-quiet',
    '--no-recurse-submodules',
    '--no-recursive',
    '--no-ref-format',
    '--no-reference',
    '--no-reference-if-able',
    '--no-reject-shallow',
    '--no-remote-submodules',
    '--no-revision',
    '--no-separate-git-dir',
    '--no-server-option',
    '--no-shallow-exclude',
    '--no-shallow-since',
    '--no-shallow-submodules',
    '--no-shared',
    '--no-single-branch',
    '--no-sparse',
    '--no-tags',
    '--no-template',
    '--no-upload-pack',
    '--no-verbose',
    '--origin',
    '--progress',
    '--quiet',
    '--recurse-submodules',
    '--ref-format',
    '--reference',
    '--reference-if-able',
    '--reject-shallow',
    '--remote-submodules',
    '--revision',
    '--separate-git-dir',
    '--server-option',
    '--shallow-exclude',
    '--shallow-since',
    '--shallow-submodules',
    '--shared',
    '--single-branch',
    '--sparse',
    '--tags',
    '--template',
    '--upload-pack',
    '--verbose',
    '-4',
    '-6',
    '-b',
    '-c',
    '-j',
    '-l',
    '-n',
    '-o',
    '-q',
    '-s',
    '-u',
    '-v',
  ],
  fetch: [
    '--all',
    '--append',
    '--atomic',
    '--auto-gc',
    '--auto-maintenance',
    '--deepen',
    '--depth',
    '--dry-run',
    '--filter',
    '--force',
    '--ipv4',
    '--ipv6',
    '--jobs',
    '--keep',
    '--multiple',
    '--negotiate-only',
    '--negotiation-tip',
    '--no-all',
    '--no-append',
    '--no-atomic',
    '--no-auto-gc',
    '--no-auto-maintenance',
    '--no-deepen',
    '--no-depth',
    '--no-dry-run',
    '--no-filter',
    '--no-force',
    '--no-jobs',
    '--no-keep',
    '--no-multiple',
    '--no-negotiate-only',
    '--no-negotiation-tip',
    '--no-porcelain',
    '--no-prefetch',
    '--no-progress',
    '--no-prune',
    '--no-prune-tags',
    '--no-quiet',
    '--no-recurse-submodules',
    '--no-server-option',
    '--no-set-upstream',
    '--no-shallow-exclude',
    '--no-shallow-since',
    '--no-show-forced-updates',
    '--no-stdin',
    '--no-tags',
    '--no-update-head-ok',
    '--no-update-shallow',
    '--no-upload-pack',
    '--no-verbose',
    '--no-write-commit-graph',
    '--no-write-fetch-head',
    '--porcelain',
    '--prefetch',
    '--progress',
    '--prune',
    '--prune-tags',
    '--quiet',
    '--recurse-submodules',
    '--refetch',
    '--refmap',
    '--server-option',
    '--set-upstream',
    '--shallow-exclude',
    '--shallow-since',
    '--show-forced-updates',
    '--stdin',
    '--tags',
    '--unshallow',
    '--update-head-ok',
    '--update-shallow',
    '--upload-pack',
    '--verbose',
    '--write-commit-graph',
    '--write-fetch-head',
    '-4',
    '-6',
    '-P',
    '-a',
    '-f',
    '-j',
    '-k',
    '-m',
    '-n',
    '-o',
    '-p',
    '-q',
    '-t',
    '-u',
    '-v',
  ],
  push: [
    '--all',
    '--atomic',
    '--delete',
    '--dry-run',
    '--exec',
    '--follow-tags',
    '--force',
    '--force-if-includes',
    '--force-with-lease',
    '--ipv4',
    '--ipv6',
    '--mirror',
    '--no-all',
    '--no-atomic',
    '--no-branches',
    '--no-delete',
    '--no-dry-run',
    '--no-exec',
    '--no-follow-tags',
    '--no-force',
    '--no-force-if-includes',
    '--no-force-with-lease',
    '--no-mirror',
    '--no-porcelain',
    '--no-progress',
    '--no-prune',
    '--no-push-option',
    '--no-quiet',
    '--no-receive-pack',
    '--no-recurse-submodules',
    '--no-repo',
    '--no-set-upstream',
    '--no-signed',
    '--no-tags',
    '--no-verbose',
    '--no-verify',
    '--porcelain',
    '--progress',
    '--prune',
    '--push-option',
    '--quiet',
    '--receive-pack',
    '--recurse-submodules',
    '--repo',
    '--set-upstream',
    '--signed',
    '--tags',
    '--verbose',
    '--verify',
    '-4',
    '-6',
    '-d',
    '-f',
    '-n',
    '-o',
    '-q',
    '-u',
    '-v',
  ],
  pull: [
    '--all',
    '--allow-unrelated-histories',
    '--append',
    '--autostash',
    '--cleanup',
    '--commit',
    '--compact-summary',
    '--deepen',
    '--depth',
    '--dry-run',
    '--edit',
    '--ff',
    '--ff-only',
    '--force',
    '--gpg-sign',
    '--ipv4',
    '--ipv6',
    '--jobs',
    '--keep',
    '--log',
    '--negotiation-tip',
    '--no-all',
    '--no-allow-unrelated-histories',
    '--no-append',
    '--no-autostash',
    '--no-cleanup',
    '--no-commit',
    '--no-compact-summary',
    '--no-deepen',
    '--no-depth',
    '--no-dry-run',
    '--no-edit',
    '--no-ff',
    '--no-force',
    '--no-gpg-sign',
    '--no-ipv4',
    '--no-ipv6',
    '--no-jobs',
    '--no-keep',
    '--no-log',
    '--no-negotiation-tip',
    '--no-progress',
    '--no-prune',
    '--no-quiet',
    '--no-rebase',
    '--no-recurse-submodules',
    '--no-server-option',
    '--no-set-upstream',
    '--no-shallow-exclude',
    '--no-shallow-since',
    '--no-show-forced-updates',
    '--no-signoff',
    '--no-squash',
    '--no-stat',
    '--no-strategy',
    '--no-strategy-option',
    '--no-tags',
    '--no-update-shallow',
    '--no-upload-pack',
    '--no-verbose',
    '--no-verify',
    '--no-verify-signatures',
    '--progress',
    '--prune',
    '--quiet',
    '--rebase',
    '--recurse-submodules',
    '--refmap',
    '--server-option',
    '--set-upstream',
    '--shallow-exclude',
    '--shallow-since',
    '--show-forced-updates',
    '--signoff',
    '--squash',
    '--stat',
    '--strategy',
    '--strategy-option',
    '--tags',
    '--unshallow',
    '--update-shallow',
    '--upload-pack',
    '--verbose',
    '--verify',
    '--verify-signatures',
    '-4',
    '-6',
    '-S',
    '-X',
    '-a',
    '-f',
    '-j',
    '-k',
    '-n',
    '-o',
    '-p',
    '-q',
    '-r',
    '-s',
    '-t',
    '-v',
  ],
  remote: [
    '--no-verbose',
    '--verbose',
    '-v',
  ],
}

export type Section5OptionClassification = 'scope' | 'outOfScope' | 'unknown'

/**
 * Классификация ОДНОГО флага команд раздела 5. `outOfScope` — git опцию принимает (полный набор,
 * `--no-<имя>`, однозначный префикс длинной опции, кластер известных коротких букв), раздел
 * не разбирает; `unknown` — такой опции в git заведомо нет.
 */
export function classifySection5Option(cmd: 'push' | 'fetch' | 'pull' | 'clone' | 'remote', scopeFlags: readonly string[], flag: string): Section5OptionClassification {
  const bare = flag.startsWith('--') ? flag.split('=')[0] : flag
  const verified = VERIFIED_SECTION5_OPTIONS[cmd]
  const cls = classifyOptionToken(bare, { inScope: scopeFlags, verifiedReal: [...SECTION5_REAL_OPTIONS[cmd], ...verified], exhaustive: true })
  if (cls === 'scope') return 'scope'
  if (cls === 'refuse') return 'outOfScope'
  if (bare.startsWith('--no-') && verified.includes('--' + bare.slice('--no-'.length))) return 'outOfScope'
  if (bare.startsWith('--') && bare.length > 2 && verified.some((o) => o.startsWith(bare))) return 'outOfScope'
  if (/^-[A-Za-z]{2,}$/.test(bare) && [...bare.slice(1)].every((c) => verified.includes('-' + c))) return 'outOfScope'
  return 'unknown'
}
