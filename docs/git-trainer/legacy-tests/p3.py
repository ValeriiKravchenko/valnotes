import sys, json
from playwright.sync_api import sync_playwright
U = {"до (_4)": "file:///mnt/user-data/outputs/git-trenazher_15.html", "после (_5)": "file:///mnt/user-data/outputs/git-trenazher_15.html"}
res = []
def check(name, cond, extra=""):
    res.append(bool(cond)); print(("  PASS " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra else ""))
def fresh(br, url, **kw):
    ctx = br.new_context(viewport=kw.pop("viewport", {"width": 1280, "height": 900}), **kw)
    pg = ctx.new_page(); pg.route("**/fonts.g*/**", lambda r: r.abort())
    pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(url, wait_until="domcontentloaded"); pg.wait_for_selector(".nav-item"); return pg
def nav(pg, i): pg.locator(".nav-item").nth(i).click(); pg.wait_for_timeout(80)
def cmd(pg, tid, text):
    inp = pg.locator(f"#term-in-{tid}"); inp.fill(text); inp.press("Enter"); pg.wait_for_timeout(60)
def last(pg, tid):
    """вывод и пояснение последней команды"""
    o = pg.evaluate(f"(()=>{{const h=(STATE.chapters.{tid.split('-')[0]}.hist||STATE.chapters.{tid.split('-')[0]}.histLocal); const e=h[h.length-1]; return e}})()") if False else None
def H(pg, ch, local=False):
    return pg.evaluate(f"(()=>{{const c=STATE.chapters.{ch}; const h=c.{'histLocal' if local else 'hist'}.filter(x=>x.type==='cmd'); return h[h.length-1]}})()")
def branches(pg, ch, local=False):
    return pg.evaluate(f"Object.keys(STATE.chapters.{ch}.{'local' if local else 'repo'}.branches)")
def edit(pg, i=0): pg.locator("[data-fileop=edit]").nth(i).click(); pg.wait_for_timeout(60)

