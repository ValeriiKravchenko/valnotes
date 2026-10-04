// ============================================================
// Страница /simulators/git/draft — черновик: все 8 разделов исходного
// тренажёра целиком, без проверки на соответствие настоящему git. Сам
// тренажёр — статический app/public/git-trainer-draft.html (копия
// docs/git-trainer/source.html без изменений), эта страница только
// оборачивает его в каркас сайта и предупреждение сверху.
// ============================================================
import { Link } from 'react-router'
import { ru } from '@/trainers/git/locales/ru'

export default function GitDraftPage() {
  const draft = ru.draft
  return (
    // высота = viewport минус отступы Layout (шапка компенсируется pt-12 в main,
    // pb-16 — нижний отступ main) — чтобы страница не давала второй прокрутки
    // поверх прокрутки внутри самого iframe.
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <p className="mt-4 border b bg-[var(--bg)] px-4 py-3 text-[13px] text-[var(--muted)]">
        {draft.warningText} <span className="text-white">{draft.migratedLabel}</span>{' '}
        <Link to="/simulators/git/basics" className="nav-link">
          {draft.section1Link}
        </Link>
        {', '}
        <Link to="/simulators/git/branching" className="nav-link">
          {draft.section2Link}
        </Link>
        {', '}
        <Link to="/simulators/git/inspecting" className="nav-link">
          {draft.section3Link}
        </Link>
        {', '}
        <Link to="/simulators/git/undoing" className="nav-link">
          {draft.section4Link}
        </Link>
        {', '}
        <Link to="/simulators/git/collaborating" className="nav-link">
          {draft.section5Link}
        </Link>
        {', '}
        <Link to="/simulators/git/searching" className="nav-link">
          {draft.section6Link}
        </Link>
      </p>
      <iframe
        src="/git-trainer-draft.html"
        title={draft.iframeTitle}
        className="mt-4 flex-1 border b"
      />
    </div>
  )
}
