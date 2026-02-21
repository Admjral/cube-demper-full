import { useCountUp } from '../hooks/useCountUp'
import { useInView } from '../hooks/useInView'

interface Props {
  target: number
  suffix?: string
  label: string
  duration?: number
}

export default function AnimatedCounter({ target, suffix = '', label, duration = 1500 }: Props) {
  const { ref, inView } = useInView(0.3)
  const value = useCountUp(target, duration, inView)

  return (
    <div ref={ref}>
      <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">
        {value}{suffix}
      </p>
      <p className="text-sm sm:text-base text-muted-foreground mt-1">{label}</p>
    </div>
  )
}
