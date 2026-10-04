import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import { site } from '@/data/site'

// Страницы, кроме главной, грузятся отдельными чанками — по одному на переход,
// а не всё разом одним файлом. Suspense-заглушка показывается внутри Layout,
// поэтому шапка остаётся на месте, пока страница подгружается.
const Library = lazy(() => import('./pages/Library'))
const LibraryBooks = lazy(() => import('./pages/LibraryBooks'))
const LibraryBookLinks = lazy(() => import('./pages/LibraryBookLinks'))
const Simulators = lazy(() => import('./pages/Simulators'))
const GitTrainerPage = lazy(() => import('./pages/GitTrainer'))
const GitBranchingPage = lazy(() => import('./pages/GitBranching'))
const GitInspectingPage = lazy(() => import('./pages/GitInspecting'))
const GitUndoingPage = lazy(() => import('./pages/GitUndoing'))
const GitCollaboratingPage = lazy(() => import('./pages/GitCollaborating'))
const GitSearchingPage = lazy(() => import('./pages/GitSearching'))
const GitDraftPage = lazy(() => import('./pages/GitDraft'))
const EnglishTrainerPage = lazy(() => import('./pages/EnglishTrainer'))

function PageFallback() {
  return <p>{site.common.pageLoading}</p>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/library"
          element={
            <Suspense fallback={<PageFallback />}>
              <Library />
            </Suspense>
          }
        />
        {/* скрытая страница: загрузка своих ссылок «открыть» в этот браузер, в меню её нет */}
        <Route
          path="/library/books/links"
          element={
            <Suspense fallback={<PageFallback />}>
              <LibraryBookLinks />
            </Suspense>
          }
        />
        <Route
          path="/library/books"
          element={
            <Suspense fallback={<PageFallback />}>
              <LibraryBooks />
            </Suspense>
          }
        />
        <Route
          path="/simulators"
          element={
            <Suspense fallback={<PageFallback />}>
              <Simulators />
            </Suspense>
          }
        />
        <Route
          path="/simulators/git/basics"
          element={
            <Suspense fallback={<PageFallback />}>
              <GitTrainerPage />
            </Suspense>
          }
        />
        <Route
          path="/simulators/git/branching"
          element={
            <Suspense fallback={<PageFallback />}>
              <GitBranchingPage />
            </Suspense>
          }
        />
        <Route
          path="/simulators/git/inspecting"
          element={
            <Suspense fallback={<PageFallback />}>
              <GitInspectingPage />
            </Suspense>
          }
        />
        <Route
          path="/simulators/git/undoing"
          element={
            <Suspense fallback={<PageFallback />}>
              <GitUndoingPage />
            </Suspense>
          }
        />
        <Route
          path="/simulators/git/collaborating"
          element={
            <Suspense fallback={<PageFallback />}>
              <GitCollaboratingPage />
            </Suspense>
          }
        />
        <Route
          path="/simulators/git/searching"
          element={
            <Suspense fallback={<PageFallback />}>
              <GitSearchingPage />
            </Suspense>
          }
        />
        <Route
          path="/simulators/git/draft"
          element={
            <Suspense fallback={<PageFallback />}>
              <GitDraftPage />
            </Suspense>
          }
        />
        <Route
          path="/simulators/english"
          element={
            <Suspense fallback={<PageFallback />}>
              <EnglishTrainerPage />
            </Suspense>
          }
        />
        {/* старые адреса — тренажёры переехали в /simulators, заменяем запись в истории браузера */}
        <Route path="/library/git-trainer" element={<Navigate to="/simulators/git/basics" replace />} />
        <Route path="/simulators/git" element={<Navigate to="/simulators/git/basics" replace />} />
        <Route path="/english" element={<Navigate to="/simulators/english" replace />} />
      </Route>
    </Routes>
  )
}
