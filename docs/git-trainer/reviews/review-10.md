# Ревью 10: повторная проверка раздела 2 после исправлений по ревью 9

- Дата: 25.09.2026
- Версия git: `git version 2.53.0`
- Что проверялось: коммит `871467c` (fix(git-trainer): review 9 findings), рабочее дерево чистое
- Как прогонялось:
  - Движок собран через `app/node_modules/.bin/esbuild` из `app/src/trainers/git/engine/index.ts` в `/tmp/tmp.8xntkIbR1A/engine.mjs`.
  - Для сравнения раздела 1 так же собран движок предыдущего коммита `7d5d293` (`engine-old.mjs`, исходники выгружены через `git archive HEAD~1`).
  - Обвязка `play.mjs` выполняет одну и ту же последовательность в движке и в настоящем репозитории `/tmp/repo-*` и сравнивает вывод и код возврата. Стартовый файл `style.css` = `body { color: black; }\nh1 { color: navy; }\n`, ветка `master`, коммит `Initial commit`.
  - Файлы правятся только публичными функциями движка `editBranchingFile` / `createBranchingFile` / `deleteBranchingFile`. На диске у git делается то же самое побайтно: дописывается ` + правка`, создаётся файл с текстом `новый файл` или файл удаляется.
  - Перед каждым `git commit` и `git merge` у git пауза 1,1 с, время реальное, как у живого игрока. Исключение — прогоны с `FAST=1`, где совпадение хешей неважно.
  - Строки диффстата (` 1 file changed, …`) движок не печатает намеренно (`branchCommands.ts`, шапка). Такие `[DIFF]` находкой не считаются.
  - В репозитории ничего не создавалось и не менялось. Использовались только `git show`, `git log`, `git status` и `git archive` в stdout.

---

## 1. Находки ревью 9: что закрыто

| № | Находка ревью 9 | Статус |
|---|---|---|
| 1 | Одинаковые коммиты в разных ветках склеиваются | **закрыта** |
| 2 | В разделе 2 нельзя править, создавать и удалять файлы | **закрыта** (но см. новую находку Н1) |
| 3 | Подсказка к миссии 5 не говорит про разные строки | **закрыта частично**: текст исправлен, но совет «разные строки» кнопкой правки выполнить нельзя, см. Н1 |
| 4 | В отказах нет `git status` | **закрыта** |
| 5 | Миссия 6 засчитывается одним отказом | **закрыта** |
| 6.1 | `git merge feature --no-ff`: опция названа веткой | **закрыта для merge**; тот же класс ошибки остался в `git branch -d -f`, см. Н5 |
| 6.2 | В `git status` нет последней пустой строки | **закрыта** |
| 6.3 | Миссия 3 засчитывается при коммите в старой ветке | **закрыта** для обычных имён веток; с числовыми именами ложное срабатывание осталось, см. Н2 |
| 6.4 | Выдуманный путь `/site` без пометки | **закрыта** (пояснение `explanation`) |

### 1. Одинаковые коммиты в разных ветках — закрыта

```
git checkout -b a ; EDIT style.css ; git commit -am "Red h1"
git checkout master ; git checkout -b b ; EDIT style.css ; git commit -am "Red h1"
```
Движок: `[a 95dc716] Red h1`, `[b 94dc6fc] Red h1`, то есть id разные.
git: `[a 1989b8b] Red h1`, `[b 5373de5] Red h1`.

Продолжение А, `git merge a` на `b`: движок `Merge made by the 'ort' strategy.` (ok=true), git то же (rc=0), `[SAME]`. Засчиталась миссия `divergedMerge`. `git log --graph` у git показывает коммит слияния с двумя родителями, как и граф движка.

