import { Link } from 'react-router'
import SearchTrainer from '@/trainers/git/SearchTrainer'
import { ru } from '@/trainers/git/locales/ru'

export default function GitSearchingPage() {
  return (
    <div>
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <div className="mt-6">
        <SearchTrainer />
      </div>
    </div>
  )
}
