import { useState, useRef } from 'react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import {
  Crosshair, MapPin, Truck, Shield, Funnel, TrendingUp, PieChart, RefreshCw,
  Calculator, Receipt, Link, CalendarClock, ScanSearch, Bell, Zap, Send,
  Users, BrainCircuit, MessageCircle, FileText, ScanEye,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useLang } from '../context/LangContext'
import { modules } from '../data/features'
import ScrollRevealText from '../components/ScrollRevealText'
import type { HeroCard } from '../data/features'

const iconMap: Record<string, React.ElementType> = {
  Crosshair, MapPin, Truck, Shield, Funnel, TrendingUp, PieChart, RefreshCw,
  Calculator, Receipt, Link, CalendarClock, ScanSearch, Bell, Zap, Send,
  Users, BrainCircuit, MessageCircle, FileText, ScanEye,
  CalculatorIcon: Calculator,
}

const tabColors = [
  'oklch(0.65 0.18 270)',
  'oklch(0.65 0.18 200)',
  'oklch(0.65 0.18 145)',
  'oklch(0.65 0.18 55)',
  'oklch(0.65 0.18 170)',
  'oklch(0.65 0.18 320)',
]

function HeroFeatureCard({ card, index, color, t }: {
  card: HeroCard; index: number; color: string; t: (k: string) => string
}) {
  const Icon = iconMap[card.icon]

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      className="glass-card p-3 sm:p-5 relative overflow-hidden group hover:border-foreground/15 transition-colors"
    >
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[60px] opacity-0 group-hover:opacity-20 pointer-events-none transition-opacity duration-500"
        style={{ background: color }}
      />

      <div className="relative flex items-start gap-2.5 sm:gap-4">
        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 border border-border"
          style={{ background: `${color}12` }}
        >
          {Icon && <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color }} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-foreground text-sm sm:text-base">{t(card.titleKey)}</h4>
            {card.stat && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                style={{ color, background: `${color}15` }}
              >
                {card.stat} {card.statLabel}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{t(card.descKey)}</p>
        </div>
      </div>
    </motion.div>
  )
}

// Swipe direction: 1 = next, -1 = prev
const swipeVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -200 : 200, opacity: 0 }),
}

export default function ModulesShowcase() {
  const { t } = useLang()
  const [activeIdx, setActiveIdx] = useState(0)
  const [direction, setDirection] = useState(0)
  const tabsRef = useRef<HTMLDivElement>(null)
  const active = modules[activeIdx]
  const activeColor = tabColors[activeIdx] || tabColors[0]

  const goTo = (idx: number) => {
    if (idx === activeIdx || idx < 0 || idx >= modules.length) return
    setDirection(idx > activeIdx ? 1 : -1)
    setActiveIdx(idx)
  }

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = 50
    if (info.offset.x < -threshold && activeIdx < modules.length - 1) {
      goTo(activeIdx + 1)
    } else if (info.offset.x > threshold && activeIdx > 0) {
      goTo(activeIdx - 1)
    }
  }

  return (
    <section id="modules" className="py-12 md:py-20 lg:py-32 relative">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 md:mb-16">
          <ScrollRevealText
            text={t('modules.title')}
            tag="h2"
            className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-foreground mb-4"
          />
          <ScrollRevealText
            text={t('modules.subtitle')}
            tag="p"
            className="text-base sm:text-lg text-muted-foreground"
          />
        </div>

        {/* Sticky tabs */}
        <div
          ref={tabsRef}
          className="sticky top-12 sm:top-14 z-30 py-2 sm:py-3 -mx-4 px-4 bg-background/80 backdrop-blur-lg border-b border-border/50"
        >
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar md:justify-center">
            {modules.map((m, i) => (
              <button
                key={m.id}
                onClick={() => goTo(i)}
                className={`px-2.5 py-1 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  i === activeIdx
                    ? 'text-background'
                    : 'bg-foreground/5 text-muted-foreground hover:text-foreground border border-border'
                }`}
                style={i === activeIdx ? { background: tabColors[i] } : undefined}
              >
                {t(m.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Swipeable content */}
        <div className="overflow-hidden mt-6 sm:mt-8">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={active.id}
              custom={direction}
              variants={swipeVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={handleDragEnd}
              className="max-w-5xl mx-auto touch-pan-y cursor-grab active:cursor-grabbing"
            >
              {/* Header */}
              <div className="mb-5 sm:mb-8 text-center">
                <h3 className="text-lg sm:text-2xl md:text-3xl font-bold text-foreground mb-1.5 sm:mb-2">
                  {t(active.titleKey)}
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
                  {t(active.descKey)}
                </p>
              </div>

              {/* Hero feature cards grid */}
              <div className={`grid gap-3 sm:gap-4 mb-4 sm:mb-6 ${
                active.heroCards.length === 3
                  ? 'md:grid-cols-3'
                  : 'md:grid-cols-2'
              }`}>
                {active.heroCards.map((card, i) => (
                  <HeroFeatureCard
                    key={card.titleKey}
                    card={card}
                    index={i}
                    color={activeColor}
                    t={t}
                  />
                ))}
              </div>

            </motion.div>
          </AnimatePresence>

          {/* Navigation arrows + dots */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mt-6 sm:mt-8">
            <button
              onClick={() => goTo(activeIdx - 1)}
              disabled={activeIdx === 0}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <div className="flex gap-2">
              {modules.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className="w-2 h-2 rounded-full transition-all duration-300"
                  style={{
                    background: i === activeIdx ? tabColors[i] : 'var(--border)',
                    transform: i === activeIdx ? 'scale(1.4)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            <button
              onClick={() => goTo(activeIdx + 1)}
              disabled={activeIdx === modules.length - 1}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
