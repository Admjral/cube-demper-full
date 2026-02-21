import { useEffect, useState } from 'react'

export function useCountUp(target: number, duration = 2500, start = false) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!start) return

    let startTime: number | null = null
    let raf: number

    const step = (ts: number) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      // easeOutExpo — fast start, very slow end (satisfying deceleration)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, start])

  return value
}
