'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/hooks/use-auth'
import { Loader2, Mail, Lock, User, Eye, EyeOff, Phone } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const { signUp } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate phone
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setError('Введите корректный номер телефона')
      return
    }

    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов')
      return
    }

    if (!/\d/.test(password)) {
      setError('Пароль должен содержать хотя бы одну цифру')
      return
    }

    if (!/[A-Z]/.test(password)) {
      setError('Пароль должен содержать хотя бы одну заглавную букву')
      return
    }

    if (!/[a-z]/.test(password)) {
      setError('Пароль должен содержать хотя бы одну строчную букву')
      return
    }

    if (!acceptTerms) {
      setError('Необходимо принять условия использования')
      return
    }

    setLoading(true)

    const { error } = await signUp(email, password, { full_name: name, phone: phoneDigits })

    if (error) {
      setError(error.message === 'User already registered'
        ? 'Пользователь с таким email уже существует'
        : error.message)
      setLoading(false)
      return
    }

    // Registration successful + auto-logged in + OTP sent
    // Redirect to phone verification
    router.push('/verify-phone')
  }

  return (
    <div className="glass-card p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold text-foreground">Регистрация</h2>
        <p className="text-muted-foreground mt-1">
          Создайте аккаунт для начала работы
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Имя</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="name"
              type="text"
              placeholder="Ваше имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-10"
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Номер телефона (WhatsApp)</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="phone"
              type="tel"
              placeholder="+7XXXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="pl-10"
              required
              disabled={loading}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            На этот номер придёт код подтверждения в WhatsApp
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Пароль</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Минимум 8 символов (цифры, A-z)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10"
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10"
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <Checkbox
            id="terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
            disabled={loading}
          />
          <label
            htmlFor="terms"
            className="text-sm text-muted-foreground leading-tight cursor-pointer"
          >
            Я принимаю{' '}
            <Link href="/terms" className="text-primary hover:underline">
              условия использования
            </Link>{' '}
            и{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              политику конфиденциальности
            </Link>
          </label>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Регистрация...
            </>
          ) : (
            'Создать аккаунт'
          )}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="text-primary hover:underline font-medium">
          Войти
        </Link>
      </div>
    </div>
  )
}
