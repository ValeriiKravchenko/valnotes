import { Link } from 'react-router'
import { site, sections } from '@/data/site'

function SectionHeading({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4 border-b b px-5 py-4 md:px-8">
      <span className="label accent">{index}</span>
      <h2 className="text-xl uppercase tracking-tight md:text-2xl">{title}</h2>
    </div>
  )
}

function TableOfContents() {
  return (
    <section className="border-b b">
      <SectionHeading index="01" title={site.home.tocHeading} />
      <div className="grid md:grid-cols-2">
        {sections.map((section, i) => (
          <div
            key={section.slug}
            className={`px-5 py-8 md:px-8 ${i < sections.length - 1 ? 'border-b b md:border-b-0 md:border-r' : ''}`}
          >
            <h3 className="text-lg">
              <Link to={section.href} className="nav-link text-white no-underline">
                {section.heading}
              </Link>
            </h3>
            <p className="mt-2 text-[var(--muted)]">{section.intro}</p>
            <ul className="mt-4 space-y-2">
              {section.pages.map((page) => (
                <li key={page.href} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <Link to={page.href} className="nav-link text-white">
                    {page.title}
                  </Link>
                  {page.status && <span className="label accent">{page.status}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function About() {
  return (
    <section className="border-b b">
      <SectionHeading index="02" title={site.home.aboutHeading} />
      <div className="space-y-5 px-5 py-8 text-[15px] leading-7 md:px-8">
        {site.about.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  )
}

function Stack() {
  return (
    <section className="border-b b">
      <SectionHeading index="03" title={site.home.stackHeading} />
      <div>
        {site.stack.map((s) => (
          <div
            key={s.name}
            className="skill-row grid grid-cols-2 gap-x-4 border-b b px-5 py-4 last:border-b-0 md:grid-cols-12 md:px-8"
          >
            <span className="skill-name text-white transition-colors md:col-span-4">{s.name}</span>
            <span className="accent text-right md:col-span-3 md:text-left">{s.level}</span>
            <span className="col-span-2 mt-1 text-[var(--muted)] md:col-span-5 md:mt-0">{s.note}</span>
          </div>
        ))}
      </div>
      <div className="border-t b px-5 py-6 md:px-8">
        <p className="text-[var(--muted)]">
          <span className="label mr-3">{site.home.learningLabel}</span>
          {site.learning.map((t, i) => (
            <span key={t}>
              <span className="text-white">{t}</span>
              {i < site.learning.length - 1 && <span className="mx-2 accent">·</span>}
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="flex flex-col justify-between gap-2 py-5 text-[var(--muted)] md:flex-row md:gap-0">
      <span>© {new Date().getFullYear()} {site.name}</span>
      <span className="accent">{site.role}</span>
    </footer>
  )
}

export default function Home() {
  return (
    <div>
      <TableOfContents />
      <About />
      <Stack />
      <Footer />
    </div>
  )
}
