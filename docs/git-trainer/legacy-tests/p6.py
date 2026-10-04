exec(open("p3.py").read().split("with sync_playwright")[0])
U7="file:///mnt/user-data/outputs/git-trenazher_7.html"; U8="file:///mnt/user-data/outputs/git-trenazher_15.html"
def c2(pg, t): cmd(pg, "ch2", t)
def H2(pg): return H(pg, "ch2")
def R(pg, ch="ch2", local=False): return f"STATE.chapters.{ch}.{'local' if local else 'repo'}"
def work(pg, f): return pg.evaluate(f"{R(pg)}.working[{json.dumps(f)}]")
def setf(pg, f, txt): pg.evaluate(f"{R(pg)}.working[{json.dumps(f)}]={json.dumps(txt)}")
def has_conflict(pg): return pg.evaluate(f"!!{R(pg)}.conflict")
def status(pg): return pg.evaluate(f"(()=>{{const s={R(pg)}.status(); return JSON.stringify([s.staged.map(x=>x.file),s.notStaged.map(x=>x.file),s.untracked])}})()")
def prep(pg):
    """master: style.css + notes.txt закоммичены; ветка dark-theme меняет только style.css"""
    setf(pg, "notes.txt", "заметки v1"); c2(pg, "git add notes.txt"); c2(pg, 'git commit -m "notes"')
    c2(pg, "git checkout -b dark-theme"); setf(pg, "style.css", "dark css"); c2(pg, "git add style.css"); c2(pg, 'git commit -m "dark"'); c2(pg, "git checkout master")
def new(br, url):
    pg = fresh(br, url); nav(pg, 1); return pg

