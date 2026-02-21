import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { UserPlus, Link, Settings, Zap } from 'lucide-react'
import { useLang } from '../context/LangContext'
import ScrollRevealText from '../components/ScrollRevealText'

const steps = [
  { icon: UserPlus, titleKey: 'how.step1.title', descKey: 'how.step1.desc', color: 'oklch(0.65 0.18 200)' },
  { icon: Link, titleKey: 'how.step2.title', descKey: 'how.step2.desc', color: 'oklch(0.65 0.18 145)' },
  { icon: Settings, titleKey: 'how.step3.title', descKey: 'how.step3.desc', color: 'oklch(0.65 0.18 270)' },
  { icon: Zap, titleKey: 'how.step4.title', descKey: 'how.step4.desc', color: 'oklch(0.65 0.18 55)' },
]

function StepCard({ step, index }: { step: typeof steps[0]; index: number }) {
  const { t } = useLang()
  const Icon = step.icon
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.95', 'start 0.6'],
  })

  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [0, 0.5, 1])
  const x = useTransform(scrollYProgress, [0, 1], [-40, 0])
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <motion.div
      ref={ref}
      style={{ opacity, x }}
      className="flex items-start gap-3 sm:gap-6 md:gap-8"
    >
      {/* Left: number + icon + line */}
      <div className="relative flex flex-col items-center shrink-0">
        <div
          className="w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-xl sm:rounded-2xl flex items-center justify-center border border-border relative z-10"
          style={{ background: `${step.color}12` }}
        >
          <Icon className="w-4.5 h-4.5 sm:w-7 sm:h-7 md:w-9 md:h-9" style={{ color: step.color }} />
        </div>
        <span
          className="absolute -top-1.5 -right-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[10px] sm:text-xs font-bold flex items-center justify-center z-20 text-background"
          style={{ background: step.color }}
        >
          {index + 1}
        </span>
        {/* Connecting line */}
        {index < steps.length - 1 && (
          <motion.div
            style={{ scaleY: lineScale, transformOrigin: 'top' }}
            className="w-0.5 h-16 md:h-20 mt-3"
            initial={{ background: `${step.color}30` }}
            animate={{ background: `${step.color}30` }}
          />
        )}
      </div>

      {/* Right: text */}
      <div className="pt-2 sm:pt-3 pb-6 sm:pb-8 md:pb-12">
        <h3 className="text-base sm:text-xl md:text-2xl font-bold text-foreground mb-1 sm:mb-2">
          {t(step.titleKey)}
        </h3>
        <p className="text-sm sm:text-base text-muted-foreground max-w-md">
          {t(step.descKey)}
        </p>
      </div>
    </motion.div>
  )
}

export default function HowItWorks() {
  const { t } = useLang()

  return (
    <section id="how-it-works" className="py-12 md:py-20 lg:py-32 relative">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16 md:mb-20">
          <ScrollRevealText
            text={t('how.title')}
            tag="h2"
            className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-foreground mb-4"
          />
          <ScrollRevealText
            text={t('how.subtitle')}
            tag="p"
            className="text-base sm:text-lg text-muted-foreground"
          />
        </div>

        <div className="max-w-2xl mx-auto">
          {steps.map((step, i) => (
            <StepCard key={i} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
