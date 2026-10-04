// ============================================================
// Общая шапка сайта — на всех страницах через layout-маршрут (см. components/Layout.tsx).
// Пункты навигации строятся из data/site.ts (sections), а не перечисляются здесь заново.
// ============================================================
import { Link } from 'react-router'
import { site, sections } from '@/data/site'

export default function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b b bg-[var(--bg)]/90 backdrop-blur-sm">
      <div className="mx-auto flex h-12 w-full max-w-5xl flex-nowrap items-center justify-between gap-3 px-5 md:px-8">
        <Link to="/" className="nav-link whitespace-nowrap font-medium text-white">
          {site.name.toLowerCase()}
          <span className="accent">_</span>
        </Link>
        <nav className="flex flex-nowrap gap-4 text-[11px] md:gap-8 md:text-[12px]">
          {sections.map((section) => (
            <Link key={section.slug} to={section.href} className="nav-link whitespace-nowrap">
              {section.navLabel}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