Продолжение Б, `git branch -d a` на `b`: движок ok=false, git rc=1, вывод одинаковый:
```
error: the branch 'a' is not fully merged
hint: If you are sure you want to delete it, run 'git branch -D a'
hint: Disable this message with "git config set advice.forceDeleteBranch false"
```
Основание модели проверено по самому объекту коммита git: в нём есть строки `author P <p@e> 1790326800 +0300` и `committer …`, то есть время входит в хешируемые данные. Логические часы `clock` в `commitHashCore` (`util.ts`) этому правдиво соответствуют.

### 2. Файловые операции — закрыта

Все шесть миссий проходятся только командами и `editBranchingFile` / `createBranchingFile`, без записи в состояние (см. раздел 2 отчёта). Тесты миссий (`branchMissions.test.ts:91, 125, 135, 152, 160, 163, 179, 182`) теперь тоже правят файлы через `editFile` / `createFile`. `branchCommands.test.ts` по-прежнему пишет в `s.working` напрямую, но это модульные тесты команд, для них это допустимо.

### 3. Подсказка к миссии 5 — закрыта частично

Текст (`ru.ts`, `divergedMerge.hint`) теперь говорит: «в разных строках или разных файлах (иначе выйдет конфликт…)». Про разные файлы — выполнимо (прогон `s5c`, см. раздел 2). Про разные строки — нет: единственная правка в разделе 2 дописывает суффикс в конец файла, выбрать строку невозможно. Подробно в Н1.

### 4. `git status` в списках команд — закрыта

```
$ git rebase master
[тренажёр] команда «git rebase» настоящая, но в этом шаге тренажёра не реализована — здесь работают git branch, git checkout, git merge, git add, git commit и git status.
$ git
[тренажёр] git без подкоманды … Здесь работают: git branch, git checkout, git merge, git add, git commit, git status.
```
git: `Current branch master is up to date.` (rc=0) и полный usage (rc=1). Отказы тренажёра помечены `[тренажёр]`.

### 5. Миссия 6 одним отказом — закрыта

```
git checkout -b feature ; EDIT style.css ; git commit -am "Red h1" ; git checkout master
git branch -d feature
```
Вывод движка и git совпадает (`[SAME]`, is not fully merged). Итог миссий: `createAndSwitch,commitAndReturn`, то есть `deleteBranches` **не** засчитана. В полном прохождении (раздел 2) она засчитывается только после успешного `git branch -d feature` (слитая ветка) и последующего отказа на `wip`.

### 6.1 `git merge feature --no-ff` — закрыта для merge

Движок:
```
[тренажёр] git merge --no-ff — настоящая возможность git, но этот шаг тренажёра её не разбирает. Здесь поддерживается: git merge <ветка>.
```
git (rc=0): `Merge made by the 'ort' strategy.`, дальше диффстат.

Сокращения тоже разбираются: `--no-f` превращается в `--no-ff`; `--n` отвечает «неоднозначное сокращение», git в этом случае пишет `error: ambiguous option: n (could be --no-signoff or --no-verify)`. `--bogus` даёт `error: unknown option `bogus'`: первая строка совпадает с git, usage не печатается, так было и раньше.

### 6.2 Последняя пустая строка в `git status` — закрыта

Проверены «только staged», «staged + untracked», «staged + not staged». Во всех трёх `[SAME]`, пустая строка в конце есть.

### 6.3 Миссия 3 при коммите в старой ветке — закрыта (с оговоркой)

```
git checkout -b feature ; git checkout master ; EDIT style.css
git commit -am "Red h1 on master" ; git checkout feature
```
Итог: только `createAndSwitch`, `commitAndReturn` **не** засчитана. Оговорка: с числовым именем ветки засчитывается, см. Н2.

### 6.4 Путь `/site` — закрыта

Движок (ok=false):
```
error: cannot delete branch 'master' used by worktree at '/site'
explanation: Путь «/site» в этой строке — не настоящий: у песочницы нет файловой системы…
```
git (rc=1): `error: cannot delete branch 'master' used by worktree at '/tmp/repo-IEytVY'`.

Пояснение отделено от вывода и говорит, что путь — плейсхолдер. Этого достаточно.

