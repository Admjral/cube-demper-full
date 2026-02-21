export const features = [
  {
    id: 'demping',
    icon: 'Bot',
    titleKey: 'features.demping.title',
    descKey: 'features.demping.desc',
    span: 'col-span-2',
  },
  {
    id: 'analytics',
    icon: 'BarChart3',
    titleKey: 'features.analytics.title',
    descKey: 'features.analytics.desc',
    span: 'col-span-1',
  },
  {
    id: 'unit',
    icon: 'Calculator',
    titleKey: 'features.unit.title',
    descKey: 'features.unit.desc',
    span: 'col-span-1',
  },
  {
    id: 'preorders',
    icon: 'Package',
    titleKey: 'features.preorders.title',
    descKey: 'features.preorders.desc',
    span: 'col-span-1',
  },
  {
    id: 'whatsapp',
    icon: 'MessageSquare',
    titleKey: 'features.whatsapp.title',
    descKey: 'features.whatsapp.desc',
    span: 'col-span-1',
  },
  {
    id: 'multistore',
    icon: 'Link2',
    titleKey: 'features.multistore.title',
    descKey: 'features.multistore.desc',
    span: 'col-span-1',
  },
  {
    id: 'lawyer',
    icon: 'Scale',
    titleKey: 'features.lawyer.title',
    descKey: 'features.lawyer.desc',
    span: 'col-span-1',
  },
]

export interface HeroCard {
  icon: string
  titleKey: string
  descKey: string
  stat?: string
  statLabel?: string
}

export interface ModuleData {
  id: string
  labelKey: string
  titleKey: string
  descKey: string
  screenshotPath?: string
  heroCards: HeroCard[]
  bulletKeys: string[]
}

export const modules: ModuleData[] = [
  {
    id: 'demping',
    labelKey: 'features.demping.title',
    titleKey: 'modules.demping.title',
    descKey: 'modules.demping.desc',
    screenshotPath: '/screenshots/demping.png',
    heroCards: [
      { icon: 'Crosshair', titleKey: 'modules.demping.h1.title', descKey: 'modules.demping.h1.desc', stat: '3', statLabel: 'стратегии' },
      { icon: 'MapPin', titleKey: 'modules.demping.h2.title', descKey: 'modules.demping.h2.desc', stat: '25+', statLabel: 'городов' },
      { icon: 'Truck', titleKey: 'modules.demping.h3.title', descKey: 'modules.demping.h3.desc' },
      { icon: 'Shield', titleKey: 'modules.demping.h4.title', descKey: 'modules.demping.h4.desc' },
    ],
    bulletKeys: [
      'modules.demping.b1', 'modules.demping.b2', 'modules.demping.b3',
      'modules.demping.b4', 'modules.demping.b5', 'modules.demping.b6',
    ],
  },
  {
    id: 'analytics',
    labelKey: 'features.analytics.title',
    titleKey: 'modules.analytics.title',
    descKey: 'modules.analytics.desc',
    screenshotPath: '/screenshots/analytics.png',
    heroCards: [
      { icon: 'Funnel', titleKey: 'modules.analytics.h1.title', descKey: 'modules.analytics.h1.desc' },
      { icon: 'TrendingUp', titleKey: 'modules.analytics.h2.title', descKey: 'modules.analytics.h2.desc' },
      { icon: 'PieChart', titleKey: 'modules.analytics.h3.title', descKey: 'modules.analytics.h3.desc' },
      { icon: 'RefreshCw', titleKey: 'modules.analytics.h4.title', descKey: 'modules.analytics.h4.desc', stat: '8', statLabel: 'мин' },
    ],
    bulletKeys: [
      'modules.analytics.b1', 'modules.analytics.b2', 'modules.analytics.b3',
    ],
  },
  {
    id: 'unit',
    labelKey: 'features.unit.title',
    titleKey: 'modules.unit.title',
    descKey: 'modules.unit.desc',
    screenshotPath: '/screenshots/unit-economics.png',
    heroCards: [
      { icon: 'Calculator', titleKey: 'modules.unit.h1.title', descKey: 'modules.unit.h1.desc' },
      { icon: 'Truck', titleKey: 'modules.unit.h2.title', descKey: 'modules.unit.h2.desc', stat: '6', statLabel: 'сценариев' },
      { icon: 'Receipt', titleKey: 'modules.unit.h3.title', descKey: 'modules.unit.h3.desc', stat: '6', statLabel: 'режимов' },
      { icon: 'Link', titleKey: 'modules.unit.h4.title', descKey: 'modules.unit.h4.desc' },
    ],
    bulletKeys: [
      'modules.unit.b1', 'modules.unit.b2', 'modules.unit.b3', 'modules.unit.b4',
    ],
  },
  {
    id: 'preorders',
    labelKey: 'features.preorders.title',
    titleKey: 'modules.preorders.title',
    descKey: 'modules.preorders.desc',
    screenshotPath: '/screenshots/preorders.png',
    heroCards: [
      { icon: 'CalendarClock', titleKey: 'modules.preorders.h1.title', descKey: 'modules.preorders.h1.desc', stat: '1–30', statLabel: 'дней' },
      { icon: 'ScanSearch', titleKey: 'modules.preorders.h2.title', descKey: 'modules.preorders.h2.desc', stat: '5', statLabel: 'мин' },
      { icon: 'Bell', titleKey: 'modules.preorders.h3.title', descKey: 'modules.preorders.h3.desc' },
    ],
    bulletKeys: [
      'modules.preorders.b1', 'modules.preorders.b2', 'modules.preorders.b3',
    ],
  },
  {
    id: 'whatsapp',
    labelKey: 'features.whatsapp.title',
    titleKey: 'modules.whatsapp.title',
    descKey: 'modules.whatsapp.desc',
    screenshotPath: '/screenshots/whatsapp.png',
    heroCards: [
      { icon: 'Zap', titleKey: 'modules.whatsapp.h1.title', descKey: 'modules.whatsapp.h1.desc' },
      { icon: 'Send', titleKey: 'modules.whatsapp.h2.title', descKey: 'modules.whatsapp.h2.desc' },
      { icon: 'Users', titleKey: 'modules.whatsapp.h3.title', descKey: 'modules.whatsapp.h3.desc' },
      { icon: 'BrainCircuit', titleKey: 'modules.whatsapp.h4.title', descKey: 'modules.whatsapp.h4.desc' },
    ],
    bulletKeys: [
      'modules.whatsapp.b1', 'modules.whatsapp.b2', 'modules.whatsapp.b3', 'modules.whatsapp.b4',
    ],
  },
  {
    id: 'lawyer',
    labelKey: 'features.lawyer.title',
    titleKey: 'modules.lawyer.title',
    descKey: 'modules.lawyer.desc',
    screenshotPath: '/screenshots/lawyer.png',
    heroCards: [
      { icon: 'MessageCircle', titleKey: 'modules.lawyer.h1.title', descKey: 'modules.lawyer.h1.desc' },
      { icon: 'FileText', titleKey: 'modules.lawyer.h2.title', descKey: 'modules.lawyer.h2.desc', stat: '15', statLabel: 'типов' },
      { icon: 'ScanEye', titleKey: 'modules.lawyer.h3.title', descKey: 'modules.lawyer.h3.desc' },
      { icon: 'CalculatorIcon', titleKey: 'modules.lawyer.h4.title', descKey: 'modules.lawyer.h4.desc' },
    ],
    bulletKeys: [
      'modules.lawyer.b1', 'modules.lawyer.b2', 'modules.lawyer.b3', 'modules.lawyer.b4',
    ],
  },
]
