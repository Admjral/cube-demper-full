import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

interface Props {
  variant?: 'hero' | 'default' | 'cta'
}

export default function GradientMesh({ variant = 'default' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -80])
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -120])
  const y3 = useTransform(scrollYProgress, [0, 1], [0, -50])

  if (variant === 'hero') {
    return (
      <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          style={{ y: y1 }}
          className="absolute -top-[200px] left-[10%] w-[700px] h-[700px] rounded-full bg-[oklch(0.50_0.15_270/18%)] blur-[140px] animate-float"
        />
        <motion.div
          style={{ y: y2 }}
          className="absolute -top-[100px] right-[5%] w-[600px] h-[600px] rounded-full bg-[oklch(0.55_0.18_310/14%)] blur-[120px] animate-float"
          initial={{ animationDelay: '-4s' }}
        />
        <motion.div
          style={{ y: y3 }}
          className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-[oklch(0.45_0.10_240/10%)] blur-[160px]"
        />
        {/* Radial gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>
    )
  }

  if (variant === 'cta') {
    return (
      <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          style={{ y: y1 }}
          className="absolute top-[10%] left-[20%] w-[500px] h-[500px] rounded-full bg-[oklch(0.55_0.20_290/20%)] blur-[120px] animate-float"
        />
        <motion.div
          style={{ y: y2 }}
          className="absolute bottom-[10%] right-[20%] w-[400px] h-[400px] rounded-full bg-[oklch(0.60_0.18_320/15%)] blur-[100px] animate-float"
          initial={{ animationDelay: '-2s' }}
        />
      </div>
    )
  }

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        style={{ y: y1 }}
        className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[oklch(0.55_0.12_280/15%)] blur-[120px] animate-float"
      />
      <motion.div
        style={{ y: y2 }}
        className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-[oklch(0.60_0.15_310/12%)] blur-[100px] animate-float"
        initial={{ animationDelay: '-3s' }}
      />
      <motion.div
        style={{ y: y3 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[oklch(0.50_0.08_250/8%)] blur-[150px]"
      />
    </div>
  )
}
