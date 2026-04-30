import type { SdkBuilderState } from '../state'

interface Props {
  state: SdkBuilderState
  onChange: (patch: Partial<SdkBuilderState>) => void
}

export function SdkConfigForm({ state, onChange }: Props) {
  const r = state.recipe
  return (
    <div className="sdk-args-grid">
      <label>
        Server URL
        <input
          type="text"
          value={state.serverUrl}
          onChange={(e) => onChange({ serverUrl: e.target.value })}
        />
      </label>
      <label>
        Username
        <input
          type="text"
          value={state.username}
          onChange={(e) => onChange({ username: e.target.value })}
        />
      </label>
      {(r === 'upload' || r === 'upload-and-share') && (
        <label>
          File path
          <input
            type="text"
            value={state.filePath || ''}
            onChange={(e) => onChange({ filePath: e.target.value })}
          />
        </label>
      )}
      {(r === 'download' || r === 'share' || r === 'revoke') && (
        <label>
          Document ID
          <input
            type="text"
            value={state.documentId || ''}
            onChange={(e) => onChange({ documentId: e.target.value })}
          />
        </label>
      )}
      {(r === 'upload-and-share' || r === 'share' || r === 'revoke') && (
        <label>
          {r === 'revoke' ? 'Revoke from' : 'Share with'}
          <input
            type="text"
            value={state.recipient || ''}
            onChange={(e) => onChange({ recipient: e.target.value })}
          />
        </label>
      )}
      <fieldset className="sdk-variant-radios">
        <legend>Variant</legend>
        {(['async', 'sync'] as const).map((v) => (
          <label key={v}>
            <input
              type="radio"
              checked={state.variant === v}
              onChange={() => onChange({ variant: v })}
            />
            {v}
          </label>
        ))}
      </fieldset>
    </div>
  )
}