with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    errs = []
    for label, url in (("ДО (_7)", U7), ("ПОСЛЕ (_8)", U8)):
        print(f"\n=== {label}: воспроизведение ===")
        pg = new(br, url); prep(pg)
        setf(pg, "style.css", "МОЯ несохранённая правка"); c2(pg, "git merge dark-theme")
        print("  merge поверх несохранённой правки в том же файле:", repr(H2(pg)["out"].splitlines()[0]), "| файл теперь:", repr(work(pg, "style.css")))
        pg = new(br, url); prep(pg); setf(pg, "todo.txt", "мои заметки, не в git"); c2(pg, "git checkout dark-theme")
        print("  неотслеживаемый файл после checkout:", work(pg, "todo.txt"))
        pg = new(br, url); pg.locator("#demo-ch2").click(); pg.wait_for_timeout(80); c2(pg, "git merge conflict-demo"); c2(pg, "git reset --hard")
        print("  после конфликта и reset --hard: conflict =", has_conflict(pg), "| коробка конфликта на экране:", pg.locator(".conflict-box").count())
        c2(pg, "git merge --abort"); print("  merge --abort:", repr(H2(pg)["out"][:70]))
    print("\n=== ПОСЛЕ (_8): проверки ===")
    U = U8
    # A: правка в затрагиваемом файле
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    setf(pg, "style.css", "МОЯ несохранённая правка"); c2(pg, "git merge dark-theme"); h = H2(pg)
    check("A merge не перетирает несохранённую правку файла", (not h["ok"]) and "would be overwritten by merge" in h["out"] and "\tstyle.css" in h["out"] and work(pg, "style.css") == "МОЯ несохранённая правка", h["out"].splitlines()[0])
    check("A …ветка не сдвинулась, слияния не было", pg.evaluate(f"{R(pg)}.branches.master") != pg.evaluate(f"{R(pg)}.branches['dark-theme']"))
    check("A …пояснение: закоммить или git stash", "stash" in (h.get("explain") or "") and "несохранённые" in h["explain"], h.get("explain", "")[:70])
    # B: правка в незатронутом файле переживает fast-forward
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    setf(pg, "notes.txt", "заметки v2 (не закоммичены)"); c2(pg, "git merge dark-theme"); h = H2(pg)
    check("B merge (fast-forward) с несохранённой правкой в другом файле проходит", h["ok"] and "Fast-forward" in h["out"], h["out"].replace("\n", "|"))
    check("B …правка осталась, а style.css обновлён", work(pg, "notes.txt") == "заметки v2 (не закоммичены)" and work(pg, "style.css") == "dark css")
    check("B …status: notes.txt по-прежнему изменён и не подготовлен", json.loads(status(pg))[1] == ["notes.txt"], status(pg))
    # C: неотслеживаемый файл
    pg = new(br, U); errs.append(pg.errs); prep(pg); setf(pg, "todo.txt", "не в git")
    c2(pg, "git checkout dark-theme"); ok1 = work(pg, "todo.txt") == "не в git"
    c2(pg, "git checkout master"); c2(pg, "git merge dark-theme"); ok2 = work(pg, "todo.txt") == "не в git"
    check("C неотслеживаемый файл переживает checkout и merge", ok1 and ok2)
    # D: неотслеживаемый файл с тем же именем, что придёт из ветки
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    c2(pg, "git checkout dark-theme"); setf(pg, "extra.txt", "из ветки"); c2(pg, "git add extra.txt"); c2(pg, 'git commit -m "extra"'); c2(pg, "git checkout master")
    setf(pg, "extra.txt", "мой неотслеживаемый"); c2(pg, "git merge dark-theme"); h = H2(pg)
    check("D merge отказывает, если перетрёт неотслеживаемый файл", (not h["ok"]) and "untracked working tree files would be overwritten by merge" in h["out"] and work(pg, "extra.txt") == "мой неотслеживаемый", h["out"].splitlines()[0])
    c2(pg, "git checkout dark-theme"); h = H2(pg)
    check("D то же для checkout", (not h["ok"]) and "untracked working tree files would be overwritten by checkout" in h["out"])
    # E: checkout несёт правки в незатронутом файле
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    setf(pg, "notes.txt", "правка не закоммичена"); c2(pg, "git checkout dark-theme"); h = H2(pg)
    check("E checkout с правкой в незатронутом файле переключает и показывает M", h["ok"] and h["out"].startswith("M\tnotes.txt\nSwitched to branch 'dark-theme'"), h["out"].replace("\n", "|"))
    check("E …правка на месте, пояснение про «поехали с тобой»", work(pg, "notes.txt") == "правка не закоммичена" and "поехали" in (h.get("explain") or ""))
    # F/G
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    setf(pg, "style.css", "правка"); c2(pg, "git checkout -b newb dark-theme"); h = H2(pg)
    check("F checkout -b <ветка> <старт> при перетираемой правке: отказ и НЕТ лишней ветки", (not h["ok"]) and "newb" not in branches(pg, "ch2") and pg.evaluate(f"{R(pg)}.HEAD.name") == "master", h["out"].splitlines()[0])
    c2(pg, "git checkout dark-theme"); check("F checkout dark-theme при перетираемой правке отказывает", not H2(pg)["ok"] and "explain" in H2(pg) and "спрячь" in H2(pg)["explain"])
    c2(pg, "git checkout -b feature"); h = H2(pg)
    check("G checkout -b feature с грязным деревом работает (правки едут вместе)", h["ok"] and "Switched to a new branch 'feature'" in h["out"] and h["out"].startswith("M\tstyle.css") and work(pg, "style.css") == "правка", h["out"].replace("\n", "|"))
    # H: abort
    pg = new(br, U); errs.append(pg.errs); pg.locator("#demo-ch2").click(); pg.wait_for_timeout(80)
    head0 = pg.evaluate(f"{R(pg)}.branches.master"); w0 = work(pg, "style.css")
    c2(pg, "git merge conflict-demo"); marks = "<<<<<<<" in work(pg, "style.css")
    c2(pg, "git merge --abort"); h = H2(pg)
    check("H merge --abort: конфликт снят, файл вернулся, метки исчезли", h["ok"] and marks and (not has_conflict(pg)) and work(pg, "style.css") == w0 and pg.locator(".conflict-box").count() == 0, h["out"])
    check("H …HEAD не менялся, status чистый, пояснение", pg.evaluate(f"{R(pg)}.branches.master") == head0 and status(pg) == "[[],[],[]]" and "Слияние отменено" in (h.get("explain") or ""), status(pg))
    c2(pg, "git merge --abort"); h = H2(pg)
    check("H повторный merge --abort → fatal, пояснение «нечего отменять»", (not h["ok"]) and "There is no merge to abort" in h["out"] and "Отменять нечего" in (h.get("explain") or ""))
    c2(pg, "git cherry-pick --abort"); check("H cherry-pick --abort без операции → ошибка", not H2(pg)["ok"] and "no cherry-pick" in H2(pg)["out"])
    c2(pg, "git merge conflict-demo"); check("H после abort слияние можно начать заново", not H2(pg)["ok"] and has_conflict(pg))
    # I: reset --hard в конфликте
    c2(pg, "git reset --hard"); h = H2(pg)
    check("I reset --hard снимает конфликт (коробка исчезла, метки убраны)", h["ok"] and (not has_conflict(pg)) and pg.locator(".conflict-box").count() == 0 and "<<<<<<<" not in work(pg, "style.css") and status(pg) == "[[],[],[]]", status(pg))
    check("I …пояснение про незавершённое слияние", "слияние" in (h.get("explain") or ""), h.get("explain", "")[:60])
    c2(pg, "git merge conflict-demo"); c2(pg, "git reset"); 
    check("I mixed reset в конфликте: конфликт снят, метки остались в файле", (not has_conflict(pg)) and "<<<<<<<" in work(pg, "style.css") and json.loads(status(pg))[1] == ["style.css"], status(pg))
    c2(pg, "git checkout -- style.css"); c2(pg, "git merge conflict-demo"); c2(pg, "git reset --soft HEAD"); h = H2(pg)
    check("I soft reset в конфликте → fatal", (not h["ok"]) and "Cannot do a soft reset in the middle of a merge" in h["out"] and has_conflict(pg))
    # J: во время конфликта
    c2(pg, "git checkout master"); h = H2(pg)
    check("J checkout во время конфликта блокируется, с подсказкой про --abort", (not h["ok"]) and "resolve your current index" in h["out"] and "merge --abort" in h["out"] and has_conflict(pg), h["out"].splitlines()[0])
    c2(pg, "git branch other"); c2(pg, "git merge other"); h = H2(pg)
    check("J повторный merge во время конфликта блокируется", (not h["ok"]) and "unmerged files" in h["out"] and "Отменять" not in (h.get("explain") or "") and "не закончено" in (h.get("explain") or ""), h["out"].splitlines()[0])
    c2(pg, "git stash"); check("J stash во время конфликта блокируется", not H2(pg)["ok"] and "needs merge" in H2(pg)["out"])
    c2(pg, "git merge --abort"); check("J после abort всё снова доступно", H2(pg)["ok"])
    pg.locator("#demo-ch2").click()  # уже создан — просто заметка
    # abort возвращает и несохранённую правку в незатронутом файле
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    c2(pg, "git checkout dark-theme"); setf(pg, "style.css", "тема A"); c2(pg, "git add style.css"); c2(pg, 'git commit -m "A"'); c2(pg, "git checkout master")
    setf(pg, "style.css", "тема B"); c2(pg, "git add style.css"); c2(pg, 'git commit -m "B"')
    setf(pg, "notes.txt", "локальная правка при слиянии"); c2(pg, "git merge dark-theme")
    check("K слияние с конфликтом при несохранённой правке в другом файле стартует", (not H2(pg)["ok"]) and has_conflict(pg) and work(pg, "notes.txt") == "локальная правка при слиянии", H2(pg)["out"].splitlines()[0])
    c2(pg, "git merge --abort")
    check("K merge --abort возвращает и эту правку", (not has_conflict(pg)) and work(pg, "notes.txt") == "локальная правка при слиянии" and work(pg, "style.css") == "тема B" and status(pg) == '[[],["notes.txt"],[]]', status(pg))
    # разрешение конфликта и обычный путь по-прежнему работают
    c2(pg, "git merge dark-theme"); pg.locator("[data-resolve=theirs]").click(); pg.wait_for_timeout(60); c2(pg, 'git commit -m "слил"')
    check("K обычный путь: merge → разрешить → commit работает, правка в notes.txt не попала в коммит", H2(pg)["ok"] and pg.evaluate(f"{R(pg)}.log()[0].tree['notes.txt']") == "заметки v1" and work(pg, "notes.txt") == "локальная правка при слиянии")
    # L: reset --hard и untracked, stash
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    setf(pg, "todo.txt", "не в git"); setf(pg, "notes.txt", "правка"); c2(pg, "git reset --hard")
    check("L reset --hard сбрасывает правки, но не трогает неотслеживаемый файл", work(pg, "notes.txt") == "заметки v1" and work(pg, "todo.txt") == "не в git")
    setf(pg, "notes.txt", "правка 2"); c2(pg, "git stash")
    check("L stash не уносит неотслеживаемый файл", work(pg, "todo.txt") == "не в git" and work(pg, "notes.txt") == "заметки v1")
    c2(pg, "git stash pop"); check("L stash pop возвращает правку, todo.txt на месте", H2(pg)["ok"] and work(pg, "notes.txt") == "правка 2" and work(pg, "todo.txt") == "не в git" and json.loads(status(pg))[1] == ["notes.txt"], status(pg))
    c2(pg, "git stash"); setf(pg, "notes.txt", "другая правка"); c2(pg, "git stash pop"); h = H2(pg)
    check("L stash pop поверх своей правки в том же файле отказывает и оставляет тайник", (not h["ok"]) and "would be overwritten" in h["out"] and "kept" in h["out"] and pg.evaluate(f"{R(pg)}.stashes.length") == 1 and work(pg, "notes.txt") == "другая правка")
    # rebase / cherry-pick
    pg = new(br, U); errs.append(pg.errs); prep(pg)
    c2(pg, "git checkout dark-theme"); setf(pg, "notes.txt", "правка в ветке"); c2(pg, "git rebase master"); h = H2(pg)
    check("M rebase при несохранённых правках отказывает", (not h["ok"]) and "cannot rebase" in h["out"] and work(pg, "notes.txt") == "правка в ветке", h["out"].splitlines()[0])
    c2(pg, "git checkout -- notes.txt"); c2(pg, "git checkout master"); setf(pg, "style.css", "своя"); c2(pg, "git cherry-pick dark-theme"); h = H2(pg)
    check("M cherry-pick поверх правки в том же файле отказывает", (not h["ok"]) and "would be overwritten by cherry-pick" in h["out"] and work(pg, "style.css") == "своя", h["out"].splitlines()[0])
    c2(pg, "git checkout -- style.css"); setf(pg, "notes.txt", "правка"); c2(pg, "git cherry-pick dark-theme"); h = H2(pg)
    check("M cherry-pick при правке в другом файле проходит, правка на месте", h["ok"] and work(pg, "notes.txt") == "правка" and work(pg, "style.css") == "dark css", h["out"])
    # N: pull (ch5)
    pg5 = fresh(br, U); errs.append(pg5.errs); nav(pg5, 4); L = "ch5-local"
    cmd(pg5, L, "git clone origin local"); pg5.locator("#teammate-btn-ch5").click(); pg5.wait_for_timeout(80)
    pg5.evaluate("STATE.chapters.ch5.local.working['README.md'] = 'моя правка, не закоммичена'")
    cmd(pg5, L, "git pull"); h = H(pg5, "ch5", True)
    check("N pull с несохранённой правкой в README.md: слияние проходит, правка на месте", h["ok"] and pg5.evaluate("STATE.chapters.ch5.local.working['README.md']") == "моя правка, не закоммичена" and "CHANGELOG.md" in pg5.evaluate("Object.keys(STATE.chapters.ch5.local.working)"), h["out"].replace("\n", "|"))
    check("N нет ошибок", not pg5.errs)
    # ch8 + прежние миссии
    pg8 = fresh(br, U); errs.append(pg8.errs); nav(pg8, 7); print("  ch8 миссии на старте:", pg8.eval_on_selector_all(".mission", "els=>els.length"))
    check("нет ошибок страницы за весь прогон", not [e for l in errs for e in l], str([e for l in errs for e in l][:2]))
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
