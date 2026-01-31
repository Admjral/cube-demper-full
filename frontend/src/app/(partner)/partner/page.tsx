'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { partnerApi } from '@/hooks/use-partner-auth'
import {
  MousePointer,
  UserPlus,
  CreditCard,
  Wallet,
  Copy,
  Check,
  Loader2,
} from 'lucide-react'

interface PartnerStats {
  clicks: number
  registrations: number
  paid_users: number
  total_earned: number
  available_balance: number
  total_withdrawn: number
}

interface PromoCode {
  promo_code: string | null
  referral_link: string | null
}

export default function PartnerDashboardPage() {
  const [stats, setStats] = useState<PartnerStats | null>(null)
  const [promoCode, setPromoCode] = useState<PromoCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsData, promoData] = await Promise.all([
          partnerApi<PartnerStats>('/partner/stats'),
          partnerApi<PromoCode>('/partner/promo-code'),
        ])
        setStats(statsData)
        setPromoCode(promoData)
      } catch (error) {
        console.error('Failed to fetch partner data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const statCards = [
    {
      title: 'Клики по ссылке',
      value: stats?.clicks ?? 0,
      icon: MousePointer,
      color: 'text-blue-500',
    },
    {
      title: 'Регистрации',
      value: stats?.registrations ?? 0,
      icon: UserPlus,
      color: 'text-green-500',
    },
    {
      title: 'Оплатили',
      value: stats?.paid_users ?? 0,
      icon: CreditCard,
      color: 'text-purple-500',
    },
    {
      title: 'Доступно к выводу',
      value: `${((stats?.available_balance ?? 0) / 100).toLocaleString()} ₸`,
      icon: Wallet,
      color: 'text-orange-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Партнёрский кабинет</h1>
        <p className="text-muted-foreground">Статистика и управление партнёрской программой</p>
      </div>

      {/* Referral Link */}
      {promoCode?.referral_link && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Ваша реферальная ссылка</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm overflow-x-auto">
                {promoCode.referral_link}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(promoCode.referral_link!)}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {promoCode.promo_code && (
              <p className="mt-2 text-sm text-muted-foreground">
                Промокод: <span className="font-mono font-medium">{promoCode.promo_code}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Earnings Summary */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Заработок</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Всего заработано</p>
              <p className="text-xl font-semibold mt-1">
                {((stats?.total_earned ?? 0) / 100).toLocaleString()} ₸
              </p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Выведено</p>
              <p className="text-xl font-semibold mt-1">
                {((stats?.total_withdrawn ?? 0) / 100).toLocaleString()} ₸
              </p>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg">
              <p className="text-sm text-primary">Доступно к выводу</p>
              <p className="text-xl font-semibold mt-1 text-primary">
                {((stats?.available_balance ?? 0) / 100).toLocaleString()} ₸
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
