import { useState, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { faqs } from '../data/faq'
import ScrollRevealText from '../components/ScrollRevealText'

function FAQItem({ faq, isOpen, onToggle, lang }: {
  faq: typeof faqs[0]
  isOpen: boolean
  onToggle: () => void
  lang: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.95', 'start 0.6'],
  })

  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [0, 0.5, 1])
  const x = useTransform(scrollYProgress, [0, 1], [-20, 0])

  const question = lang === 'ru' ? faq.questionRu : faq.questionKz
  const answer = lang === 'ru' ? faq.answerRu : faq.answerKz

  return (
    <motion.div
      ref={ref}
      style={{ opacity, x }}
      className="glass-card overflow-hidden"
    >
      <button
        className="w-full p-3 sm:p-4 md:p-5 text-left flex items-center justify-between gap-3 sm:gap-4"
        onClick={onToggle}
      >
        <span className="font-medium text-foreground text-sm sm:text-base">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25 }}
        >
          <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-3 sm:px-4 md:px-5 pb-3 sm:pb-4 md:pb-5 text-sm sm:text-base text-muted-foreground">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FAQ() {
  const { lang, t } = useLang()
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq" className="py-12 md:py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12 md:mb-16">
          <ScrollRevealText
            text={t('faq.title')}
            tag="h2"
            className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-foreground mb-4"
          />
          <ScrollRevealText
            text={t('faq.subtitle')}
            tag="p"
            className="text-base sm:text-lg text-muted-foreground"
          />
        </div>

        <div className="max-w-3xl mx-auto space-y-2 sm:space-y-3">
          {faqs.map((faq, i) => (
            <FAQItem
              key={i}
              faq={faq}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              lang={lang}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
