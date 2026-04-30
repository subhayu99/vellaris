import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DocsPageShell } from '../page-shell.tsx'
import { DOCS_INSTALL } from '../../marketing/links.ts'
import { RunModePicker } from './install/components/RunModePicker'
import { BackendPickers } from './install/components/BackendPickers'
import { ConfigPanel } from './install/components/ConfigPanel'
import { CredsPanel } from './install/components/CredsPanel'
import { SnippetBox } from './install/components/SnippetBox'
import {
  decodeStateFromUrl,
  defaultInstallState,
  encodeStateToUrl,
  forgetEverything,
  loadConfigFromLocalStorage,
  loadCredsFromLocalStorage,
  saveConfigToLocalStorage,
  saveCredsToLocalStorage,
  type InstallState,
} from './install/state'
import { generateExportBlock, generateRunSnippet } from './install/templates'
import './install/install.css'

const VERSION = '0.5.0'

export function InstallPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [state, setState] = useState<InstallState>(() => {
    // Priority: URL > localStorage config > defaults. Creds always loaded from LS.
    const fromUrl = location.search ? decodeStateFromUrl(location.search) : null
    const fromLs = loadConfigFromLocalStorage()
    const merged = { ...defaultInstallState, ...fromLs, ...(fromUrl || {}) }
    const creds = loadCredsFromLocalStorage()
    return { ...merged, ...creds }
  })

  // Sync state → URL (non-creds) and localStorage.
  useEffect(() => {
    const newSearch = encodeStateToUrl(state)
    if (newSearch !== location.search) {
      navigate({ search: newSearch }, { replace: true })
    }
    saveConfigToLocalStorage(state)
    saveCredsToLocalStorage(state)
  }, [state, location.search, navigate])

  function patch(p: Partial<InstallState>) {
    setState((prev) => ({ ...prev, ...p }))
  }

  function reset() {
    setState((prev) => ({ ...defaultInstallState, credsMode: prev.credsMode }))
  }

  function forgetAll() {
    forgetEverything()
    setState(defaultInstallState)
  }

  const exportBlock = useMemo(() => generateExportBlock(state, VERSION), [state])
  const runSnippet = useMemo(() => generateRunSnippet(state, VERSION), [state])

  return (
    <DocsPageShell
      to={DOCS_INSTALL}
      title="Install configurator"
      lead="Pick how you want to run Vellaris and which backends you have. The snippets below update live and are bookmarkable via the URL."
    >
      <div className="install-page">
        <RunModePicker value={state.runMode} onChange={(runMode) => patch({ runMode })} />

        <BackendPickers
          db={state.db}
          storage={state.storage}
          image={state.image}
          runMode={state.runMode}
          onDb={(db) => patch({ db })}
          onStorage={(storage) => patch({ storage })}
          onImage={(image) => patch({ image })}
        />

        <ConfigPanel state={state} onChange={patch} onReset={reset} />

        <CredsPanel state={state} onChange={patch} onForgetEverything={forgetAll} />

        {state.credsMode === 'export' && exportBlock && (
          <SnippetBox title="1. Set credentials in your shell" contents={exportBlock} />
        )}

        <SnippetBox
          title={
            state.credsMode === 'export' && exportBlock
              ? '2. Run Vellaris'
              : 'Run Vellaris'
          }
          contents={runSnippet}
          warn={state.credsMode === 'inline'}
        />
      </div>
    </DocsPageShell>
  )
}
