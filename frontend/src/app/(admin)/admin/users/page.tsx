'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useAdminUsers,
  useBlockUser,
  useUnblockUser,
  useUpdateUserRole,
  useDeleteUser,
} from '@/hooks/api/use-admin'
import {
  Users,
  Search,
  MoreHorizontal,
  Loader2,
  Mail,
  Calendar,
  Shield,
  Ban,
  CheckCircle,
  Package,
  Store,
} from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading, refetch } = useAdminUsers(page, 50)

  const blockUserMutation = useBlockUser()
  const unblockUserMutation = useUnblockUser()
  const updateRoleMutation = useUpdateUserRole()
  const deleteUserMutation = useDeleteUser()

  const users = data?.users ?? []
  const total = data?.total ?? 0

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleBlockUser = async (userId: string) => {
    if (confirm('Заблокировать пользователя?')) {
      await blockUserMutation.mutateAsync({ userId })
    }
  }

  const handleUnblockUser = async (userId: string) => {
    await unblockUserMutation.mutateAsync(userId)
  }

  const handleMakeAdmin = async (userId: string) => {
    if (confirm('Сделать администратором?')) {
      await updateRoleMutation.mutateAsync({ userId, role: 'admin' })
    }
  }

  const handleMakeSupport = async (userId: string) => {
    if (confirm('Сделать саппортом?')) {
      await updateRoleMutation.mutateAsync({ userId, role: 'support' })
    }
  }

  const handleRemoveRole = async (userId: string) => {
    await updateRoleMutation.mutateAsync({ userId, role: 'user' })
  }

  const handleDeleteUser = async (userId: string) => {
    if (confirm('Удалить пользователя? Это действие необратимо!')) {
      await deleteUserMutation.mutateAsync(userId)
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <Badge className="bg-red-500/10 text-red-500 border-0">
            <Shield className="h-3 w-3 mr-1" />
            Админ
          </Badge>
        )
      case 'support':
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-0">
            <Shield className="h-3 w-3 mr-1" />
            Саппорт
          </Badge>
        )
      default:
        return <Badge variant="secondary">Пользователь</Badge>
    }
  }

  const getSubscriptionBadge = (status: string | null) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-500/10 text-green-500 border-0">
            <CheckCircle className="h-3 w-3 mr-1" />
            Активна
          </Badge>
        )
      case 'canceled':
        return <Badge variant="secondary">Отменена</Badge>
      case 'past_due':
        return <Badge variant="destructive">Просрочена</Badge>
      default:
        return <span className="text-muted-foreground text-sm">—</span>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Пользователи
          </h1>
          <p className="text-muted-foreground">
            Всего: {total} пользователей
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по email или имени..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Users table */}
      <Card className="glass-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                      Пользователь
                    </th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                      Роль
                    </th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                      Подписка
                    </th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                      Магазины / Товары
                    </th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                      Дата регистрации
                    </th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/50 ${
                        user.is_blocked ? 'bg-red-500/5' : ''
                      }`}
                    >
                      <td className="p-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">
                              {user.full_name || 'Без имени'}
                            </p>
                            {user.is_blocked && (
                              <Badge variant="destructive" className="text-xs">
                                <Ban className="h-3 w-3 mr-1" />
                                Заблокирован
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </p>
                          {user.partner_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Партнёр: {user.partner_name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">{getRoleBadge(user.role)}</td>
                      <td className="p-4">
                        {user.subscription_plan ? (
                          <div>
                            <p className="text-sm font-medium">{user.subscription_plan}</p>
                            {getSubscriptionBadge(user.subscription_status)}
                            {user.subscription_end_date && (
                              <p className="text-xs text-muted-foreground mt-1">
                                до {format(new Date(user.subscription_end_date), 'd MMM yyyy', { locale: ru })}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Store className="h-3 w-3 text-muted-foreground" />
                            {user.stores_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3 text-muted-foreground" />
                            {user.products_count}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {user.created_at
                            ? format(new Date(user.created_at), 'd MMM yyyy', { locale: ru })
                            : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {user.role === 'user' && (
                              <>
                                <DropdownMenuItem onClick={() => handleMakeAdmin(user.id)}>
                                  Сделать админом
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMakeSupport(user.id)}>
                                  Сделать саппортом
                                </DropdownMenuItem>
                              </>
                            )}
                            {(user.role === 'admin' || user.role === 'support') && (
                              <DropdownMenuItem onClick={() => handleRemoveRole(user.id)}>
                                Убрать роль
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {user.is_blocked ? (
                              <DropdownMenuItem onClick={() => handleUnblockUser(user.id)}>
                                Разблокировать
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleBlockUser(user.id)}
                                className="text-orange-600"
                              >
                                Заблокировать
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-destructive"
                            >
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            Страница {page} из {Math.ceil(total / 50)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / 50)}
            onClick={() => setPage(page + 1)}
          >
            Вперёд
          </Button>
        </div>
      )}
    </div>
  )
}
