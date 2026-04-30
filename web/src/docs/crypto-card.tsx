interface CryptoCardProps {
  primitive: string
  choice: string
  why: string
}

export function CryptoCard({ primitive, choice, why }: CryptoCardProps) {
  return (
    <div className="crypto-cell">
      <span className="eyebrow">{primitive}</span>
      <span className="choice">{choice}</span>
      <p className="why">{why}</p>
    </div>
  )
}
