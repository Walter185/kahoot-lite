import { useEffect } from 'react'

export default function WinnerCelebration({ name, subtitle = '¡Ganador/a!', durationMs = 3500, onClose }) {
  useEffect(() => {
    let stop = () => {}
    ;(async () => {
      try {
        const confetti = (await import('canvas-confetti')).default
        const end = Date.now() + durationMs
        const id = setInterval(() => {
          confetti({
            particleCount: 50,
            spread: 70,
            startVelocity: 45,
            scalar: 0.9,
            origin: { x: Math.random() * 0.8 + 0.1, y: Math.random() * 0.2 + 0.05 }
          })
          if (Date.now() > end) clearInterval(id)
        }, 250)
        stop = () => clearInterval(id)
      } catch {
        // sin dependencia: se verá el fallback CSS (serpentinas) que definimos en styles.css
      }
    })()
    const t = setTimeout(() => onClose && onClose(), durationMs + 500)
    return () => { stop(); clearTimeout(t) }
  }, [durationMs, onClose])

  return (
    <div className="cele-overlay">
      <div className="cele-card">
        <div className="cele-emoji">🎉</div>
        <div className="cele-name">{name}</div>
        <div className="cele-sub">{subtitle}</div>
      </div>
      {/* fallback de serpentinas (CSS) */}
      <div className="serp s1" /><div className="serp s2" /><div className="serp s3" />
      <div className="serp s4" /><div className="serp s5" /><div className="serp s6" />
    </div>
  )
}
