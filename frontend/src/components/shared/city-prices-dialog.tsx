'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import {
  Play,
  Loader2,
  MapPin,
  Clock,
  Trash2,
  RefreshCw,
  Warehouse,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ProductCityPrice,
  ProductCityPricesRequest,
  MultiCityDempingResult
} from '@/types/api'

type StorePoints = Record<string, { city_id: string; city_name: string; enabled: boolean }> | null

interface CityPricesDialogProps {
  productId: string | null
  productName?: string
  basePrice?: number
  storePoints?: StorePoints
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CityPricesDialog({
  productId,
  productName,
  basePrice = 0,
  storePoints,
  open,
  onOpenChange
}: CityPricesDialogProps) {
  const queryClient = useQueryClient()

  const [citySettings, setCitySettings] = useState<Record<string, {
    min_price: number | null
    max_price: number | null
    bot_active: boolean
  }>>({})
  const [autoInitDone, setAutoInitDone] = useState(false)

  // Extract unique cities from store_points
  const storeCities = (() => {
    if (!storePoints) return []
    const cityMap = new Map<string, { city_id: string; city_name: string; pp_names: string[] }>()
    for (const [ppName, data] of Object.entries(storePoints)) {
      if (!data?.city_id || !data?.enabled) continue
      const existing = cityMap.get(data.city_id)
      if (existing) {
        existing.pp_names.push(ppName)
      } else {
        cityMap.set(data.city_id, { city_id: data.city_id, city_name: data.city_name, pp_names: [ppName] })
      }
    }
    return Array.from(cityMap.values())
  })()

  // Fetch existing city prices
  const { data: cityPrices, isLoading } = useQuery({
    queryKey: ['productCityPrices', productId],
    queryFn: async () => {
      if (!productId) return []
      return await api.get<ProductCityPrice[]>(`/kaspi/products/${productId}/city-prices`)
    },
    enabled: !!productId && open
  })

  // Auto-init from store_points mutation
  const autoInitMutation = useMutation({
    mutationFn: async () => {
      return await api.post<ProductCityPrice[]>(`/kaspi/products/${productId}/city-prices`, {
        auto_from_store_points: true,
        cities: []
      } as ProductCityPricesRequest)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCityPrices', productId] })
      setAutoInitDone(true)
      toast.success('Города настроены автоматически')
    },
    onError: () => {
      toast.error('Ошибка автоматической настройки городов')
    }
  })

  // Set city prices mutation
  const setCityPricesMutation = useMutation({
    mutationFn: async (request: ProductCityPricesRequest) => {
      return await api.post<ProductCityPrice[]>(`/kaspi/products/${productId}/city-prices`, request)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCityPrices', productId] })
      toast.success('Настройки городов сохранены')
    },
    onError: () => {
      toast.error('Ошибка сохранения настроек')
    }
  })

  // Delete city price mutation
  const deleteCityPriceMutation = useMutation({
    mutationFn: async (cityId: string) => {
      await api.delete(`/kaspi/products/${productId}/city-prices/${cityId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCityPrices', productId] })
      toast.success('Город удален')
    }
  })

  // Run city demping mutation
  const runCityDempingMutation = useMutation({
    mutationFn: async (cityIds?: string[]) => {
      return await api.post<MultiCityDempingResult>(`/kaspi/products/${productId}/run-city-demping`,
        cityIds ? { city_ids: cityIds } : {}
      )
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['productCityPrices', productId] })

      const successCount = result.successful_updates
      const totalCount = result.total_cities

      if (successCount > 0) {
        toast.success(
          <div className="space-y-1">
            <p className="font-medium">Демпинг выполнен!</p>
            <p className="text-sm text-muted-foreground">
              Обновлено {successCount} из {totalCount} городов
            </p>
          </div>
        )
      } else {
        toast.info(
          <div className="space-y-1">
            <p className="font-medium">Демпинг завершен</p>
            <p className="text-sm text-muted-foreground">
              Изменения не требуются
            </p>
          </div>
        )
      }
    },
    onError: () => {
      toast.error('Ошибка запуска демпинга')
    }
  })

  // Auto-init cities when dialog opens and no city prices exist
  useEffect(() => {
    if (open && !isLoading && productId && storeCities.length > 0 && (!cityPrices || cityPrices.length === 0) && !autoInitDone) {
      autoInitMutation.mutate()
    }
  }, [open, isLoading, productId, cityPrices, storeCities.length, autoInitDone])

  // Reset autoInitDone when dialog closes
  useEffect(() => {
    if (!open) setAutoInitDone(false)
  }, [open])

  // Initialize settings from existing data
  useEffect(() => {
    if (cityPrices && cityPrices.length > 0) {
      const settings: typeof citySettings = {}
      cityPrices.forEach(cp => {
        settings[cp.city_id] = {
          min_price: cp.min_price,
          max_price: cp.max_price,
          bot_active: cp.bot_active
        }
      })
      setCitySettings(settings)
    }
  }, [cityPrices])

  const handleSave = async () => {
    if (!productId || !cityPrices) return

    const request: ProductCityPricesRequest = {
      apply_to_all_cities: false,
      cities: cityPrices.map(cp => ({
        city_id: cp.city_id,
        price: cp.price ?? basePrice,
        min_price: citySettings[cp.city_id]?.min_price ?? null,
        max_price: citySettings[cp.city_id]?.max_price ?? null,
        bot_active: citySettings[cp.city_id]?.bot_active ?? true
      }))
    }

    await setCityPricesMutation.mutateAsync(request)
  }

  const updateCitySetting = (
    cityId: string,
    field: 'min_price' | 'max_price' | 'bot_active',
    value: number | null | boolean
  ) => {
    setCitySettings(prev => ({
      ...prev,
      [cityId]: {
        ...prev[cityId],
        [field]: value
      }
    }))
  }

  const getStatusBadge = (cityPrice: ProductCityPrice) => {
    if (!cityPrice.last_check_time) {
      return <Badge variant="secondary">Не проверено</Badge>
    }
    if (cityPrice.our_position === 1) {
      return <Badge className="bg-green-500">ТОП 1</Badge>
    }
    if (cityPrice.our_position && cityPrice.our_position <= 3) {
      return <Badge className="bg-yellow-500">ТОП {cityPrice.our_position}</Badge>
    }
    if (cityPrice.our_position) {
      return <Badge variant="outline">Позиция {cityPrice.our_position}</Badge>
    }
    return <Badge variant="secondary">Неизвестно</Badge>
  }

  // No store_points — store not connected or data missing
  const hasNoStorePoints = !storePoints || storeCities.length === 0
  const isSingleCity = storeCities.length === 1
  const isMultiCity = storeCities.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Демпинг по городам
          </DialogTitle>
          <DialogDescription>
            {productName && `${productName} | `}
            Базовая цена: {formatPrice(basePrice)}
          </DialogDescription>
        </DialogHeader>

        {isLoading || autoInitMutation.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            {autoInitMutation.isPending && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Настраиваем города автоматически...
              </div>
            )}
          </div>
        ) : hasNoStorePoints ? (
          /* No store points — prompt to reconnect */
          <div className="text-center py-12 space-y-4">
            <AlertTriangle className="h-12 w-12 mx-auto text-yellow-500" />
            <div>
              <p className="font-medium text-lg">Нет данных о складах</p>
              <p className="text-sm text-muted-foreground mt-2">
                Переподключите магазин в настройках для загрузки данных о складских точках и городах.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          </div>
        ) : isSingleCity ? (
          /* Single city — simplified view */
          <div className="space-y-6">
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Warehouse className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-lg">У вас 1 склад</p>
                    <p className="text-sm text-muted-foreground">
                      {storeCities[0].pp_names.join(', ')} — <span className="font-medium text-foreground">{storeCities[0].city_name}</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Демпинг автоматически идёт по городу {storeCities[0].city_name}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Settings for this single city */}
            {cityPrices && cityPrices.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">Настройки для {storeCities[0].city_name}</Label>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={citySettings[storeCities[0].city_id]?.bot_active ?? true}
                        onCheckedChange={(checked) => updateCitySetting(storeCities[0].city_id, 'bot_active', checked)}
                      />
                      <span className="text-sm text-muted-foreground">
                        {citySettings[storeCities[0].city_id]?.bot_active !== false ? 'Активен' : 'Выключен'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Минимальная цена (₸)</Label>
                      <Input
                        type="number"
                        placeholder="Без ограничения"
                        value={citySettings[storeCities[0].city_id]?.min_price ?? ''}
                        onChange={(e) => updateCitySetting(
                          storeCities[0].city_id,
                          'min_price',
                          e.target.value ? parseInt(e.target.value) : null
                        )}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Максимальная цена (₸)</Label>
                      <Input
                        type="number"
                        placeholder="Без ограничения"
                        value={citySettings[storeCities[0].city_id]?.max_price ?? ''}
                        onChange={(e) => updateCitySetting(
                          storeCities[0].city_id,
                          'max_price',
                          e.target.value ? parseInt(e.target.value) : null
                        )}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Status info */}
                  {cityPrices[0] && (
                    <div className="flex items-center gap-3 pt-2 border-t">
                      {getStatusBadge(cityPrices[0])}
                      {cityPrices[0].competitor_price && (
                        <span className="text-sm text-muted-foreground">
                          Конкурент: {formatPrice(cityPrices[0].competitor_price)}
                        </span>
                      )}
                      {cityPrices[0].last_check_time && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(cityPrices[0].last_check_time).toLocaleString('ru')}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action buttons */}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => runCityDempingMutation.mutate(undefined)}
                disabled={runCityDempingMutation.isPending}
              >
                {runCityDempingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Запустить демпинг
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Закрыть
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={setCityPricesMutation.isPending}
                >
                  {setCityPricesMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    'Сохранить'
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Multi-city mode */
          <>
            <Tabs defaultValue="settings">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="settings">Настройки</TabsTrigger>
                <TabsTrigger value="status">Статус по городам</TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-4 mt-4">
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Warehouse className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">
                          У вас {storeCities.length} {storeCities.length <= 4 ? 'города' : 'городов'} из складских точек
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {storeCities.map(c => c.city_name).join(', ')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Per-city settings */}
                <div className="space-y-3">
                  {storeCities.map(city => {
                    const existingPrice = cityPrices?.find(cp => cp.city_id === city.city_id)
                    return (
                      <Card key={city.city_id} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="font-medium">{city.city_name}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              ({city.pp_names.join(', ')})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={citySettings[city.city_id]?.bot_active ?? true}
                              onCheckedChange={(checked) => updateCitySetting(city.city_id, 'bot_active', checked)}
                            />
                            <span className="text-sm text-muted-foreground">
                              {citySettings[city.city_id]?.bot_active !== false ? 'Активен' : 'Выключен'}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Input
                            type="number"
                            placeholder="Мин. цена (₸)"
                            value={citySettings[city.city_id]?.min_price ?? ''}
                            onChange={(e) => updateCitySetting(
                              city.city_id,
                              'min_price',
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                          />
                          <Input
                            type="number"
                            placeholder="Макс. цена (₸)"
                            value={citySettings[city.city_id]?.max_price ?? ''}
                            onChange={(e) => updateCitySetting(
                              city.city_id,
                              'max_price',
                              e.target.value ? parseInt(e.target.value) : null
                            )}
                          />
                        </div>
                        {/* Inline status */}
                        {existingPrice && existingPrice.last_check_time && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            {getStatusBadge(existingPrice)}
                            {existingPrice.competitor_price && (
                              <span>Конкурент: {formatPrice(existingPrice.competitor_price)}</span>
                            )}
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </TabsContent>

              <TabsContent value="status" className="mt-4">
                {cityPrices && cityPrices.length > 0 ? (
                  <div className="space-y-4">
                    {/* Run demping button */}
                    <Card className="border-dashed">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Запустить демпинг по всем городам</p>
                            <p className="text-sm text-muted-foreground">
                              Проверит цены конкурентов и обновит при необходимости
                            </p>
                          </div>
                          <Button
                            onClick={() => runCityDempingMutation.mutate(undefined)}
                            disabled={runCityDempingMutation.isPending}
                          >
                            {runCityDempingMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Запустить
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* City status list */}
                    <div className="space-y-2">
                      {cityPrices.map(cp => (
                        <Card key={cp.id} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{cp.city_name}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span>Цена: {formatPrice(cp.price || 0)}</span>
                                  {cp.competitor_price && (
                                    <span>| Конкурент: {formatPrice(cp.competitor_price)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(cp)}
                              {!cp.bot_active && (
                                <Badge variant="outline" className="text-orange-500">
                                  Выключен
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => runCityDempingMutation.mutate([cp.city_id])}
                                disabled={runCityDempingMutation.isPending}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteCityPriceMutation.mutate(cp.city_id)}
                                disabled={deleteCityPriceMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          {cp.last_check_time && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Последняя проверка: {new Date(cp.last_check_time).toLocaleString('ru')}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Города ещё не настроены</p>
                    <p className="text-sm">Настройки появятся автоматически</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-2 mt-6">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Закрыть
              </Button>
              <Button
                onClick={handleSave}
                disabled={setCityPricesMutation.isPending || !cityPrices || cityPrices.length === 0}
              >
                {setCityPricesMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Сохранить настройки'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
