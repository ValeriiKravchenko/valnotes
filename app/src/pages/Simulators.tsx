import { Link } from 'react-router'
import { sections, simulatorGroups } from '@/data/site'

const simulators = sections.find((s) => s.slug === 'simulators')!

export default function Simulators() {
  return (
    <div>
      <h1 className="text-2xl uppercase tracking-tight text-white">{simulators.heading}</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">{simulators.intro}</p>
      <div className="mt-10 space-y-12">
        {simulatorGroups.map((group) => (
          <section key={group.heading}>
            <h2 className="text-lg uppercase tracking-tight text-white">{group.heading}</h2>
            <p className="mt-2 max-w-2xl text-[var(--muted)]">{group.intro}</p>
            <div className="mt-6 grid border-t b md:grid-cols-3">
              {group.cards.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className="relative flex min-h-[220px] flex-col justify-between border-b b px-5 py-10 no-underline md:border-b-0 md:border-r md:px-8"
                >
                  <div>
                    {(item.sectionNumber !== undefined || item.note) && (
                      <div className="mb-6 flex items-baseline justify-between">
                        {item.sectionNumber !== undefined ? (
                          <span className="label">{String(item.sectionNumber).padStart(2, '0')}</span>
                        ) : (
                          <span />
                        )}
                        {item.note && <span className="label accent">{item.note}</span>}
                      </div>
                    )}
                    <h3 className="mb-1 text-lg text-white">{item.title}</h3>
                    <p className="accent mb-4 text-[12px]">{item.tag}</p>
                    <p className="text-[var(--muted)]">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
