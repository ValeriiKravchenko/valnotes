import sys, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; SCHEME = sys.argv[2] if len(sys.argv)>2 else "light"
JS = r"""
() => {
  function parse(c){ const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]}; }
  function over(f,b){ const a=f.a; return {r:f.r*a+b.r*(1-a), g:f.g*a+b.g*(1-a), b:f.b*a+b.b*(1-a), a:1}; }
  function lum(c){ const f=v=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4)}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); }
  function ratio(a,b){ const la=lum(a), lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); }
  function bgOf(el){ const chain=[]; for(let e=el;e;e=e.parentElement){ const c=parse(getComputedStyle(e).backgroundColor); if(c&&c.a>0){ chain.push(c); if(c.a>=1) break; } }
    let base={r:255,g:255,b:255,a:1}; const bodyBg=parse(getComputedStyle(document.body).backgroundColor); if(bodyBg&&bodyBg.a>0) base=bodyBg;
    let cur=chain.length&&chain[chain.length-1].a>=1? chain.pop(): base; while(chain.length){ cur=over(chain.pop(),cur);} return cur; }
  const out={};
  const walker=document.createTreeWalker(document.getElementById('content')||document.body, NodeFilter.SHOW_TEXT);
  let n; while(n=walker.nextNode()){
    const t=n.textContent.trim(); if(!t) continue; const el=n.parentElement; if(!el) continue;
    const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') continue; const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) continue;
    let fg=parse(cs.color); const bg=bgOf(el); fg=over(fg,bg);
    const size=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight)>=700; const large = size>=24 || (size>=18.66 && bold);
    const rt=ratio(fg,bg); const need=large?3:4.5;
    if(rt<need){ const key=(el.className||el.tagName)+'|'+cs.color+'|'+`${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}`; if(!out[key]) out[key]={cls:String(el.className||el.tagName), color:cs.color, bg:`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, ratio:+rt.toFixed(2), size, sample:t.slice(0,40), count:0}; out[key].count++; }
  }
  return Object.values(out);
}
"""
with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width":1280,"height":900}, color_scheme=SCHEME)
    pg = ctx.new_page(); pg.route("**/fonts.g*/**", lambda r: r.abort()); pg.goto(URL); pg.wait_for_selector(".nav-item")
    total = {}
    n = pg.locator(".nav-item").count()
    for i in range(n):
        pg.locator(".nav-item").nth(i).click(); pg.wait_for_timeout(120)
        # заполнить состояние: ответить на квиз и выполнить пару команд
        for b in pg.locator("[data-qi][data-oi='0']").all()[:3]:
            try: b.click(); pg.wait_for_timeout(30)
            except Exception: pass
        for r in pg.evaluate(JS): total.setdefault(f"{r['cls']}|{r['color']}|{r['bg']}", dict(r, chapters=[]))["chapters"].append(i+1)
    for k,v in sorted(total.items(), key=lambda kv: kv[1]['ratio']):
        print(f"{v['ratio']:>5}  {v['cls'][:40]:40} {v['color']:22} on {v['bg']:18} sz={v['size']} ch={v['chapters']} «{v['sample']}»")
    print("итого проблемных сочетаний:", len(total))
