from playwright.sync_api import sync_playwright
NEW = "file:///mnt/user-data/outputs/git-trenazher_15.html"
res = []
def check(name, cond, extra=""):
    res.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))
def fresh(br, **kw):
    ctx = br.new_context(viewport=kw.pop("viewport", {"width": 1280, "height": 900}), **kw)
    pg = ctx.new_page(); pg.route("**/fonts.g*/**", lambda r: r.abort())
    pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(NEW, wait_until="domcontentloaded"); pg.wait_for_selector(".nav-item"); return pg
def nav(pg, i): pg.locator(".nav-item").nth(i).click(); pg.wait_for_timeout(90)
def active(pg): return pg.evaluate("document.activeElement && document.activeElement.id")
def val(pg, tid): return pg.locator(f"#term-in-{tid}").input_value()
def out(pg, tid): return pg.inner_text(f"#term-out-{tid}")

with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    pg = fresh(br)

    # 1. фокус в каждом терминале
    seeds = {0: ("ch1", ["git init", "git status"]), 1: ("ch2", ["git status", "git branch x"]), 2: ("ch3", ["git log --oneline", "git diff"]),
             3: ("ch4", ["git log --oneline", "git status"]), 7: ("appx", ["git status", "git tag v1"])}
    for i, (tid, cmds) in seeds.items():
        nav(pg, i)
        pg.locator(f"#term-in-{tid}").click(); pg.keyboard.type(cmds[0]); pg.keyboard.press("Enter"); pg.wait_for_timeout(70)
        ok1 = active(pg) == f"term-in-{tid}"
        pg.keyboard.type(cmds[1]); pg.keyboard.press("Enter"); pg.wait_for_timeout(70)   # без клика мышью
        ok2 = cmds[1] in out(pg, tid)
        check(f"фокус остаётся в терминале {tid}; вторая команда набрана без клика", ok1 and ok2 and active(pg) == f"term-in-{tid}")
    # ch5: до и после clone
    nav(pg, 4)
    pg.locator("#term-in-ch5-local").click(); pg.keyboard.type("git clone origin local"); pg.keyboard.press("Enter"); pg.wait_for_timeout(80)
    check("ch5: фокус после git clone (терминал пересоздаётся)", active(pg) == "term-in-ch5-local")
    pg.keyboard.type("git status"); pg.keyboard.press("Enter"); pg.wait_for_timeout(70)
    check("ch5: следующая команда без клика", "git status" in out(pg, "ch5-local") and "On branch" in out(pg, "ch5-local"))

    # 2. история ↑/↓
    nav(pg, 2); tid = "ch3"
    for c in ["git log", "git diff", "git status"]:
        pg.locator(f"#term-in-{tid}").fill(c); pg.keyboard.press("Enter"); pg.wait_for_timeout(50)
    # (в истории уже были 2 команды из блока выше: git log --oneline, git diff) — считаем от конца
    pg.keyboard.press("ArrowUp"); a = val(pg, tid)
    pg.keyboard.press("ArrowUp"); b = val(pg, tid)
    pg.keyboard.press("ArrowUp"); c_ = val(pg, tid)
    pg.keyboard.press("ArrowDown"); d = val(pg, tid)
    check("↑↑↑↓ идёт по истории назад и вперёд", (a, b, c_, d) == ("git status", "git diff", "git log", "git diff"), str((a, b, c_, d)))
    pg.keyboard.press("ArrowDown"); pg.keyboard.press("ArrowDown"); e_ = val(pg, tid)
    check("↓ за концом истории даёт пустую строку", e_ == "", repr(e_))
    for _ in range(12): pg.keyboard.press("ArrowUp")
    oldest = val(pg, tid)
    pg.keyboard.press("ArrowUp")
    check("↑ на самой старой команде не уходит за начало", val(pg, tid) == oldest == "git log --oneline", oldest)
    # 3. черновик
    for _ in range(12): pg.keyboard.press("ArrowDown")
    pg.locator(f"#term-in-{tid}").fill("git lo")
    pg.keyboard.press("ArrowUp"); mid = val(pg, tid)
    pg.keyboard.press("ArrowDown"); back = val(pg, tid)
    check("недописанная команда возвращается по ↓", mid == "git status" and back == "git lo", f"{mid!r} -> {back!r}")
    # 4. повторный запуск из истории
    pg.locator(f"#term-in-{tid}").fill("")
    pg.keyboard.press("ArrowUp"); pg.keyboard.press("Enter"); pg.wait_for_timeout(70)
    check("Enter по вызванной команде выполняет её и фокус остаётся", out(pg, tid).count("$ git status") + out(pg, tid).count("\ngit status") >= 1 and active(pg) == f"term-in-{tid}")
    pg.keyboard.press("ArrowUp"); check("после запуска ↑ снова начинает с последней команды", val(pg, tid) == "git status")
    # 5. неудачные команды тоже в истории; пометки ✎ — нет
    pg.locator(f"#term-in-{tid}").fill("git nonsense"); pg.keyboard.press("Enter"); pg.wait_for_timeout(50)
    pg.locator("[data-fileop=edit]").first.click(); pg.wait_for_timeout(60)
    pg.locator(f"#term-in-{tid}").click(); pg.keyboard.press("ArrowUp")
    check("ошибочная команда есть в истории, запись «отредактировал файл» — нет", val(pg, tid) == "git nonsense", val(pg, tid))
    # 6. история сохраняется при переключении разделов; пустая история — ничего не ломает
    nav(pg, 0); pg.locator("#term-in-ch1").click(); pg.keyboard.press("ArrowUp")
    check("ch1: ↑ в терминале, где команд ещё не было в этой сессии, не падает", True)
    nav(pg, 2); pg.locator(f"#term-in-{tid}").click(); pg.keyboard.press("ArrowUp")
    check("возврат в ch3: история на месте", val(pg, tid) != "", val(pg, tid))

    # 7. скролл не прыгает
    nav(pg, 2); pg.evaluate("document.querySelector('#term-in-ch3').scrollIntoView({block:'center'})"); pg.wait_for_timeout(250)
    y0 = pg.evaluate("window.scrollY"); pg.locator("#term-in-ch3").fill("git log"); pg.keyboard.press("Enter"); pg.wait_for_timeout(200)
    check("страница не прыгает по скроллу после команды", abs(pg.evaluate("window.scrollY") - y0) < 5, f"{y0} -> {pg.evaluate('window.scrollY')}")

    # 8. мобильная ширина: фокус не открывает горизонтальный скролл
    src = open("/mnt/user-data/outputs/git-trenazher_15.html", encoding="utf-8").read()
    open("wrapped3.html", "w", encoding="utf-8").write('<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + src + '</body></html>')
    ctx = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); pm = ctx.new_page(); pm.route("**/fonts.g*/**", lambda r: r.abort())
    pm.goto("file:///tmp/claude-0/-home-claude/c76621b3-6939-5be0-87bd-1c4f93f808bf/scratchpad/t/wrapped3.html", wait_until="domcontentloaded"); pm.wait_for_selector("#term-in-ch1")
    pm.locator("#term-in-ch1").fill("git init"); pm.locator("#term-in-ch1").press("Enter"); pm.wait_for_timeout(80)
    check("телефон: фокус на месте, переполнения нет", active(pm) == "term-in-ch1" and pm.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"))

    check("нет ошибок страницы", not (pg.errs + pm.errs if hasattr(pm, 'errs') else pg.errs), str(pg.errs))
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
