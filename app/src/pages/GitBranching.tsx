import { Link } from 'react-router'
import BranchingTrainer from '@/trainers/git/BranchingTrainer'
import { ru } from '@/trainers/git/locales/ru'

export default function GitBranchingPage() {
  return (
    <div>
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <div className="mt-6">
        <BranchingTrainer />
      </div>
    </div>
  )
}
