import { Link } from 'react-router'
import InspectTrainer from '@/trainers/git/InspectTrainer'
import { ru } from '@/trainers/git/locales/ru'

export default function GitInspectingPage() {
  return (
    <div>
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <div className="mt-6">
        <InspectTrainer />
      </div>
    </div>
  )
}
