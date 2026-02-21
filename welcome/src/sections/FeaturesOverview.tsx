import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  Bot, BarChart3, Calculator, Package,
  MessageSquare, Link2, Scale,
} from 'lucide-react'
import { useLang } from '../context/LangContext'
import ScrollRevealText from '../components/ScrollRevealText'
import { features } from '../data/features'

const iconMap: Record<string, React.ElementType> = {
  Bot, BarChart3, Calculator, Package, MessageSquare, Link2, Scale,
}

// Each feature gets a unique accent color
const accentColors = [
  'oklch(0.65 0.18 270)',  // purple - demping
  'oklch(0.65 0.18 200)',  // blue - analytics
  'oklch(0.65 0.18 145)',  // green - unit
  'oklch(0.65 0.18 55)',   // yellow - preorders
  'oklch(0.65 0.18 170)',  // teal - whatsapp
  'oklch(0.65 0.18 30)',   // orange - multistore
  'oklch(0.65 0.18 320)',  // pink - lawyer
]

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const { t } = useLang()
  const Icon = iconMap[feature.icon]
  const cardRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start 0.95', 'start 0.6'],
  })

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.4, 1])
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.85, 0.95, 1])
  const x = useTransform(
    scrollYProgress,
    [0, 1],
    [index % 2 === 0 ? -60 : 60, 0]
  )

  return (
    <motion.div
      ref={cardRef}
      style={{ opacity, scale, x }}
      className="sticky top-[8vh] sm:top-[12vh] md:top-[20vh] mb-[8vh] sm:mb-[10vh] md:mb-[15vh]"
    >
      <div
        className="glass-card p-4 sm:p-8 md:p-12 max-w-4xl mx-auto relative overflow-hidden"
        style={{
          boxShadow: `0 0 80px ${accentColors[index]}10, 0 0 30px ${accentColors[index]}05`,
        }}
      >
        {/* Accent glow */}
        <div
          className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-[100px] opacity-20 pointer-events-none"
          style={{ background: accentColors[index] }}
        />

        <div className="relative flex flex-col md:flex-row items-start gap-3 sm:gap-6 md:gap-10">
          {/* Icon */}
          <div
            className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 border border-border"
            style={{ background: `${accentColors[index]}12` }}
          >
            {Icon && <Icon className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10" style={{ color: accentColors[index] }} />}
          </div>

          {/* Content */}
          <div className="flex-1">
            <h3 className="text-lg sm:text-2xl md:text-3xl font-bold text-foreground mb-1.5 sm:mb-3">
              {t(feature.titleKey)}
            </h3>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed">
              {t(feature.descKey)}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function FeaturesOverview() {
  const { t } = useLang()

  return (
    <section id="features" className="relative">
      {/* Section heading */}
      <div className="py-12 md:py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <ScrollRevealText
            text={t('features.title')}
            tag="h2"
            className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground mb-4 sm:mb-6 leading-tight"
          />
          <ScrollRevealText
            text={t('features.subtitle')}
            tag="p"
            className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
          />
        </div>
      </div>

      {/* Sticky scrolling cards */}
      <div className="max-w-7xl mx-auto px-4 pb-[15vh]">
        {features.map((f, i) => (
          <FeatureCard key={f.id} feature={f} index={i} />
        ))}
      </div>
    </section>
  )
}
