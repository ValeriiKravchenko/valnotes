// ============================================================
// Общий каркас страниц: шапка + контейнер контента. Layout-маршрут (см. App.tsx) —
// рендерится один раз, а сами страницы приходят через <Outlet/>. Здесь и только
// здесь заданы отступы страницы и ограничение ширины — страницы их не повторяют.
// ============================================================
import { Outlet } from 'react-router'
import Header from '@/components/Header'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* pt-12 = высота шапки (h-12) — под неё, а не под пустоту, как раньше на внутренних страницах */}
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-5 pb-16 pt-12 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}
