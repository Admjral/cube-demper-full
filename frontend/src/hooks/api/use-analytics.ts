'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { SalesAnalytics, TopProduct, OrderPipeline, OrderBreakdowns } from '@/types/api'

// Query keys
export const analyticsKeys = {
  all: ['analytics'] as const,
  sales: (storeId: string, period: string) => [...analyticsKeys.all, 'sales', storeId, period] as const,
  topProducts: (storeId: string, period: string = '7d') => [...analyticsKeys.all, 'top-products', storeId, period] as const,
  pipeline: (storeId: string, period: string) => [...analyticsKeys.all, 'pipeline', storeId, period] as const,
  breakdowns: (storeId: string, period: string) => [...analyticsKeys.all, 'breakdowns', storeId, period] as const,
}

// Get sales analytics (daily time series)
export function useSalesAnalytics(
  storeId: string | undefined,
  period: '7d' | '30d' | '90d' = '7d'
) {
  return useQuery({
    queryKey: analyticsKeys.sales(storeId || '', period),
    queryFn: () => api.get<SalesAnalytics>(`/kaspi/stores/${storeId}/analytics?period=${period}`),
    enabled: !!storeId,
    staleTime: 60000,
  })
}

// Get top products
export function useTopProducts(storeId: string | undefined, period: '7d' | '30d' | '90d' = '7d', limit: number = 10) {
  return useQuery({
    queryKey: analyticsKeys.topProducts(storeId || '', period),
    queryFn: () => api.get<TopProduct[]>(`/kaspi/stores/${storeId}/top-products?limit=${limit}&period=${period}`),
    enabled: !!storeId,
    staleTime: 60000,
  })
}

// Get order pipeline (status counts + conversion)
export function useOrderPipeline(storeId: string | undefined, period: '7d' | '30d' | '90d' = '7d') {
  return useQuery({
    queryKey: analyticsKeys.pipeline(storeId || '', period),
    queryFn: () => api.get<OrderPipeline>(`/kaspi/stores/${storeId}/order-pipeline?period=${period}`),
    enabled: !!storeId,
    staleTime: 60000,
  })
}

// Get order breakdowns (payment, delivery, cities)
export function useOrderBreakdowns(storeId: string | undefined, period: '7d' | '30d' | '90d' = '7d') {
  return useQuery({
    queryKey: analyticsKeys.breakdowns(storeId || '', period),
    queryFn: () => api.get<OrderBreakdowns>(`/kaspi/stores/${storeId}/order-breakdowns?period=${period}`),
    enabled: !!storeId,
    staleTime: 60000,
  })
}
