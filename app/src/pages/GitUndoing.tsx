import { Link } from 'react-router'
import UndoTrainer from '@/trainers/git/UndoTrainer'
import { ru } from '@/trainers/git/locales/ru'

export default function GitUndoingPage() {
  return (
    <div>
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <div className="mt-6">
        <UndoTrainer />
      </div>
    </div>
  )
}
