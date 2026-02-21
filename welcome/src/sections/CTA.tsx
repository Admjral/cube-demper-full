import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useLang } from '../context/LangContext'
import GradientMesh from '../components/GradientMesh'
import ScrollRevealText from '../components/ScrollRevealText'

export default function CTA() {
  const { t } = useLang()
  const sectionRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 0.95', 'start 0.6'],
  })

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.85, 0.95, 1])
  const opacity = useTransform(scrollYProgress, [0, 0.4, 1], [0, 0.5, 1])
  const glowOpacity = useTransform(scrollYProgress, [0.3, 1], [0, 0.6])

  return (
    <section className="py-12 md:py-20 lg:py-32 relative overflow-hidden">
      <GradientMesh variant="cta" />

      <div className="max-w-7xl mx-auto px-4 relative">
        <motion.div
          ref={sectionRef}
          style={{ scale, opacity }}
          className="relative max-w-3xl mx-auto"
        >
          {/* Animated glow border */}
          <motion.div
            style={{ opacity: glowOpacity }}
            className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-[oklch(0.65_0.20_270)] via-[oklch(0.65_0.20_310)] to-[oklch(0.65_0.20_200)] blur-sm"
          />

          <div className="glass-card p-5 sm:p-10 md:p-16 text-center relative rounded-xl sm:rounded-3xl">
            {/* Sparkle badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-foreground/5 border border-border text-foreground/70 text-xs sm:text-sm font-medium mb-5 sm:mb-8"
            >
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>{t('cta.badge')}</span>
            </motion.div>

            <ScrollRevealText
              text={t('cta.title')}
              tag="h2"
              className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-foreground mb-4"
            />
            <ScrollRevealText
              text={t('cta.subtitle')}
              tag="p"
              className="text-base sm:text-lg text-muted-foreground mb-5 sm:mb-10 max-w-xl mx-auto"
            />

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
            >
              <a
                href="https://cube-demper.shop/register"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:px-8 sm:py-4 text-sm sm:text-base font-semibold rounded-full bg-foreground text-background hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                {t('cta.button')}
                <ArrowRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a
                href="https://wa.me/77476117623"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:px-8 sm:py-4 text-sm sm:text-base font-semibold rounded-full border border-border text-foreground hover:bg-foreground/5 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {t('cta.contact')}
              </a>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
