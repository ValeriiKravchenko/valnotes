# Ревью 3: движок раздела 2 тренажёра git

- Запуск: 24.09.2026 07:12 (МСК)
- Отчёт получен: 24.09.2026 07:16 (МСК)
- Сессия: `a61afb8a-9190-4549-bf6e-0f0b8607d196`
- Как названо в поручении: четвёртый круг

Ниже отчёт reviewer дословно.

---

Четвёртый круг ревью движка раздела 2 (branch*.ts). Каждое утверждение проверено прогоном git 2.53.0 во временном каталоге `/tmp/tmp.jnZdgRWPLx`, созданном через `mktemp -d`, с отдельным GIT_CONFIG_GLOBAL. В репозитории ничего не менял, target.md и spec.md не открывал. Движок сам не запускал: его поведение выводил по коду и сравнивал с выводом git.

Нашёл 7 расхождений с настоящим git. Самое серьёзное — первое: неверный общий предок, из-за которого тренажёр может показать конфликт там, где git перематывает ветку.

## Дефекты, которые учат неправде

### 1. Неверный общий предок (merge-base) после коммита слияния (серьёзно)
**Где:** `branchRepo.ts:91-104` (`mergeBase`), используется в `branchCommands.ts:283-297`.

**Что делает код.** Идёт в ширину от `target` и берёт первый встреченный общий предок. Комментарий называет риск только для историй «крест-накрест», но ошибка возникает и в обычной истории, собранной командами шага A. Если у сливаемой ветки есть коммит слияния, короткий путь через побочного родителя приводит к более старому предку раньше, чем длинный путь к правильному.

**Прогон:**
```
R(f=0) ; git branch y ; C1(f=1) на master ; git checkout -b z ; Z1 ; Z2(f=2)
git checkout y ; Y1 ; git checkout z ; git merge y   -> Merge made by the 'ort' strategy.
git checkout master ; git merge z
Updating e7da19b..30b770b
Fast-forward
 f | 2 +-
 ...
```
Проверка обхода по коду для этой истории: из z-merge в очереди идут [Z2, Y1], потом Z1, потом R. R оказывается предком master раньше, чем обход дойдёт до C1. Движок получает base=R, а не current, и не узнаёт перемотку. Дальше он запускает трёхстороннее слияние f: 0 / 1 / 2 и получает конфликт. Игрок видит «[тренажёр] настоящий git начал бы слияние … с конфликтом: в файле «f» правки задели одни и те же строки», а настоящий git просто делает Fast-forward.

Та же история с лишним коммитом A на master: `git merge-base master z` показывает C1, `git merge z` проходит чисто с f=2. У движка base=R и снова ложный конфликт.

**Чем опасно:** игрок учится, что после слияний в истории возникают конфликты там, где их нет, и не видит перемотку. Для решения «перемотка или нет» достаточно `isAncestor(current, target)`. Для выбора базы нужен «лучший» общий предок: тот, который не является предком другого общего предка.

### 2. Локально удалённый файл (удаление не в индексе) блокирует checkout и merge, а git — нет (серьёзно)
**Где:** `branchRepo.ts:444-461` (`checkSafety`), условие `oldVal !== newVal && idxVal !== newVal`.

**Прогон:** f удалён командой `rm`, у ветки other другое содержимое f.
```
$ git status --short
 D f
$ git checkout other
Switched to branch 'other'
[exit 0]
$ git status --short
(пусто; cat f -> other)
```
С `git merge other` то же самое. Перемотка: `Updating f6aaf63..75a8012 / Fast-forward`, exit 0, дерево чистое. Обычное слияние: `Merge made by the 'ort' strategy.`, exit 0, дерево чистое.

**Что делает код.** Файл попадает в `dirty`, при этом idx=head≠target. Движок выдаёт «Your local changes to the following files would be overwritten by checkout: f». Настоящий git отсутствующий в рабочем дереве файл не считает правкой, которую затирают: `verify_uptodate` при ENOENT пропускает путь, а git записывает содержимое цели. Тесты (`branchCommands.test.ts:118`, `:553`) показывают, что сценарий локального удаления в модели предусмотрен.

### 3. Конфликт при грязном рабочем дереве: тренажёр говорит «git начал бы слияние с конфликтом», а git отказывает раньше (средне)
**Где:** `branchCommands.ts:326-337`. Проверка конфликтов (`mergeConflictOutOfScope`) идёт раньше `checkSafety`.

**Прогон:** f изменён в обеих ветках по-разному, плюс незастейдженная правка f.
```
$ git merge other
error: Your local changes to the following files would be overwritten by merge:
	f
Please commit your changes or stash them before you merge.
Aborting
Merge with strategy ort failed.
[exit 2]
```
Слияние не начинается, состояние конфликта не возникает.

**Что делает код.** Выдаёт текст с маркером «[тренажёр] настоящий git начал бы слияние … с конфликтом». Для этого случая это ложное утверждение о git.

### 4. Несколько `-m` склеиваются, а не заменяют друг друга (средне)
**Где:** `branchCommands.ts:411-422`. Каждый следующий `-m` перезаписывает `message`.

**Прогон:**
```
$ git commit -m a -m b
[master aafeaca] a
$ git log -1 --format=%B
a

b
```
Движок напечатает `[master xxxxxxx] b`, и сообщение коммита будет «b».

### 5. Движок не проверяет имя ветки (средне)
**Где:** `branchCommands.ts:116-119` (`git branch <имя>`) и `:174-185` (`git checkout -b <имя>`). Имя создаётся без проверки.

