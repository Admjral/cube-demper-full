import { useState, useEffect } from 'react'

interface Props {
  text: string
  speed?: number
  className?: string
  onDone?: () => void
}

export default function TypeWriter({ text, speed = 50, className = '', onDone }: Props) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0

    const type = () => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1))
        i++
        // Slight randomness for natural feel (±15ms)
        const jitter = Math.random() * 30 - 15
        setTimeout(type, speed + jitter)
      } else {
        setDone(true)
        onDone?.()
      }
    }

    const startDelay = setTimeout(type, speed)
    return () => clearTimeout(startDelay)
  }, [text, speed])

  return (
    <span className={className}>
      {displayed}
      {!done && <span className="animate-blink ml-0.5 text-foreground/40">|</span>}
    </span>
  )
}
