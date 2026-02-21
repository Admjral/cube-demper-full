import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { useLang } from '../context/LangContext'
import ScrollRevealText from '../components/ScrollRevealText'

const rows = [
  { withoutKey: 'compare.row1.without', withKey: 'compare.row1.with' },
  { withoutKey: 'compare.row2.without', withKey: 'compare.row2.with' },
  { withoutKey: 'compare.row3.without', withKey: 'compare.row3.with' },
  { withoutKey: 'compare.row4.without', withKey: 'compare.row4.with' },
  { withoutKey: 'compare.row5.without', withKey: 'compare.row5.with' },
  { withoutKey: 'compare.row6.without', withKey: 'compare.row6.with' },
]

function ComparisonRow({ row }: { row: typeof rows[0] }) {
  const { t } = useLang()
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.95', 'start 0.6'],
  })

  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [0, 0.5, 1])
  const x = useTransform(scrollYProgress, [0, 1], [-30, 0])
  const bgOpacity = useTransform(scrollYProgress, [0.5, 1], [0, 1])

  return (
    <motion.div
      ref={ref}
      style={{ opacity, x }}
      className="grid grid-cols-1 sm:grid-cols-2 border-b border-border last:border-0"
    >
      <div className="p-2.5 sm:p-4 md:p-5 flex items-start gap-2 sm:gap-3">
        <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-400 mt-0.5 shrink-0" />
        <span className="text-sm sm:text-base text-muted-foreground">{t(row.withoutKey)}</span>
      </div>
      <motion.div
        style={{ backgroundColor: `oklch(0.45 0.15 145 / ${bgOpacity})` }}
        className="p-2.5 sm:p-4 md:p-5 flex items-start gap-2 sm:gap-3 border-t sm:border-t-0 sm:border-l border-border relative"
      >
        <div className="absolute inset-0 bg-success/5" />
        <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-400 mt-0.5 shrink-0 relative z-10" />
        <span className="text-sm sm:text-base text-foreground relative z-10">{t(row.withKey)}</span>
      </motion.div>
    </motion.div>
  )
}

export default function Comparison() {
  const { t } = useLang()
  const sectionRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 0.95', 'start 0.6'],
  })

  const cardScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.9, 0.95, 1])
  const cardOpacity = useTransform(scrollYProgress, [0, 0.3, 1], [0, 0.5, 1])

  return (
    <section className="py-12 md:py-20 lg:py-32 relative">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12 md:mb-16">
          <ScrollRevealText
            text={t('compare.title')}
            tag="h2"
            className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-foreground mb-4"
          />
          <ScrollRevealText
            text={t('compare.subtitle')}
            tag="p"
            className="text-base sm:text-lg text-muted-foreground"
          />
        </div>

        <motion.div
          ref={sectionRef}
          style={{ scale: cardScale, opacity: cardOpacity }}
          className="max-w-4xl mx-auto glass-card overflow-hidden relative"
        >
          {/* Glow effect */}
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[400px] h-[200px] rounded-full bg-[oklch(0.55_0.15_145/15%)] blur-[100px] pointer-events-none" />

          {/* Header */}
          <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-border relative z-10">
            <div className="p-2.5 sm:p-4 md:p-5 text-center">
              <span className="text-sm sm:text-base font-semibold text-red-400">
                {t('compare.without')}
              </span>
            </div>
            <div className="p-2.5 sm:p-4 md:p-5 text-center bg-success/5 border-t sm:border-t-0 sm:border-l border-border">
              <span className="text-sm sm:text-base font-semibold text-green-400">
                {t('compare.with')}
              </span>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <ComparisonRow key={i} row={row} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
