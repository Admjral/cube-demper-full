import { createContext, useContext, useState, type ReactNode } from 'react'
import { translations, type Lang } from '../data/translations'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const Ctx = createContext<LangCtx>({
  lang: 'ru',
  setLang: () => {},
  t: (k) => k,
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('ru')

  const t = (key: string): string => {
    return (translations[lang] as Record<string, string>)[key] ?? key
  }

  return (
    <Ctx.Provider value={{ lang, setLang, t }}>
      {children}
    </Ctx.Provider>
  )
}

export const useLang = () => useContext(Ctx)
