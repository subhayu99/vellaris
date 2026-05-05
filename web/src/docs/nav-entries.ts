/* Single source of truth for the docs nav: groups, items, icons, paths.
 * Consumed by the sidebar (vertical, grouped) and the mobile rail
 * (horizontal, flat). Keep slug strings aligned with App.tsx routes and
 * with the constants in marketing/links.ts. */

import type { ComponentType } from 'react'
import {
  IBraces,
  IFingerprint,
  IKey,
  ILogTree,
  IServer,
  IShield,
  ITerminal,
} from '../marketing/icons.tsx'
import { IBookOpen, ICompass } from './icons.tsx'
import {
  DOCS_API,
  DOCS_CLI,
  DOCS_DEPLOY,
  DOCS_PASSKEYS,
  DOCS_PROTOCOL,
  DOCS_QUICKSTART,
  DOCS_SDK,
  DOCS_TRUST,
  DOCS_URL,
} from '../marketing/links.ts'

type IconCmp = ComponentType<{ size?: number }>

export interface DocsEntry {
  to: string
  label: string
  icon: IconCmp
  end?: boolean
  /* Used by hero secnum + prev/next eyebrows. */
  secNum: string
  secKind: string
}

export interface DocsGroup {
  group: string
  items: ReadonlyArray<DocsEntry>
}

export const DOCS_NAV: ReadonlyArray<DocsGroup> = [
  {
    group: 'Get going',
    items: [
      {
        to: DOCS_URL,
        label: 'Overview',
        icon: ICompass,
        end: true,
        secNum: '00',
        secKind: 'Documentation',
      },
      {
        to: DOCS_QUICKSTART,
        label: 'Quickstart',
        icon: IBookOpen,
        secNum: '01',
        secKind: 'Get going',
      },
      { to: DOCS_TRUST, label: 'Trust model', icon: IShield, secNum: '02', secKind: 'Trust' },
      {
        to: DOCS_PASSKEYS,
        label: 'Passkeys',
        icon: IFingerprint,
        secNum: '03',
        secKind: 'Get going',
      },
    ],
  },
  {
    group: 'Clients',
    items: [
      { to: DOCS_CLI, label: 'CLI reference', icon: ITerminal, secNum: '04', secKind: 'Client' },
      { to: DOCS_SDK, label: 'Python SDK', icon: IBraces, secNum: '05', secKind: 'Client' },
    ],
  },
  {
    group: 'Run a server',
    items: [
      {
        to: DOCS_DEPLOY,
        label: 'Deployment',
        icon: IServer,
        secNum: '06',
        secKind: 'Run a server',
      },
      { to: DOCS_API, label: 'OpenAPI', icon: ILogTree, secNum: '07', secKind: 'Run a server' },
      {
        to: DOCS_PROTOCOL,
        label: 'On-wire protocol',
        icon: IKey,
        secNum: '08',
        secKind: 'Run a server',
      },
    ],
  },
]

/* Lookup helpers — used by page-shell to compute prev/next + hero hat. */
const FLAT: ReadonlyArray<DocsEntry> = DOCS_NAV.flatMap((g) => g.items)

export function findEntry(to: string): DocsEntry | undefined {
  return FLAT.find((e) => e.to === to)
}

export function neighbours(to: string): { prev?: DocsEntry; next?: DocsEntry } {
  const idx = FLAT.findIndex((e) => e.to === to)
  if (idx < 0) return {}
  return {
    prev: idx > 0 ? FLAT[idx - 1] : undefined,
    next: idx < FLAT.length - 1 ? FLAT[idx + 1] : undefined,
  }
}
