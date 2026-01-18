'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ===== Types =====

export interface WhatsAppSession {
  id: string
  user_id: string
  session_name: string
  phone_number: string | null
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_pending' | 'failed'
  last_seen: string | null
  created_at: string
  updated_at: string
}

export interface WhatsAppTemplate {
  id: string
  user_id: string
  name: string
  name_en: string | null
  message: string
  variables: string[]
  is_active: boolean
  trigger_event: string | null
  created_at: string
  updated_at: string
}

export interface WhatsAppMessage {
  id: string
  session_id: string
  template_id: string | null
  recipient_phone: string
  message_content: string
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  waha_message_id: string | null
  error_message: string | null
  sent_at: string | null
  created_at: string
}

export interface WhatsAppSettings {
  id: string
  user_id: string
  daily_limit: number
  interval_seconds: number
  work_hours_start: string
  work_hours_end: string
  work_days: number[]
  auto_reply_enabled: boolean
  created_at: string
  updated_at: string
}

export interface SessionQRResponse {
  qr_code: string | null
  status: string
}

// ===== Query Keys =====

export const whatsappKeys = {
  all: ['whatsapp'] as const,
  sessions: () => [...whatsappKeys.all, 'sessions'] as const,
  session: (id: string) => [...whatsappKeys.all, 'session', id] as const,
  sessionQr: (id: string) => [...whatsappKeys.all, 'session', id, 'qr'] as const,
  templates: () => [...whatsappKeys.all, 'templates'] as const,
  settings: () => [...whatsappKeys.all, 'settings'] as const,
}

// ===== Sessions Hooks =====

export function useWhatsAppSessions() {
  return useQuery({
    queryKey: whatsappKeys.sessions(),
    queryFn: () => api.get<WhatsAppSession[]>('/whatsapp/sessions'),
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) =>
      api.post<WhatsAppSession>('/whatsapp/sessions', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.sessions() })
    },
  })
}

export function useSessionQRCode(sessionId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: whatsappKeys.sessionQr(sessionId),
    queryFn: () => api.get<SessionQRResponse>(`/whatsapp/sessions/${sessionId}/qr`),
    enabled,
    refetchInterval: (query) => {
      // Stop polling when connected
      if (query.state.data?.status === 'connected') {
        return false
      }
      return 3000 // Poll every 3 seconds
    },
  })
}

export function useDeleteSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) =>
      api.delete<{ success: boolean }>(`/whatsapp/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.sessions() })
    },
  })
}

// ===== Templates Hooks =====

export function useWhatsAppTemplates() {
  return useQuery({
    queryKey: whatsappKeys.templates(),
    queryFn: () => api.get<WhatsAppTemplate[]>('/whatsapp/templates'),
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      name_en?: string
      message: string
      variables?: string[]
      is_active?: boolean
      trigger_event?: string
    }) => api.post<WhatsAppTemplate>('/whatsapp/templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.templates() })
    },
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<WhatsAppTemplate>) =>
      api.patch<WhatsAppTemplate>(`/whatsapp/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.templates() })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (templateId: string) =>
      api.delete<{ success: boolean }>(`/whatsapp/templates/${templateId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.templates() })
    },
  })
}

// ===== Messages Hooks =====

export function useSendWhatsAppMessage() {
  return useMutation({
    mutationFn: (data: {
      session_id: string
      phone: string
      message?: string
      template_id?: string
      variables?: Record<string, string>
    }) => api.post<WhatsAppMessage>('/whatsapp/send', data),
  })
}

// ===== Settings Hooks =====

export function useWhatsAppSettings() {
  return useQuery({
    queryKey: whatsappKeys.settings(),
    queryFn: () => api.get<WhatsAppSettings>('/whatsapp/settings'),
  })
}

export function useUpdateWhatsAppSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<WhatsAppSettings>) =>
      api.patch<WhatsAppSettings>('/whatsapp/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.settings() })
    },
  })
}
