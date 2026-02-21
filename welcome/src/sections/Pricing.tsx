import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { plans, addons } from '../data/pricing'
import ScrollRevealText from '../components/ScrollRevealText'

function PlanCard({ plan, lang, t }: { plan: typeof plans[0]; lang: string; t: (k: string) => string }) {
  return (
    <div
      className={`rounded-xl sm:rounded-2xl p-3 sm:p-6 md:p-8 relative transition-shadow h-full flex flex-col ${
        plan.popular
          ? 'ring-2 ring-foreground/20 glow-border border border-foreground/15 bg-secondary shadow-xl'
          : 'border border-foreground/10 bg-secondary shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5 sm:mb-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <h3 className="text-base sm:text-xl font-semibold text-foreground">{plan.name}</h3>
          {plan.popular && (
            <span className="px-2 sm:px-2.5 py-0.5 bg-foreground text-background text-[10px] sm:text-xs font-medium rounded-full whitespace-nowrap">
              {t('pricing.popular')}
            </span>
          )}
        </div>
        <div className="text-right sm:hidden shrink-0">
          <span className="text-base font-bold text-foreground">{plan.price}</span>
          <span className="text-[10px] text-muted-foreground">{t('pricing.currency')}{t('pricing.period')}</span>
        </div>
      </div>

      <p className="hidden sm:block text-sm sm:text-base text-muted-foreground leading-relaxed line-clamp-2 mb-5">
        {lang === 'ru' ? plan.descriptionRu : plan.descriptionKz}
      </p>

      <div className="hidden sm:block mb-8">
        <span className="text-4xl font-bold text-foreground">{plan.price}</span>
        <span className="text-base text-muted-foreground">{t('pricing.currency')}{t('pricing.period')}</span>
      </div>

      <ul className="space-y-1.5 sm:space-y-3 mb-3 sm:mb-8 flex-1">
        {plan.features.map((f) => (
          <li key={f.ru} className="flex items-center gap-2 sm:gap-2.5 text-xs sm:text-base">
            <Check className="h-3 w-3 sm:h-4 sm:w-4 text-green-400 shrink-0" />
            <span className="text-muted-foreground leading-tight">{lang === 'ru' ? f.ru : f.kz}</span>
          </li>
        ))}
      </ul>

      <a
        href="https://cube-demper.shop/register"
        className={`block w-full text-center py-2 sm:py-3 rounded-full text-xs sm:text-base font-medium transition-all ${
          plan.popular
            ? 'bg-foreground text-background hover:opacity-90'
            : 'border border-border text-foreground hover:bg-foreground/5'
        }`}
      >
        {t('pricing.cta')}
      </a>
    </div>
  )
}

export default function Pricing() {
  const { lang, t } = useLang()
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <section id="pricing" className="py-12 md:py-20 lg:py-32 relative">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-12">
          <ScrollRevealText
            text={t('pricing.title')}
            tag="h2"
            className="text-2xl sm:text-3xl md:text-5xl font-extrabold text-foreground mb-3 sm:mb-4"
          />
          <ScrollRevealText
            text={t('pricing.subtitle')}
            tag="p"
            className="text-sm sm:text-lg text-muted-foreground"
          />
        </div>

        {/* Plans — horizontal scroll on mobile, grid on desktop */}
        <div
          ref={scrollRef}
          className="flex md:grid md:grid-cols-3 gap-3 sm:gap-6 mb-8 sm:mb-16 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible pb-3 md:pb-0 items-stretch"
        >
          {plans.map((plan) => (
            <div key={plan.name} className="min-w-[75vw] sm:min-w-[60vw] md:min-w-0 snap-center shrink-0 md:shrink">
              <PlanCard plan={plan} lang={lang} t={t} />
            </div>
          ))}
        </div>

        {/* Scroll dots — mobile only */}
        <div className="flex md:hidden justify-center gap-2 mb-8 sm:mb-12">
          {plans.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                const container = scrollRef.current
                if (!container) return
                const card = container.children[i] as HTMLElement
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
              className="w-2 h-2 rounded-full bg-foreground/20"
            />
          ))}
        </div>

        {/* Addons */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-base sm:text-xl font-semibold text-foreground text-center mb-3 sm:mb-6">
            {t('pricing.addons')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4">
            {addons.map((addon) => (
              <motion.div
                key={addon.nameRu}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className="rounded-lg sm:rounded-2xl border border-foreground/10 bg-secondary shadow-md p-2.5 sm:p-4 text-center"
              >
                <h4 className="font-medium text-foreground text-xs sm:text-base leading-tight">
                  {lang === 'ru' ? addon.nameRu : addon.nameKz}
                </h4>
                <p className="text-base sm:text-2xl font-bold text-foreground mt-1">
                  {addon.price}
                  <span className="text-xs sm:text-sm font-normal text-muted-foreground">{t('pricing.currency')}</span>
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-tight">
                  {lang === 'ru' ? addon.descRu : addon.descKz}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
