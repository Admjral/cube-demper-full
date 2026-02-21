import { useLang } from '../context/LangContext'
import { useTheme } from '../context/ThemeContext'

const socialLinks = [
  { label: 'WhatsApp', href: 'https://wa.me/77476117623' },
  { label: 'Telegram', href: 'https://t.me/demper_support' },
  { label: 'Instagram', href: 'https://instagram.com/cube_demper' },
  { label: 'Email', href: 'mailto:support@demper.kz' },
]

export default function Footer() {
  const { t } = useLang()
  const { theme } = useTheme()
  const year = new Date().getFullYear()
  const base = import.meta.env.BASE_URL
  const logoSrc = theme === 'dark' ? `${base}logowhite.svg` : `${base}logodark.svg`

  return (
    <footer className="border-t border-border py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="mb-2 sm:mb-3">
              <img src={logoSrc} alt="Cube Demper" className="h-6 sm:h-7 w-auto" />
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('footer.madeIn')}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t('footer.product')}</h4>
            <ul className="space-y-2">
              <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('nav.features')}</a></li>
              <li><a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('nav.pricing')}</a></li>
              <li><a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('nav.faq')}</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t('footer.legal')}</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.terms')}</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.privacy')}</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t('footer.offer')}</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t('footer.support')}</h4>
            <ul className="space-y-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-6 text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {year} Cube Demper. {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  )
}
