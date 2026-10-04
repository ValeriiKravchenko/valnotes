import { Link } from 'react-router'
import EnglishTrainer from '@/trainers/english/EnglishTrainer'
import { ru } from '@/trainers/english/locales/ru'

export default function EnglishTrainerPage() {
  return (
    <div>
      <Link to="/simulators" className="label">
        {ru.ui.backToSimulators}
      </Link>
      <div className="mt-6">
        <EnglishTrainer />
      </div>
    </div>
  )
}