### Трёхстороннее слияние

`mergeFileContent` в `871467c` не менялся: `git show HEAD -- branchRepo.ts` затрагивает только хеш и `formatBranchingStatus`. Повторный fuzz не делался. В прогонах `s1`, `s5b` и `s5c` исход слияния совпал с git.

---

## 2. Шесть миссий раздела 2 глазами игрока

Основной путь (`full.txt`) пройден целиком, все шесть миссий засчитаны:

| Шаг | Команда / действие | Сравнение | Засчитано |
|---|---|---|---|
| 1 | `git branch` | SAME `* master` | viewBranches |
| 2 | `git checkout -b feature` | SAME | createAndSwitch |
| 3 | EDIT style.css; `git status`; `git commit -am "Feature edit"`; `git checkout master` | status SAME, commit отличается только id и диффстатом | commitAndReturn |
| 4 | `git merge feature` | `Updating …`/`Fast-forward`, отличаются id и диффстат | fastForwardMerge |
| 5 | `git branch -d feature` → `git checkout -b left`, CREATE left.css, add, commit → `git checkout master`, EDIT, commit → `git merge left` | `Merge made by the 'ort' strategy.` | divergedMerge |
| 6 | `git checkout -b wip`, EDIT, commit, `git checkout master`, `git branch -d wip` | SAME, отказ is not fully merged | deleteBranches |

Итоговый граф git: `WIP → Merge branch 'left' (Master edit | Add left) → Feature edit → Initial commit`. Он совпадает со структурой графа движка.

Что ещё проверено этими же прогонами (`carry.txt`, `del.txt`, `st.txt`):
- перенос незакоммиченных правок при checkout (`A\ta.txt` / `Switched to branch 'feature'`): SAME;
- отказ checkout при затирании (`Your local changes … would be overwritten by checkout`): SAME;
- отказ merge при затирании: SAME, кроме id в строке `Updating`;
- неотслеживаемый файл переезжает между ветками: SAME;
- удаление файла, потом `git add`, commit, возврат в ветку, где файл есть: SAME.

---

## 3. Раздел 1 после переноса хеша в `commitHashCore`

Сценарий: `git init`, `git add index.html`, `git commit -m "First"`, ещё раз `git commit -m "First"`, EDIT, `git commit -am "Second"`, ещё раз `git commit -am "Second"`, «начать раздел заново» (`resetSection`; у git каталог пересоздаётся), затем то же самое снова.

| Команда | Движок | git 2.53.0 |
|---|---|---|
| `git commit -m "First"` | `[master (root-commit) d67485e] First` | `[master (root-commit) 6849675] First` + диффстат |
| повторный `git commit -m "First"` | `On branch master` / `nothing to commit, working tree clean`, ok=false | то же, rc=1, **SAME** |
| `git commit -am "Second"` | `[master 3590068] Second` | `[master 54483eb] Second` |
| повторный | `nothing to commit, working tree clean`, ok=false | то же, rc=1, **SAME** |
| после сброса: `First` | `d67485e` (как до сброса) | `c61b165` (не так, как до сброса) |
| после сброса: `Second` | `3590068` (как до сброса) | `63f96a7` |

Дополнительно старый (`7d5d293`) и новый движки прогнаны на трёх последовательностях раздела 1. Из команд в них были `git init`, `add` (в том числе `.` и `-A`), `commit` с `-m -m`, `-am` и pathspec, `--amend`, `log`, `log --oneline`, `show`, `reset`, `status`, `cat-file` и `ls .git`, а также файловые операции и сброс. Результаты сравнивались целиком (`output`, `ok`, пояснения), с заменой семизначных id на `H`, плюс миссии и стадия. **Расхождений 0.** Вывод: раздел 1 изменился только в значениях id, поведение то же, отклонений от git не добавилось. То, что после сброса id повторяются, — осознанное решение A5, см. Н6.

