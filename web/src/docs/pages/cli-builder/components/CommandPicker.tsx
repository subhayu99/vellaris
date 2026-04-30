import type { CliCommand } from '../state'
import { COMMAND_HELP } from '../templates'

interface Props {
  value: CliCommand
  onChange: (cmd: CliCommand) => void
}

export function CommandPicker({ value, onChange }: Props) {
  return (
    <div className="cli-cmd-grid">
      {COMMAND_HELP.map((entry) => (
        <button
          key={entry.cmd}
          type="button"
          className={`cli-cmd-tile ${value === entry.cmd ? 'cli-cmd-tile-active' : ''}`}
          onClick={() => onChange(entry.cmd)}
        >
          <code>{entry.label}</code>
          <span>{entry.help}</span>
        </button>
      ))}
    </div>
  )
}
