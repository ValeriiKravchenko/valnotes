// ============================================================
// Словарь тренажёра английских слов — все строки, которые видит человек.
// Структура по образцу src/data/site.ts и trainers/git/locales/ru.ts:
// данные отдельно от логики, код вёрстки их не трогает.
// ============================================================
import type { ParseProgressError } from '../engine'

/** Расшифровка машиночитаемых кодов ошибок parseProgress (движок не знает про интерфейс). */
const parseErrorText: Record<ParseProgressError, string> = {
  'invalid-json': 'файл повреждён — это не корректный JSON',
  'not-an-object': 'внутри файла не объект, а что-то другое',
  'unsupported-version': 'файл сохранён в несовместимой версии формата',
  'missing-entries': 'в файле нет данных о прогрессе',
  'invalid-entry': 'одна из записей о слове повреждена',
}

/** Склонение слова «слово» по числу — по тому же принципу, что pluralCommits в git-тренажёре. */
function pluralWords(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} слово`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} слова`
  return `${n} слов`
}

export const ru = {
  ui: {
    heading: 'Английские слова',
    subheading: 'Тренажёр слов с интервальным повторением',
    intro:
      'Слова из рабочей практики и общего английского. Карточка показывает слово, потом по запросу — перевод, пример и заметку. Отвечай «знаю» / «не знаю» — от этого зависит, когда слово покажется снова.',
    backToSimulators: '← Симуляторы',

    /** @param count сколько карточек осталось в текущей сессии, включая повторы */
    wordsLeft: (count: number) => `осталось в сессии: ${pluralWords(count)}`,

    card: {
      listenButton: '🔊 послушать',
      listenAriaLabel: 'Послушать произношение слова',
      revealButton: 'показать перевод',
      revealHint: 'пробел',
      translationLabel: 'перевод',
      exampleLabel: 'пример',
      noteLabel: 'заметка',
      dontKnowButton: 'не знаю',
      dontKnowHint: '1',
      knowButton: 'знаю',
      knowHint: '2',
    },

    stats: {
      title: 'Статистика',
      newCount: 'новых',
      learning: 'изучается',
      learned: 'выучено',
      dueToday: 'к повтору сегодня',
      dueTodayNote: 'считается отдельно — пересекается с остальными категориями',
    },

    finished: {
      heading: 'На сегодня всё',
      text: 'Новых карточек и повторов на сегодня больше нет. Возвращайся завтра — расписание построит следующую сессию само.',
    },

    progress: {
      title: 'Прогресс',
      exportButton: '↓ выгрузить прогресс',
      importButton: '↑ загрузить прогресс',
      importConfirm: 'Заменить текущий прогресс содержимым файла? Текущие данные будут перезаписаны.',
      /** @param description человекочитаемая причина, почему файл не разобрался (parseErrorText) */
      loadError: (description: string) =>
        `Не удалось прочитать сохранённый прогресс: ${description}. Начат новый пустой прогресс — старые данные при этом не стёрты, их резервная копия сохранена в этом браузере и её можно скачать.`,
      downloadBrokenButton: '↓ скачать испорченные данные',
      /** @param description человекочитаемая причина, почему файл не разобрался (parseErrorText) */
      importError: (description: string) => `Не удалось прочитать файл: ${description}. Текущий прогресс не изменён.`,
      importSuccess: 'Прогресс загружен из файла.',
    },
  },

  /** Расшифровка кодов ошибок parseProgress — для сборки сообщений в ui.progress. */
  parseErrorText,
}
