import type { RunMode } from '../state'

export function RunModePicker({
  value,
  onChange,
}: {
  value: RunMode
  onChange: (v: RunMode) => void
}) {
  return (
    <fieldset className="install-fieldset">
      <legend>How do you want to run it?</legend>
      <label>
        <input
          type="radio"
          name="run-mode"
          checked={value === 'docker'}
          onChange={() => onChange('docker')}
        />
        Docker
      </label>
      <label>
        <input
          type="radio"
          name="run-mode"
          checked={value === 'compose'}
          onChange={() => onChange('compose')}
        />
        Docker Compose
      </label>
      <label>
        <input
          type="radio"
          name="run-mode"
          checked={value === 'pip'}
          onChange={() => onChange('pip')}
        />
        Python (pip)
      </label>
      <label>
        <input
          type="radio"
          name="run-mode"
          checked={value === 'helm'}
          onChange={() => onChange('helm')}
        />
        Helm (values.yaml)
      </label>
      <label>
        <input
          type="radio"
          name="run-mode"
          checked={value === 'systemd'}
          onChange={() => onChange('systemd')}
        />
        systemd unit
      </label>
    </fieldset>
  )
}