**Прогон:**
```
$ git branch a..b
fatal: 'a..b' is not a valid branch name
hint: See 'git help check-ref-format'
hint: Disable this message with "git config set advice.refSyntax false"
[exit 128]
```
- `git branch HEAD` даёт такой же вывод с `'HEAD'`.
- `git checkout -b "a b"` даёт `fatal: 'a b' is not a valid branch name` с теми же двумя строками hint.
- `git checkout -b -x` даёт `fatal: '-x' is not a valid branch name` с теми же hint.

Движок молча создаёт ветки `a b`, `HEAD`, `-x`, `a..b`. Последний случай особенно вреден: имя с пробелом шелл передаёт в кавычках, и игрок решит, что так можно.

### 6. При двух видах блокировки печатается только один блок ошибки (средне-мелко)
**Где:** `branchCommands.ts:234-235`, `:292-293`, `:336-337`. `modified` и `untracked` проверяются через if/return по очереди.

**Прогон:** изменённый f и неотслеживаемый n, оба затираются целью.
```
$ git checkout other
error: Your local changes to the following files would be overwritten by checkout:
	f
Please commit your changes or stash them before you switch branches.
error: The following untracked working tree files would be overwritten by checkout:
	n
Please move or remove them before you switch branches.
Aborting
```
`git merge other` при перемотке выдаёт то же после строки `Updating 83b75ea..96fca3a`. Движок покажет только первый блок со своим «Aborting». Игрок исправит f и получит неожиданную вторую ошибку, а git сразу называет оба файла.

### 7. `git commit` без `-m` выдаётся как голый вывод git, без пояснения про редактор (мелко, по умолчанию)
**Где:** `branchCommands.ts:429`, `fail(state, 'Aborting commit due to empty commit message.', null)` для `message === null`.

Настоящий git без `-m` открывает редактор. В разделе 1 для этого есть пояснение `ru.explain.commitAborting`, а здесь `explanation` равен null. Выглядит так, будто git отвергает коммит без `-m`. Для `-m ""` вывод точный, прогон: `Aborting commit due to empty commit message.`, exit 1.

## Дефект вывода, пока не достижимый в текущих командах
**`branchRepo.ts:628-632`, `formatBranchingStatus`.** Если среди незастейдженных изменений есть удаление, git пишет другую подсказку. Прогон `git commit -m x` после `rm w`:
```
Changes not staged for commit:
  (use "git add/rm <file>..." to update what will be committed)
```
Код всегда печатает `git add <file>...`. Путь достижим, как только UI позволит удалить файл, а тесты это уже делают. Там же у блока «Changes to be committed:» нет подсказки `(use "git restore --staged <file>..." to unstage)`. Через `handleCommit` этот блок не выводится, но функция экспортирована как общий статус.

## Что проверил и что совпало с git
- **Ошибки `git branch`:**
  - `branch -d` на несуществующей ветке → `error: branch 'x' not found`;
  - `-d`/`-D` на текущей ветке → `used by worktree at …`; путь заменён заглушкой, это отмечено в коде;
  - `-d` без имени → `fatal: branch name required`;
  - существующая ветка → `a branch named … already exists`;
  - `-d` на неслитой ветке → текст и обе строки hint.
- **Ошибки checkout и merge:**
  - `checkout -b` без значения;
  - `checkout <нет такого>` → pathspec-ошибка;
  - `merge` без аргументов → `No remote for the current branch.`;
  - `merge <нет такого>`;
  - `Already up to date.`, в том числе при грязном индексе.
- **Вывод checkout:**
  - `Already on 'master'` с `M\tg` перед заголовком;
  - `checkout -b` на грязном дереве без строк `M`;
  - строки отчёта `A` (новый застейдженный файл), `D` (`git rm`), `M` (индекс совпадает с целью, рабочее дерево нет);
  - неотслеживаемый файл в отчёт не попадает;
  - `Updated 1 path` / `0 paths` / `2 paths from the index`.
- **Блокировки:**
  - неотслеживаемый файл с тем же содержимым, что у цели, всё равно блокирует;
  - застейдженное удаление при отличающейся цели блокирует;
  - слияние при грязном индексе → `  q r` одной строкой + `Merge with strategy ort failed.`;
  - формат ошибок при перемотке (с `Updating`) и при слиянии (с хвостом `Merge with strategy ort failed.`), для изменённых и для неотслеживаемых файлов.
- **Построчное слияние:** 6 случаев через `git merge`: вставка рядом с заменой, удаление рядом с заменой, частично пересекающиеся замены, вставки в разных концах, разные вставки в одной точке. `mergeFileContent` везде даёт тот же исход, конфликт или чистое слияние. Одинаковая правка с обеих сторон проходит без `Auto-merging`.
- **Коммит и статус:** вывод `git commit` при неотслеживаемых и при незастейдженных изменениях, `git add` без аргументов (exit 0).

## Качество кода (коротко)
- `branchCommands.ts:124-132`: переменная `action` вычисляется дважды одинаково.
- Комментарии в основном состоят из истории ревью («Находка N ревью …»). `checkSafety` описан тридцатью строками, а правило формулируется в двух. Суть трудно найти.
- `branchRepo.ts:389`: «см. checkSafety выше», а функция объявлена ниже.
- `branchCommands.ts:151`: ветка `delete nextWorking[f]` недостижима, потому что targets берутся только из индекса.

Файлы:
- app/src/trainers/git/engine/branchRepo.ts
- app/src/trainers/git/engine/branchCommands.ts
