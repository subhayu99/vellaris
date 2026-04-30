import { NavLink } from 'react-router-dom'
import { REPO_URL } from '../marketing/links.ts'
import { DOCS_NAV } from './nav-entries.ts'

export function DocsSidebar() {
  return (
    <aside className="docs-side" aria-label="Docs navigation">
      {DOCS_NAV.map((g) => (
        <div className="docs-side-group" key={g.group}>
          <div className="docs-side-label">{g.group}</div>
          {g.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `docs-side-link ${isActive ? 'is-active' : ''}`}
            >
              <span className="ico">
                <Icon size={15} />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      ))}
      <div className="docs-side-foot">
        <a href={`${REPO_URL}/releases`} target="_blank" rel="noreferrer">
          <span className="v">
            <span className="dot" /> v0.3.1 · alpha
          </span>
          <span className="ext" aria-hidden="true">
            ↗
          </span>
        </a>
      </div>
    </aside>
  )
}
