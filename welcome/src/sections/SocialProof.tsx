import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useLang } from '../context/LangContext'

const stats = [
  { value: '500+', labelRu: 'Селлеров', labelKz: 'Сатушылар' },
  { value: '2M+', labelRu: 'Товаров', labelKz: 'Тауарлар' },
  { value: '24/7', labelRu: 'Мониторинг', labelKz: 'Мониторинг' },
  { value: '99.9%', labelRu: 'Uptime', labelKz: 'Uptime' },
  { value: '<1с', labelRu: 'Реакция бота', labelKz: 'Бот реакциясы' },
  { value: '7+', labelRu: 'Модулей', labelKz: 'Модульдер' },
]

export default function SocialProof() {
  const { lang, t } = useLang()
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.95', 'start 0.6'],
  })

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.6, 1])
  const y = useTransform(scrollYProgress, [0, 1], [20, 0])

  return (
    <section ref={ref} className="py-6 sm:py-8 md:py-12 border-y border-border overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <motion.p
          style={{ opacity, y }}
          className="text-center text-sm sm:text-base text-muted-foreground mb-5 sm:mb-8"
        >
          {t('social.trust')}
        </motion.p>

        {/* Marquee */}
        <div className="relative overflow-hidden">
          {/* Edge fades */}
          <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

          <div className="flex animate-marquee gap-3 sm:gap-12 whitespace-nowrap">
            {[...stats, ...stats].map((s, i) => (
              <div key={i} className="flex items-center gap-1 sm:gap-3 px-2 sm:px-6 py-1 sm:py-3 glass-card shrink-0">
                <span className="text-base sm:text-xl font-bold text-foreground">{s.value}</span>
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {lang === 'ru' ? s.labelRu : s.labelKz}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
