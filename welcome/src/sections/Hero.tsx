import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Play } from 'lucide-react'
import { useLang } from '../context/LangContext'
import AnimatedCounter from '../components/AnimatedCounter'
import GradientMesh from '../components/GradientMesh'
import GridPattern from '../components/GridPattern'

export default function Hero() {
  const { t } = useLang()

  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  })

  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.92])
  const opacity = useTransform(scrollYProgress, [0, 0.4], [1, 0])
  const y = useTransform(scrollYProgress, [0, 0.5], [0, -60])

  return (
    <section ref={sectionRef} className="relative min-h-screen flex items-center overflow-hidden">
      <GradientMesh variant="hero" />
      <GridPattern />

      <motion.div
        style={{ scale, opacity, y }}
        className="max-w-7xl mx-auto px-4 relative w-full pt-20 sm:pt-24 pb-10 sm:pb-16"
      >
        <div className="max-w-4xl mx-auto text-center">
          {/* Title — cinematic fade-in */}
          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-extrabold text-foreground tracking-tight mb-4 sm:mb-6 leading-[1.08]">
            <motion.span
              initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              className="inline-block"
            >
              {t('hero.title1')}
            </motion.span>
            <br />
            <motion.span
              initial={{ opacity: 0, y: 25, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.6, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="gradient-text inline-block"
            >
              {t('hero.title2')}
            </motion.span>
          </h1>

          {/* Subtitle — gentle float-in */}
          <motion.p
            initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.5, delay: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-sm sm:text-base md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-14"
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* CTA Buttons — staggered, slow scale-in */}
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-10 sm:mb-20"
          >
            <motion.a
              href="https://cube-demper.shop/register"
              whileHover={{ scale: 1.04, transition: { duration: 0.3 } }}
              whileTap={{ scale: 0.97 }}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:px-8 sm:py-4 text-sm sm:text-base font-semibold rounded-full bg-foreground text-background transition-shadow hover:shadow-[0_0_30px_oklch(0.65_0.15_290/30%)]"
            >
              {t('hero.cta1')}
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
            </motion.a>
            <motion.a
              href="#features"
              whileHover={{ scale: 1.04, transition: { duration: 0.3 } }}
              whileTap={{ scale: 0.97 }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:px-8 sm:py-4 text-sm sm:text-base font-semibold rounded-full border border-border text-foreground hover:bg-foreground/5 transition-all"
            >
              <Play className="h-5 w-5" />
              {t('hero.cta2')}
            </motion.a>
          </motion.div>

          {/* Stats — each one fades in separately with stagger */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 1.15 }}
            className="grid grid-cols-3 gap-3 sm:gap-8 pt-5 sm:pt-8 border-t border-border max-w-xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.25, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <AnimatedCounter target={500} suffix="+" label={t('hero.stat1.label')} duration={1500} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.35, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">2M+</p>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">{t('hero.stat2.label')}</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.45, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">24/7</p>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">{t('hero.stat3.label')}</p>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Scroll indicator — appears late, pulses gently */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
        style={{ opacity: useTransform(scrollYProgress, [0, 0.08], [1, 0]) }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="w-7 h-11 rounded-full border-2 border-foreground/15 flex items-start justify-center p-2"
        >
          <motion.div
            animate={{ opacity: [0.3, 0.8, 0.3], scaleY: [1, 1.5, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-1.5 h-1.5 rounded-full bg-foreground/40"
          />
        </motion.div>
      </motion.div>
    </section>
  )
}
