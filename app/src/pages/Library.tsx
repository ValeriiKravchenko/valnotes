import { Link } from 'react-router'
import { sections } from '@/data/site'

const library = sections.find((s) => s.slug === 'library')!

export default function Library() {
  return (
    <div>
      <h1 className="text-2xl uppercase tracking-tight text-white">{library.heading}</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">{library.intro}</p>
      <div className="mt-10 grid border-t b md:grid-cols-3">
        {library.pages.map((item, i) => (
          <Link
            key={item.href}
            to={item.href}
            className="relative flex min-h-[220px] flex-col justify-between border-b b px-5 py-10 no-underline md:border-b-0 md:border-r md:px-8"
          >
            <div>
              <div className="mb-6 flex items-baseline justify-between">
                <span className="label">{String(i + 1).padStart(2, '0')}</span>
                <span className="label accent">{item.status}</span>
              </div>
              <h2 className="mb-1 text-lg text-white">{item.title}</h2>
              <p className="accent mb-4 text-[12px]">{item.tag}</p>
              <p className="text-[var(--muted)]">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
