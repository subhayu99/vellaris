import { NavLink } from 'react-router-dom'
import { DOCS_NAV } from './nav-entries.ts'

export function MobileRail() {
  return (
    <div className="docs-rail">
      <div className="docs-rail-inner">
        {DOCS_NAV.flatMap((g) => g.items).map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => `docs-rail-chip ${isActive ? 'is-active' : ''}`}
          >
            <it.icon size={12} />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