`clock` не теряется: состояние раздела 1 нигде не сохраняется (`GitTrainer.tsx` держит его в `useState`, localStorage нет), поэтому старое состояние без `clock`, которое дало бы `NaN`, появиться не может.

---

## Новые находки

### Н1. Игрок застрянет (частично): совет «правь разные строки» кнопкой правки не выполнить

**Где:** `branchFileOps.ts`, `editFile` (всегда `state.working[file] + ru.fileOps.editedSuffix`); `ru.ts`, `branching.missions.divergedMerge.hint`.

Правка в разделе 2 всегда дописывает ` + правка` в конец файла, поэтому правки в двух ветках всегда задевают одно и то же место. Подсказка при этом предлагает «разные строки». Исход определяется тем, сколько раз игрок нажал «изменить», а не его пониманием:

`s5b` (по одной правке в каждой ветке): изменения одинаковые, слияние чистое. Движок и git: `Merge made by the 'ort' strategy.` (SAME), миссия засчитана. Это правда о git, но получена случайно.

`s5a` (1 правка в feature, 2 в master):
```
$ git merge feature
движок (ok=false): [тренажёр] настоящий git начал бы слияние веток «feature» и текущей с конфликтом: в файле «style.css» правки задели одни и те же строки. …
git (rc=1):
Auto-merging style.css
CONFLICT (content): Merge conflict in style.css
Automatic merge failed; fix conflicts and then commit the result.
```
Так же и со стартовым файлом без завершающего перевода строки. Выход есть — вариант «разные файлы» через `createBranchingFile` (`s5c`, миссия засчитана). Но он работает, только если интегратор выведет кнопку создания файла в разделе 2, а половина подсказки остаётся невыполнимой.

**Чем грозит:** игрок следует подсказке, не может выбрать строку и не понимает, почему в одном прогоне конфликт, а в другом нет.

### Н2. Мешает работе: при числовом имени ветки миссии 2 и 3 засчитываются неверно

**Где:** `branchMissions.ts`, `createAndSwitch` и `commitAndReturn`: `Object.keys(state.branches)` считается порядком создания. В JS ключи-целые числа (`"42"`) всегда идут первыми по возрастанию, независимо от порядка добавления. Комментарий у `createAndSwitch` об этом знает («для нечисловых имён»). Новый критерий миссии 3 перенёс это ограничение без оговорки, и в `target.md` оно не названо.

git такие имена принимает: `git checkout -b 42` даёт `Switched to a new branch '42'`, SAME.

`m3num`, честное прохождение:
```
git checkout -b 42       → createAndSwitch НЕ засчитана (HEAD=42 = names[0])
EDIT ; git commit -am "Numbered" ; git checkout master
                         → засчитана createAndSwitch (хотя игрок вернулся на стартовую), commitAndReturn НЕ засчитана
```
`m3numrev`, обратный порядок, который по `target.md` не должен засчитываться:
```
git checkout -b 42 ; git checkout master ; EDIT ; git commit -am "On master" ; git checkout 42
>>> missions: createAndSwitch,commitAndReturn
```
**Чем грозит:** игрок, назвавший ветку номером задачи (`123`), честно проходит миссии 2 и 3 и не получает зачёта, а за неправильный порядок получает.

### Н3. Учит неправде (слабо): при удалённом файле `git status` печатает `git add` вместо `git add/rm`

**Где:** `branchRepo.ts:651`, блок `Changes not staged for commit`. Раньше удаление в разделе 2 было недоступно игроку. Теперь оно доступно через `deleteBranchingFile`.

```
DELETE style.css
$ git status
движок:
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	deleted:    style.css
git (rc=0):
Changes not staged for commit:
  (use "git add/rm <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	deleted:    style.css
```
Так же при смешанном списке (`modified` + `deleted`, прогон `st.txt`). Раздел 2, в отличие от раздела 1 (`repo.ts:140-152`, где заявлено «подсказки неполные»), печатает блок полностью, как у git. Поэтому неверная строка выглядит как дословный вывод git. Правило видно в самом git: при удалении подсказка меняется на `add/rm`.

