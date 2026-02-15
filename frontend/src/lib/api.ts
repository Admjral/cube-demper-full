import { authClient } from './auth'
import type { ApiError } from '@/types/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8010'

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async extractErrorMessage(response: Response, errorText: string): Promise<string> {
    let errorMessage = errorText
    try {
      const errorJson = JSON.parse(errorText)
      // Handle 403 feature_not_available with backend message
      if (response.status === 403 && errorJson.detail?.error === 'feature_not_available') {
        errorMessage = errorJson.detail.message || errorJson.detail.error
      } else {
        errorMessage = errorJson.detail || errorText
      }
    } catch {
      // Keep errorText as is
    }
    return errorMessage
  }

  private getAuthHeaders(): HeadersInit {
    const token = authClient.getToken()

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return headers
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = await this.extractErrorMessage(response, errorText)
      const error: ApiError = {
        message: errorMessage,
        status: response.status,
      }
      throw error
    }

    return response.json()
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = await this.extractErrorMessage(response, errorText)
      const error: ApiError = {
        message: errorMessage,
        status: response.status,
      }
      throw error
    }

    return response.json()
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = await this.extractErrorMessage(response, errorText)
      const error: ApiError = {
        message: errorMessage,
        status: response.status,
      }
      throw error
    }

    return response.json()
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = await this.extractErrorMessage(response, errorText)
      const error: ApiError = {
        message: errorMessage,
        status: response.status,
      }
      throw error
    }

    return response.json()
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = await this.extractErrorMessage(response, errorText)
      const error: ApiError = {
        message: errorMessage,
        status: response.status,
      }
      throw error
    }

    return response.json()
  }
}

export const api = new ApiClient(API_URL)
