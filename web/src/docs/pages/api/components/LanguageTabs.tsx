import type { ApiLanguage } from '../state'

interface Props {
  value: ApiLanguage
  onChange: (lang: ApiLanguage) => void
}

const TABS: ReadonlyArray<{ value: ApiLanguage; label: string }> = [
  { value: 'curl', label: 'curl' },
  { value: 'python', label: 'Python (httpx)' },
  { value: 'js', label: 'JavaScript (fetch)' },
]

export function LanguageTabs({ value, onChange }: Props) {
  return (
    <div className="api-lang-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`api-lang-tab ${value === tab.value ? 'api-lang-tab-active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
