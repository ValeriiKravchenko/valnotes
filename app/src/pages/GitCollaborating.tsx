import { Link } from 'react-router'
import RemoteTrainer from '@/trainers/git/RemoteTrainer'
import { ru } from '@/trainers/git/locales/ru'

export default function GitCollaboratingPage() {
  return (
    <div>
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <div className="mt-6">
        <RemoteTrainer />
      </div>
    </div>
  )
}