with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    # ---------- ДО: показать проблему
    print("=== ДО (_4): воспроизведение ===")
    pg = fresh(br, U["до (_4)"]); nav(pg, 1)
    cmd(pg, "ch2", "git branch dark"); cmd(pg, "ch2", "git branch -d dark")
    print("  ветки после `git branch -d dark`:", branches(pg, "ch2"))
    pg = fresh(br, U["до (_4)"]); nav(pg, 4); cmd(pg, "ch5-local", "git clone origin local"); cmd(pg, "ch5-local", "git push -u origin master")
    print("  `git push -u origin master`: ошибка страницы =", pg.errs[-1:], "| вывод =", repr(H(pg, "ch5", True)))

    print("\n=== ПОСЛЕ (_5) ===")
    pg = fresh(br, U["после (_5)"]); errs_all = [pg.errs]
    nav(pg, 1)
    # --- branch
    cmd(pg, "ch2", "git branch dark"); cmd(pg, "ch2", "git branch light")
    cmd(pg, "ch2", "git branch -d dark")
    h = H(pg, "ch2")
    check("branch -d: ветка удалена, сообщение как у git", "dark" not in branches(pg, "ch2") and h["out"].startswith("Deleted branch dark (was "), h["out"])
    check("branch -d: нет ветки с именем «-d»", "-d" not in branches(pg, "ch2"))
    check("branch -d: пояснение не говорит «появился новый указатель»", h.get("explain") and "Удалён только указатель" in h["explain"])
    cmd(pg, "ch2", "git branch -d nosuch"); h = H(pg, "ch2")
    check("branch -d несуществующей → error: branch not found", (not h["ok"]) and "not found" in h["out"], h["out"])
    cmd(pg, "ch2", "git branch -d master"); h = H(pg, "ch2")
    check("branch -d текущей → нельзя", (not h["ok"]) and "Cannot delete branch 'master'" in h["out"] and "master" in branches(pg, "ch2"))
    cmd(pg, "ch2", "git branch -d"); h = H(pg, "ch2")
    check("branch -d без имени → branch name required", (not h["ok"]) and "branch name required" in h["out"])
    # неслитая ветка
    cmd(pg, "ch2", "git checkout light"); edit(pg); cmd(pg, "ch2", "git add style.css"); cmd(pg, "ch2", 'git commit -m "light"'); cmd(pg, "ch2", "git checkout master")
    cmd(pg, "ch2", "git branch -d light"); h = H(pg, "ch2")
    check("branch -d неслитой → not fully merged, ветка на месте", (not h["ok"]) and "not fully merged" in h["out"] and "light" in branches(pg, "ch2"), h["out"])
    check("…пояснение про -D", h.get("explain") and "-D" in h["explain"])
    cmd(pg, "ch2", "git branch -D light"); h = H(pg, "ch2")
    check("branch -D неслитой → удалена", h["ok"] and "light" not in branches(pg, "ch2"), h["out"])
    cmd(pg, "ch2", "git branch a"); cmd(pg, "ch2", "git branch b"); cmd(pg, "ch2", "git branch -d a b")
    check("branch -d a b: удаляет обе", not {"a","b"} & set(branches(pg, "ch2")))
    cmd(pg, "ch2", "git branch -x"); h = H(pg, "ch2")
    check("branch -x → unknown switch, ветка «-x» не создана", (not h["ok"]) and "unknown switch `x'" in h["out"] and "-x" not in branches(pg, "ch2"), h["out"].splitlines()[0])
    cmd(pg, "ch2", "git branch --foo"); h = H(pg, "ch2")
    check("branch --foo → unknown option", "unknown option `foo'" in h["out"] and "--foo" not in branches(pg, "ch2"))
    cmd(pg, "ch2", "git branch"); h = H(pg, "ch2")
    check("git branch без аргументов по-прежнему список со звёздочкой", h["ok"] and "* master" in h["out"], h["out"].replace("\n", "|"))
    # стартовая точка
    cmd(pg, "ch2", "git branch old HEAD"); check("branch <имя> <откуда> создаёт ветку", "old" in branches(pg, "ch2"))
    cmd(pg, "ch2", "git branch bad nosuchref"); h = H(pg, "ch2")
    check("branch с несуществующей точкой → fatal, ветка не создана", (not h["ok"]) and "not a valid object name" in h["out"] and "bad" not in branches(pg, "ch2"))
    # checkout
    cmd(pg, "ch2", "git checkout -b"); h = H(pg, "ch2")
    check("checkout -b без имени → usage, ничего не создано/не сломано", (not h["ok"]) and "requires a value" in h["out"] and "undefined" not in " ".join(branches(pg, "ch2")))
    cmd(pg, "ch2", "git checkout -b feat master"); h = H(pg, "ch2")
    check("checkout -b feat master работает + пояснение", h["ok"] and "feat" in branches(pg, "ch2") and pg.evaluate("STATE.chapters.ch2.repo.HEAD.name") == "feat" and "Две команды" in (h.get("explain") or ""))
    cmd(pg, "ch2", "git checkout master")
    cmd(pg, "ch2", "git checkout -f feat"); h = H(pg, "ch2")
    check("checkout -f → unsupported, без побочных эффектов", (not h["ok"]) and "unknown switch `f'" in h["out"] and pg.evaluate("STATE.chapters.ch2.repo.HEAD.name") == "master")
    cmd(pg, "ch2", "git checkout --"); h = H(pg, "ch2")
    check("checkout -- без файла → usage (не «unknown option»)", "usage: git checkout --" in h["out"], h["out"])
    # merge/tag/etc
    cmd(pg, "ch2", "git merge"); h = H(pg, "ch2")
    check("merge без ветки → fatal, а не «Already up to date»", (not h["ok"]) and "No commit specified" in h["out"], h["out"].splitlines()[0])
    cmd(pg, "ch2", "git merge --no-ff feat"); h = H(pg, "ch2")
    check("merge --no-ff → unsupported (не пытается влить ветку «--no-ff»)", (not h["ok"]) and "unknown option `no-ff'" in h["out"])
    cmd(pg, "ch2", "git tag -a v1 -m x"); h = H(pg, "ch2")
    check("tag -a → unsupported, тег «-a» не создан", (not h["ok"]) and "-a" not in pg.evaluate("Object.keys(STATE.chapters.ch2.repo.tags)"))
    cmd(pg, "ch2", "git cherry-pick"); check("cherry-pick без аргумента → usage", "usage: git cherry-pick" in H(pg, "ch2")["out"])
    cmd(pg, "ch2", "git rebase -i master"); check("rebase -i → unsupported", "unknown switch `i'" in H(pg, "ch2")["out"])
    cmd(pg, "ch2", "git rm --cached style.css"); check("rm --cached → unsupported", "unknown option `cached'" in H(pg, "ch2")["out"])
    # stash -m
    pg.locator("[data-fileop=edit]").first.click(); pg.wait_for_timeout(60)
    cmd(pg, "ch2", 'git stash push -m "моя заметка"'); cmd(pg, "ch2", "git stash list")
    check('stash push -m "текст" → название тайника = текст', "моя заметка" in H(pg, "ch2")["out"] and "-m" not in H(pg, "ch2")["out"], H(pg, "ch2")["out"])
    errs_all.append(pg.errs)

    # --- ch5
    pg5 = fresh(br, U["после (_5)"]); nav(pg5, 4)
    L = "ch5-local"
    cmd(pg5, L, "git clone origin local")
    cmd(pg5, L, "git branch -r"); h = H(pg5, "ch5", True)
    check("ch5 branch -r → origin/master", h["ok"] and h["out"].strip() == "origin/master", h["out"])
    cmd(pg5, L, "git branch -a"); h = H(pg5, "ch5", True)
    check("ch5 branch -a → локальные + remotes/origin/master", "* master" in h["out"] and "remotes/origin/master" in h["out"], h["out"].replace("\n", "|"))
    cmd(pg5, L, "git branch -d master"); check("ch5 удалить текущую master нельзя", not H(pg5, "ch5", True)["ok"])
    edit(pg5); cmd(pg5, L, "git add README.md"); cmd(pg5, L, 'git commit -m "r1"')
    cmd(pg5, L, "git push -u origin master"); h = H(pg5, "ch5", True)
    check("push -u origin master работает (раньше падало)", h["ok"] and "master -> master" in h["out"] and "branch 'master' set up to track 'origin/master'." in h["out"], h["out"].replace("\n", "|"))
    check("push -u: origin получил коммит", pg5.evaluate("STATE.chapters.ch5.origin.branches.master === STATE.chapters.ch5.local.branches.master"))
    check("push -u: пояснение про -u", "-u" in (h.get("explain") or "") and "запоминает" in h["explain"], h.get("explain"))
    check("push -u: поле ввода очищено, история пополнилась", pg5.locator(f"#term-in-{L}").input_value() == "")
    cmd(pg5, L, "git push -x"); h = H(pg5, "ch5", True)
    check("push -x → unknown switch, без падения", (not h["ok"]) and "unknown switch `x'" in h["out"])
    cmd(pg5, L, "git push master"); h = H(pg5, "ch5", True)
    check("push master (без origin) → fatal + подсказка", (not h["ok"]) and "'master' does not appear to be a git repository" in h["out"] and "explain" in h and "origin" in h["explain"], h["out"].splitlines()[0])
    cmd(pg5, L, "git push origin nosuch"); h = H(pg5, "ch5", True)
    check("push origin nosuch → src refspec (раньше TypeError)", (not h["ok"]) and "src refspec nosuch does not match any" in h["out"])
    cmd(pg5, L, "git push origin HEAD"); check("push origin HEAD работает", H(pg5, "ch5", True)["ok"])
    cmd(pg5, L, "git push origin master extra"); check("push с лишним аргументом → понятная ошибка", not H(pg5, "ch5", True)["ok"] and "только git push" in H(pg5, "ch5", True)["out"])
    # --force
    pg5b = fresh(br, U["после (_5)"]); nav(pg5b, 4); errs_all.append(pg5b.errs)
    cmd(pg5b, L, "git clone origin local"); edit(pg5b); cmd(pg5b, L, "git add README.md"); cmd(pg5b, L, 'git commit -m "мой"')
    pg5b.locator("#teammate-btn-ch5").click(); pg5b.wait_for_timeout(80)
    cmd(pg5b, L, "git push"); h = H(pg5b, "ch5", True)
    check("без --force push отклонён (non-fast-forward)", (not h["ok"]) and "rejected" in h["out"])
    origin_before = pg5b.evaluate("STATE.chapters.ch5.origin.branches.master")
    cmd(pg5b, L, "git push --force"); h = H(pg5b, "ch5", True)
    check("push --force проходит (раньше падало)", h["ok"] and "(forced update)" in h["out"], h["out"].replace("\n", "|"))
    check("--force: история сервера перезаписана", pg5b.evaluate("STATE.chapters.ch5.origin.branches.master === STATE.chapters.ch5.local.branches.master") and origin_before != pg5b.evaluate("STATE.chapters.ch5.origin.branches.master"))
    check("--force: пояснение с предупреждением", "переписывает" in (h.get("explain") or ""), h.get("explain", "")[:60])
    # ---- защита терминала
    pg6 = fresh(br, U["после (_5)"]); nav(pg6, 1)
    pg6.evaluate("(()=>{ GitRepo.prototype.status = function(){ throw new Error('boom'); }; return 1; })()")
    cmd(pg6, "ch2", "git status"); h = H(pg6, "ch2")
    check("исключение внутри команды → сообщение в терминале, ввод не теряется", (not h["ok"]) and "не смог выполнить" in h["out"] and pg6.locator("#term-in-ch2").input_value() == "", h["out"][:60])
    check("…и фокус остался в терминале", pg6.evaluate("document.activeElement && document.activeElement.id") == "term-in-ch2")
    # ---- ничего не сломано: миссии пройденным путём
    for ci, chid, script in [
        (1, "ch2", ["git branch dark-theme", "git checkout dark-theme", ("edit", 0), "git add style.css", 'git commit -m "тема"', "git checkout master", "git merge dark-theme"]),
    ]:
        pgm = fresh(br, U["после (_5)"]); nav(pgm, ci); errs_all.append(pgm.errs)
        for st in script:
            if isinstance(st, tuple): edit(pgm, st[1])
            else: cmd(pgm, chid, st)
        flags = pgm.eval_on_selector_all(".mission", "els => els.map(e => e.classList.contains('done'))")
        check("ch2: все миссии пройденным путём выполняются", all(flags), str(flags))
    allerr = [e for l in errs_all for e in l]
    check("нет ошибок страницы за весь прогон", not allerr, str(allerr[:2]))
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
