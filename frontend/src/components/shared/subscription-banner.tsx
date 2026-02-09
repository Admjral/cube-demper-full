'use client'

import Link from 'next/link'
import { AlertTriangle, XCircle } from 'lucide-react'
import { useFeatures } from '@/hooks/api/use-features'
import { getDaysRemaining } from '@/lib/features'

/**
 * Banner that shows subscription expiration warnings in the dashboard layout.
 * - Yellow when <= 3 days remaining
 * - Red when expired
 * - Hidden otherwise
 */
export function SubscriptionBanner() {
  const { data: features } = useFeatures()

  if (!features) return null

  // Only show for users who have/had a paid plan (not free)
  if (!features.plan_code || features.plan_code === 'free') return null

  const dateStr = features.is_trial ? features.trial_ends_at : features.subscription_ends_at
  const days = getDaysRemaining(dateStr)

  if (days === null) return null

  // Expired
  if (days <= 0) {
    return (
      <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2">
        <div className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>
            {features.is_trial ? 'Пробный период истёк.' : 'Подписка истекла.'}{' '}
            Доступ ограничен.
          </span>
          <Link href="/dashboard/billing" className="underline font-medium ml-1">
            Продлить
          </Link>
        </div>
      </div>
    )
  }

  // Warning: 3 days or less
  if (days <= 3) {
    return (
      <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2">
        <div className="flex items-center justify-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {features.is_trial ? 'Пробный период' : 'Подписка'} заканчивается через{' '}
            {days === 1 ? '1 день' : `${days} дня`}.
          </span>
          <Link href="/dashboard/billing" className="underline font-medium ml-1">
            Продлить
          </Link>
        </div>
      </div>
    )
  }

  return null
}
