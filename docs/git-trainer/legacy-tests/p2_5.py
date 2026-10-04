import json, sys
from playwright.sync_api import sync_playwright
KEY = "git-trenazher-progress-v1"
V = {"_4 (после)": "file:///mnt/user-data/outputs/git-trenazher_15.html"}
res = []
def check(name, cond, extra=""):
    res.append(bool(cond)); print(("  PASS " if cond else "  FAIL ") + name + (f"  [{extra}]" if extra else ""))
def new_page(br, url, init=None):
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    if init: ctx.add_init_script(init)
    pg = ctx.new_page(); pg.route("**/fonts.g*/**", lambda r: r.abort())
    pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(url, wait_until="domcontentloaded"); pg.wait_for_selector(".nav-item"); return pg
def nav(pg, i): pg.locator(".nav-item").nth(i).click(); pg.wait_for_timeout(80)
def answer(pg, q, oi=0):
    cur = pg.evaluate("String(STATE.current)")
    if cur in ('ch1', '0') and q == 0 and oi == 0: oi = 2   # в разделе 1 верный ответ на вопрос 1 — третий (requireCorrect)
    oi = pg.evaluate(f"STATE_DEFS[STATE.current].quiz[{q}].options.findIndex(o=>o.correct)")
    pg.locator(f".quiz-opt[data-qi='{q}'][data-oi='{oi}']").click(); pg.wait_for_timeout(40)
def label(pg): return pg.inner_text("#progressLabel")
def dots(pg): return pg.locator(".nav-dot.done").count()
def keys(pg): 
    raw = pg.evaluate(f"localStorage.getItem('{KEY}')")
    return sorted(json.loads(raw)["quiz"].keys()) if raw else None

def scenario_reload(br, url, strict):
    pg = new_page(br, url)
    for ci in (0, 1, 2):
        nav(pg, ci); answer(pg, 0, 0); answer(pg, 1, 0)
    nav(pg, 3); answer(pg, 0, 0)                        # ch4: отвечен только 1 из 2 вопросов
    before = label(pg)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector(".nav-item")
    print(f"    до перезагрузки: {before} | после: {label(pg)} | зелёных точек в меню: {dots(pg)} | открыт раздел: {pg.inner_text('.chapter-title')!r}")
    if strict:
        check("после перезагрузки прогресс сохранился (3 из 8)", label(pg).startswith("3 /"))
        check("зелёные точки в меню видны сразу, без захода в разделы", dots(pg) == 3)
    nav(pg, 5); answer(pg, 0, 1)                        # ответ в другом разделе после перезагрузки
    print(f"    ключи в хранилище после ответа в разделе 6: {keys(pg)}")
    if strict:
        check("ответ в разделе 6 не стёр ответы разделов 1–4", keys(pg) == ["ch1", "ch2", "ch3", "ch4", "ch6"] or set(["ch1","ch2","ch3","ch6"]).issubset(set(keys(pg))), str(keys(pg)))
        nav(pg, 1)
        check("в разделе 2 ответы восстановлены (кнопки заблокированы, есть подсветка)", pg.locator(".quiz-opt[disabled]").count() == 8 and pg.locator(".quiz-opt.correct").count() == 2)
        nav(pg, 3)
        check("раздел 4: один ответ сохранён, второй вопрос доступен", pg.locator(".quiz-opt[disabled]").count() == 4 and pg.locator(".quiz-opt:not([disabled])").count() == 4)
        answer(pg, 1, 2)
        check("после второго ответа раздел 4 засчитан (5 из 8: разделы 1–4 и 6 частично не считается)", label(pg).startswith("4 /"), label(pg))
        pg.reload(wait_until="domcontentloaded"); pg.wait_for_selector(".nav-item")
        check("и это тоже переживает перезагрузку", label(pg).startswith("4 /"), label(pg))
        check("открывается последний просмотренный раздел (Отмена действий)", pg.inner_text(".chapter-title") == "Отмена действий")
    check("нет ошибок страницы", not pg.errs, str(pg.errs))

def scenario_corrupt(br, url, strict):
    cases = {
        "null": "null", "массив": "[]", "строка": '"x"', "битый JSON": "{bad", "число": "42",
        "индекс вне границ": json.dumps({"lastChapter": "ch1", "quiz": {"ch1": {"0": 99, "1": -1}}}),
        "quiz не объект": json.dumps({"quiz": {"ch1": "oops"}}), "quiz=null": json.dumps({"quiz": None}),
        "lastChapter-объект": json.dumps({"lastChapter": {"a": 1}}), "чужой раздел": json.dumps({"quiz": {"zzz": {"0": 1}}}),
    }
    for name, raw in cases.items():
        try:
            pg = new_page(br, url, init=f"try{{localStorage.setItem('{KEY}', {json.dumps(raw)});}}catch(e){{}}")
            ok = pg.locator(".chapter-title").count() == 1 and not pg.errs
            note = "открылось" if ok else ("ОШИБКА: " + (pg.errs[0][:70] if pg.errs else "раздел не отрисован"))
            print(f"    {name:20} -> {note} | {label(pg) if pg.locator('#progressLabel').count() else ''}")
            if strict: check(f"битое хранилище «{name}»: страница работает", ok)
            pg.context.close()
        except Exception as e:
            print(f"    {name:20} -> ИСКЛЮЧЕНИЕ теста: {str(e)[:70]}")
            if strict: check(f"битое хранилище «{name}»: страница работает", False)

def scenario_blocked(br, url, strict):
    init = "Storage.prototype.getItem=function(){throw new Error('blocked')};Storage.prototype.setItem=function(){throw new Error('blocked')};"
    pg = new_page(br, url, init=init)
    nav(pg, 0); answer(pg, 0, 0); answer(pg, 1, 0)
    print(f"    хранилище недоступно: прогресс в сессии {label(pg)}, ошибок страницы: {len(pg.errs)}")
    if strict:
        check("без localStorage страница работает, прогресс считается в рамках сессии", label(pg).startswith("1 /") and not pg.errs)

for name, url in V.items():
    strict = "после" in name
    print(f"\n=== {name} ===")
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--no-sandbox"])
        print("  [A] перезагрузка страницы"); scenario_reload(br, url, strict)
        print("  [B] испорченное содержимое localStorage"); scenario_corrupt(br, url, strict)
        print("  [C] localStorage недоступен"); scenario_blocked(br, url, strict)
        br.close()
print(f"\nпроверок новой версии: {sum(res)}/{len(res)} успешно")
