import { Link } from 'react-router'
import GitTrainer from '@/trainers/git/GitTrainer'
import { ru } from '@/trainers/git/locales/ru'

export default function GitTrainerPage() {
  return (
    <div>
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <div className="mt-6">
        <GitTrainer />
      </div>
    </div>
  )
}
