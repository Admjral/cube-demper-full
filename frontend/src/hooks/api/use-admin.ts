'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AdminStats,
  AdminUser,
  AdminUserListResponse,
  AdminStore,
  AdminStoreListResponse,
  AdminPayment,
  AdminPaymentListResponse,
} from '@/types/api'

// Query keys
export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  users: (page?: number) => [...adminKeys.all, 'users', page] as const,
  stores: (page?: number) => [...adminKeys.all, 'stores', page] as const,
  payments: (page?: number) => [...adminKeys.all, 'payments', page] as const,
  subscriptions: () => [...adminKeys.all, 'subscriptions'] as const,
}

// Get admin stats
export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => api.get<AdminStats>('/admin/stats'),
  })
}

// Get all users
export function useAdminUsers(page: number = 1, pageSize: number = 50) {
  return useQuery({
    queryKey: adminKeys.users(page),
    queryFn: () => api.get<AdminUserListResponse>(`/admin/users?page=${page}&page_size=${pageSize}`),
  })
}

// Update user role
export function useUpdateUserRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch('/admin/users/role', { user_id: userId, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() })
    },
  })
}

// Block user
export function useBlockUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api.post(`/admin/users/${userId}/block`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() })
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() })
    },
  })
}

// Unblock user
export function useUnblockUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => api.post(`/admin/users/${userId}/unblock`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() })
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() })
    },
  })
}

// Delete user
export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => api.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() })
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() })
    },
  })
}

// Get all stores
export function useAdminStores(page: number = 1, pageSize: number = 50) {
  return useQuery({
    queryKey: adminKeys.stores(page),
    queryFn: () => api.get<AdminStoreListResponse>(`/admin/stores?page=${page}&page_size=${pageSize}`),
  })
}

// Get all payments
export function useAdminPayments(page: number = 1, pageSize: number = 50) {
  return useQuery({
    queryKey: adminKeys.payments(page),
    queryFn: () => api.get<AdminPaymentListResponse>(`/admin/payments?page=${page}&page_size=${pageSize}`),
  })
}

// Get all subscriptions (uses users with subscription info)
export function useAdminSubscriptions() {
  return useQuery({
    queryKey: adminKeys.subscriptions(),
    queryFn: () => api.get<AdminUserListResponse>('/admin/users?page=1&page_size=100'),
    select: (data) => {
      // Filter only users with active subscriptions
      return data.users.filter(u => u.subscription_status === 'active')
    },
  })
}

// Extend subscription
export function useExtendSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ subscriptionId, days }: { subscriptionId: string; days: number }) =>
      api.post(`/admin/subscriptions/${subscriptionId}/extend`, { days }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() })
      queryClient.invalidateQueries({ queryKey: adminKeys.subscriptions() })
    },
  })
}
