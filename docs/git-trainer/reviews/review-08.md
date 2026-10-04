# Ревью 8: движок раздела 2 тренажёра git

- Запуск: 25.09.2026 09:26 (МСК)
- Отчёт получен: 25.09.2026 09:31 (МСК)
- Сессия: `ed48ef8e-ebfc-4f1f-8d2b-7679b56677bc`
- Как названо в поручении: последний круг

Ниже отчёт reviewer дословно.

---

git --version: **git version 2.53.0**

## Итог
В перечисленных формах и сценариях тренажёр не учит неправде о git. Каждый реализованный шаг совпал с настоящим git 2.53.0: текст, исход и итоговое содержимое файлов. Две находки касаются не ложного поведения, а того, что части списка просто нет в движке.

## Находки

**1. Мешает работе: `git status` в разделе 2 не реализован.**
Где: `app/src/trainers/git/engine/branchScope.ts`, строка 21: `SECTION2_COMMANDS = ['branch', 'checkout', 'merge', 'add', 'commit']`, `status` в списке нет. Поэтому `executeBranchingCommand` (`branchCommands.ts`, около строки 917) отвечает отказом «вне области». При этом в `branchRepo.ts` уже есть готовый `formatBranchingStatus`, но его вызывает только `handleCommit`.
Прогон (рабочее дерево: изменён `style.css` на ветке feature):
```
настоящий git:
$ git status  [ok]
On branch feature
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   style.css

no changes added to commit (use "git add" and/or "git commit -a")

тренажёр:
$ git status  [FAIL]
[тренажёр] команда «git status» настоящая, но в этом шаге тренажёра не реализована — здесь работают git branch, git checkout, git merge, git add и git commit.
```
Отказ честный: он помечен как ограничение тренажёра, ложного утверждения о git в нём нет. Но форма стоит в списке того, чем игрок пользуется. Без неё игрок не видит, какие правки уезжают с ним при переключении веток и что застейджено перед `commit -am`.

**2. Мешает работе: миссий раздела 2 в движке нет, пройти их нельзя.**
Где: в `app/src/trainers/git/engine/branchSection.ts` есть только `createBranchingSection`, `runBranchingCommand` и геттеры. Ни списка миссий, ни их проверки нет. Поиск по `engine/` и `locales/ru.ts` миссий раздела 2 тоже не нашёл. Компонентов, которые вызывают `createBranchingSection` или `runBranchingCommand`, в `app/src` нет. Поэтому пункт «пройти каждую миссию как игрок» я выполнить не смог. Вместо этого прогнал все перечисленные сценарии напрямую через публичный вход `runBranchingCommand`.

## Что проверено и совпало
Прогон одинаковых шагов в настоящем git (mktemp -d, `GIT_CONFIG_GLOBAL=/dev/null`) и в тренажёре. Тренажёр собирал через esbuild в `/tmp/tmp.46okKAvYs2`, в репозитории ничего не записывалось.
- **`git branch`, `git branch <имя>`, повторное имя:** список со звёздочкой совпадает, `fatal: a branch named 'master' already exists` совпадает.
- **`git checkout <ветка>`, `-b <имя>`, `-b` без значения, `Already on`:** совпадают, включая `error: switch `b' requires a value`.
- **Переключение с незакоммиченными правками:**
  - перенос незастейдженной и застейдженной правки (`M\t<файл>`) совпадает;
  - перенос нового застейдженного файла (`A\ts`) совпадает;
  - отказ `would be overwritten by checkout` совпадает как для незастейдженной, так и для застейдженной правки;
  - отказ для неотслеживаемого файла, который перезаписала бы ветка, совпадает.
  - Порядок «строка `M` раньше `Switched…`» у тренажёра верный. В выводе через pipe он кажется обратным, но это эффект буферизации: под tty (`script -qc "git checkout x"`) настоящий git печатает `M\tf`, потом `Switched to branch 'x'`.
- **`git checkout -- <файл>` и `git checkout <файл>`:** с `--` ничего не печатается, без `--` печатается `Updated 1 path from the index`. Содержимое восстанавливается из индекса, для неизвестного пути выдаётся ошибка pathspec. Всё совпадает.
- **Перемотка:** `Updating X..Y` / `Fast-forward`; повторное слияние даёт `Already up to date.`. Отказ перемотки на грязном дереве (`Updating…` первой строкой под tty, затем блок ошибки и `Aborting`) совпадает, в том числе для неотслеживаемого файла.
- **Коммит слияния:** `Auto-merging <файл>` / `Merge made by the 'ort' strategy.`. Незастейдженная правка в файле, который слияние не трогает, переносится.
- **Отказы трёхстороннего слияния:**
  - при застейдженной правке в постороннем файле: `  c` одной строкой + `Merge with strategy ort failed.`;
  - при незастейдженной правке в затрагиваемом файле: блок + `Aborting` + `Merge with strategy ort failed.`.
  - Обе формы сверены под tty и совпадают.
- **Правки в разных строках одного файла:** проверены пять вариантов, итоговое содержимое совпадает байт в байт:
  - через строку;
  - первая строка против дописанной в конец;
  - файл без завершающего перевода строки;
  - одинаковая правка с обеих сторон (без `Auto-merging`, как у git);
  - соседние строки: git даёт `CONFLICT (content)`, тренажёр честно отказывает по конфликту и не сливает молча.
- **Удаление веток:**
  - неслитая ветка через `-d` даёт текст с двумя hint, совпадает;
  - `-D` удаляет, `Deleted branch X (was …)` совпадает;
  - слитая удаляется через `-d`;
  - текущая ветка через `-d`/`-D` даёт отказ `used by worktree at …`. Вместо настоящего пути подставлен `/site`, в коде это оговорено как плейсхолдер;
  - `-d` с третьей ветки, где слияние уже видно;
  - `branch 'nosuch' not found`.
- **`git add <файл>`, `git add .`, `commit -m`, `commit -am`:**
  - `add .` стейджит удаление;
  - `commit -am` не берёт неотслеживаемые файлы, отказ с полным статусом `nothing added to commit but untracked files present…` совпадает;
  - `commit -m ""` и `commit -m hi` на чистом дереве дают `On branch master` / `nothing to commit, working tree clean`, совпадает;
  - неизвестный путь в `add` даёт `fatal: pathspec … did not match any files`, совпадает.

Единственное систематическое отличие: нет диффстата (` f | 2 +-`, `1 file changed…`, `create/delete mode`) после commit, перемотки и слияния. Оно явно названо упрощением в шапке `branchCommands.ts`, придуманных чисел вместо него тренажёр не выдаёт. Неправдой это не считаю.

Файлы:
- app/src/trainers/git/engine/branchScope.ts
- app/src/trainers/git/engine/branchSection.ts
- app/src/trainers/git/engine/branchCommands.ts
- app/src/trainers/git/engine/branchRepo.ts
