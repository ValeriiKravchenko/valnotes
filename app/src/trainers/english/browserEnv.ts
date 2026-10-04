// ============================================================
// Тренажёр английского: то, что движок (engine/) принципиально не делает сам —
// чтение системных часов и генерация случайности. Обе вещи — дело интегратора,
// движок принимает их параметрами (см. engine/schedule.ts и engine/session.ts).
// ============================================================

/**
 * Сегодняшняя дата в формате YYYY-MM-DD по ЛОКАЛЬНОМУ времени браузера.
 * Намеренно не toISOString() — он в UTC и ночью может съехать на соседний день.
 */
export function getLocalToday(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Перемешивание Фишера — Йейтса на Math.random. Передаётся в createSession извне. */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
