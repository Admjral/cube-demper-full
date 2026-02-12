'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserChat, markSupportMessagesRead } from '@/lib/support'
import { useAuth } from '@/hooks/use-auth'

/**
 * Hook to track unread support messages count.
 * Polls every 30 seconds.
 */
export function useSupportUnread() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['support', 'unread'],
    queryFn: async () => {
      const chat = await getUserChat()
      return chat.unread_count ?? 0
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

/**
 * Mark all support messages as read and invalidate the unread count.
 */
export function useMarkSupportRead() {
  const queryClient = useQueryClient()

  return async () => {
    try {
      await markSupportMessagesRead()
      queryClient.setQueryData(['support', 'unread'], 0)
    } catch {
      // ignore
    }
  }
}
