import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { useTheme } from '../context/ThemeContext'

const navItems = [
  { key: 'nav.features', href: '#features' },
  { key: 'nav.howItWorks', href: '#how-it-works' },
  { key: 'nav.modules', href: '#modules' },
  { key: 'nav.pricing', href: '#pricing' },
  { key: 'nav.faq', href: '#faq' },
]

export default function Header() {
  const { lang, setLang, t } = useLang()
  const { theme, toggleTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const base = import.meta.env.BASE_URL
  const logoSrc = theme === 'dark' ? `${base}logowhite.svg` : `${base}logodark.svg`

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'glass-header py-2 sm:py-3' : 'py-3 sm:py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center">
          <img src={logoSrc} alt="Cube Demper" className="h-7 sm:h-9 w-auto" />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t(item.key)}
            </a>
          ))}
        </nav>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Lang toggle */}
          <button
            onClick={() => setLang(lang === 'ru' ? 'kz' : 'ru')}
            className="px-2.5 py-1 text-xs font-medium rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            {lang === 'ru' ? 'KZ' : 'RU'}
          </button>

          <a
            href="https://cube-demper.shop/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('nav.signIn')}
          </a>
          <a
            href="https://cube-demper.shop/register"
            className="px-5 py-2 text-sm font-medium rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            {t('nav.startFree')}
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden mx-4 mt-2 overflow-hidden glass-card"
          >
            <nav className="flex flex-col p-4 gap-3">
              {navItems.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                  onClick={() => setMobileOpen(false)}
                >
                  {t(item.key)}
                </a>
              ))}
              <hr className="border-border" />
              <div className="flex items-center gap-3">
                {/* Theme toggle mobile */}
                <button
                  onClick={toggleTheme}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-muted-foreground"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setLang(lang === 'ru' ? 'kz' : 'ru')}
                  className="px-2.5 py-1 text-xs font-medium rounded-full border border-border text-muted-foreground"
                >
                  {lang === 'ru' ? 'KZ' : 'RU'}
                </button>
                <a
                  href="https://cube-demper.shop/login"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('nav.signIn')}
                </a>
              </div>
              <a
                href="https://cube-demper.shop/register"
                className="px-5 py-2 text-sm font-medium rounded-full bg-foreground text-background text-center"
              >
                {t('nav.startFree')}
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
