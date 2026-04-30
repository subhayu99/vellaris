import type { SdkRecipe } from '../state'
import { RECIPES } from '../templates'

interface Props {
  value: SdkRecipe
  onChange: (recipe: SdkRecipe) => void
}

export function RecipePicker({ value, onChange }: Props) {
  return (
    <div className="sdk-recipe-grid">
      {RECIPES.map((entry) => (
        <button
          key={entry.recipe}
          type="button"
          className={`sdk-recipe-tile ${value === entry.recipe ? 'sdk-recipe-tile-active' : ''}`}
          onClick={() => onChange(entry.recipe)}
        >
          <strong>{entry.label}</strong>
          <span>{entry.description}</span>
        </button>
      ))}
    </div>
  )
}
