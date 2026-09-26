// Stjerner – som visning eller som vælger (når onChange er sat)
export default function Stars({
  value,
  onChange,
  size = 'text-xl',
}: {
  value: number
  onChange?: (n: number) => void
  size?: string
}) {
  return (
    <span className={`inline-flex gap-0.5 ${size}`} role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} ud af 5 stjerner`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} stjerner`}
            onClick={() => onChange(n)}
            className={`cursor-pointer transition hover:scale-110 ${n <= value ? 'text-accent' : 'text-zinc-700'}`}
          >
            ★
          </button>
        ) : (
          <span key={n} className={n <= value ? 'text-accent' : 'text-zinc-700'}>
            ★
          </span>
        ),
      )}
    </span>
  )
}