### Н4. Мелочь: `target.md`, A5, называет автора частью хеша, в коде автора нет

**Где:** `docs/git-trainer/target.md`, A5 («от сообщения, состава файлов, родителей, автора и момента коммита»); `util.ts`, `commitHashCore` (`parents\nmessage\nfiles\nclock`). Пока автор один, результат тот же, и A5 это упрощение называет. Но при следующей правке, где понадобится второй автор, эталон и код разойдутся молча. Стоит привести формулировку к одному виду.

### Н5. Мелочь: `git branch -d -f <ветка>` — опция названа веткой (тот же класс, что 6.1)

**Где:** `branchCommands.ts` около строки 271. Так было и в `7d5d293`, новым коммитом не внесено.
```
$ git branch -d -f feature   (feature не слита)
движок (ok=false): [тренажёр] git branch -d/-D <несколько веток за раз> — настоящая возможность git, но этот шаг тренажёра её не разбирает. Здесь поддерживается: git branch -d/-D <одна ветка>.
git (rc=0): Deleted branch feature (was fcc6183).
```
Похожий случай — `git merge feature --`. Движок отвечает «несколько веток за раз», git — `Already up to date.` (rc=0), то есть `--` воспринят не как ветка. `git branch -df` отвергается честно, с названием опции.

### Н6. Замечание к эталону A5: после «начать заново» те же действия дают те же id

Раздел 1: `d67485e` и `3590068` до и после сброса. У git при тех же действиях получилось `6849675` → `c61b165` и `54483eb` → `63f96a7`. Раздел 2 ведёт себя так же: `[a 95dc716] Red h1` в каждом прогоне. Это осознанный компромисс A5 ради детерминированных тестов. Ловушку «хеш — порядковый номер» он не воспроизводит: при другом содержимом на том же шаге id другой. Но у внимательного игрока может сложиться мысль «хеш зависит только от содержимого и порядка», а время в нём не учтено. Не дефект. Если владелец захочет, это можно явно назвать в A5 или в пояснении.

---

## Итог

- Из находок ревью 9 закрыты 1, 2, 4, 5, 6.2 и 6.4. Частично закрыты 3 (подсказка — Н1), 6.1 (для `branch -d` — Н5) и 6.3 (числовые имена — Н2).
- Все шесть миссий раздела 2 проходятся через публичные файловые операции движка. Вывод команд совпадает с git 2.53.0, кроме намеренно опущенного диффстата, id и найденного в Н3.
- Раздел 1 после переноса хеша в `commitHashCore` ведёт себя так же, как до него: 0 расхождений без учёта id. Повторный commit и сброс совпадают с git по выводу.
- Новые находки: Н1 — игрок застрянет (частично), Н2 — мешает работе, Н3 — учит неправде (слабо), Н4 и Н5 — мелочи, Н6 — замечание к эталону.

Не проверялось: интерфейс раздела 2. В `GitTrainer.tsx` он ещё не подключён, поэтому видимость кнопок правки и создания файла для игрока оценить нельзя. Повторный fuzz слияния не делался: код не менялся.

Временные файлы: `/tmp/tmp.8xntkIbR1A` (движки, `play.mjs`, `s1play.mjs`, `cmp1.mjs`, сценарии), репозитории git `/tmp/repo-*` и `/tmp/s1-*`.

---

Строка для `docs/git-trainer/reviews/README.md`:

`| 10 | 25.09.2026 | Повторное ревью раздела 2 после 871467c: находки ревью 9 закрыты (3, 6.1, 6.3 — частично), все шесть миссий проходятся через файловые операции, раздел 1 без изменений поведения; новые: кнопка правки не даёт «разные строки» (миссия 5), числовые имена веток ломают миссии 2–3, в status нет «git add/rm» при удалении |`
