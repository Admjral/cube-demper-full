"use client"

import { useState } from "react"
import { useStore } from "@/store/use-store"
import { useT } from "@/lib/i18n"
import { SubscriptionGate } from "@/components/shared/subscription-gate"
import { FeatureGate } from "@/components/shared/feature-gate"
import { useSalesAnalytics, useTopProducts, useSyncOrders } from "@/hooks/api/use-analytics"
import { useStores } from "@/hooks/api/use-stores"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  ShoppingCart,
  DollarSign,
  Package,
  BarChart3,
  Store,
  AlertCircle,
  RefreshCw,
  Loader2,
  Key,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU").format(price) + " ₸"
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value)
}

function StatsLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="glass-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ChartLoading() {
  return (
    <Card className="glass-card">
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </CardContent>
    </Card>
  )
}

function TopProductsLoading() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 rounded-xl bg-muted/30"
        >
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-6 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function NoStoreSelected() {
  const t = useT()
  return (
    <Card className="glass-card">
      <CardContent className="p-8 text-center">
        <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          {t("sales.selectStore")}
        </h3>
        <p className="text-muted-foreground mb-4">
          {t("sales.selectStoreDesc")}
        </p>
        <Link href="/dashboard/integrations">
          <Button>
            {t("sales.addStore")}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toString()
}

function SimpleBarChart({ data }: { data: { date: string; revenue: number; orders: number }[] }) {
  const t = useT()
  const { locale } = useStore()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center bg-muted/30 rounded-xl">
        <p className="text-muted-foreground">
          {t("sales.noData")}
        </p>
      </div>
    )
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue))
  const barAreaHeight = 240

  // Y-axis tick values (5 ticks including 0)
  const ticks = maxRevenue > 0
    ? [0, 1, 2, 3, 4].map((i) => Math.round((maxRevenue / 4) * i))
    : [0]

  return (
    <div className="relative">
      <div className="flex">
        {/* Bars area */}
        <div className="flex-1 relative">
          {/* Grid lines */}
          <div className="absolute inset-0 px-4 pointer-events-none" style={{ height: `${barAreaHeight}px` }}>
            {ticks.map((tick, i) => {
              const bottom = maxRevenue > 0 ? (tick / maxRevenue) * barAreaHeight : 0
              return (
                <div
                  key={i}
                  className="absolute left-4 right-0 border-t border-border/30"
                  style={{ bottom: `${bottom}px` }}
                />
              )
            })}
          </div>

          {/* Bars */}
          <div className="flex items-end gap-1 px-4 relative" style={{ height: `${barAreaHeight}px` }}>
            {data.map((day, index) => {
              const barHeight = maxRevenue > 0 ? (day.revenue / maxRevenue) * barAreaHeight : 0
              const date = new Date(day.date)
              const dayLabel = date.toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ", {
                day: "numeric",
                month: "short",
              })
              const isHovered = hoveredIndex === index

              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center relative"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Tooltip */}
                  {isHovered && (
                    <div className="absolute bottom-full mb-2 z-10 pointer-events-none">
                      <div className="bg-popover text-popover-foreground border shadow-lg rounded-lg px-3 py-2 text-xs whitespace-nowrap">
                        <p className="font-semibold">{dayLabel}</p>
                        <p>{formatPrice(day.revenue)}</p>
                        <p className="text-muted-foreground">
                          {day.orders} {t("sales.orders")}
                        </p>
                      </div>
                    </div>
                  )}
                  <div
                    className={`w-full max-w-[40px] rounded-t transition-all cursor-pointer ${
                      isHovered ? "bg-primary/50" : "bg-primary/20"
                    }`}
                    style={{ height: `${Math.max(barHeight, 4)}px` }}
                  />
                </div>
              )
            })}
          </div>

          {/* X-axis labels */}
          {data.length <= 14 && (
            <div className="flex gap-1 px-4 mt-2">
              {data.map((day, index) => {
                const date = new Date(day.date)
                const dayLabel = date.toLocaleDateString(locale === "ru" ? "ru-RU" : "kk-KZ", {
                  day: "numeric",
                  month: "short",
                })
                return (
                  <div key={index} className="flex-1 text-center">
                    <span className="text-[10px] text-muted-foreground">
                      {dayLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Y-axis labels (right side) */}
        <div className="w-12 relative shrink-0" style={{ height: `${barAreaHeight}px` }}>
          {ticks.map((tick, i) => {
            const bottom = maxRevenue > 0 ? (tick / maxRevenue) * barAreaHeight : 0
            return (
              <span
                key={i}
                className="absolute right-0 text-[10px] text-muted-foreground -translate-y-1/2"
                style={{ bottom: `${bottom}px` }}
              >
                {formatCompact(tick)}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function SalesPage() {
  const { selectedStore } = useStore()
  const t = useT()
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d")
  const { data: stores } = useStores()
  const hasValidToken = stores?.some(s => s.api_key_set && s.api_key_valid) ?? false

  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useSalesAnalytics(selectedStore?.id, period)

  const {
    data: topProducts,
    isLoading: topProductsLoading,
  } = useTopProducts(selectedStore?.id)

  const syncOrders = useSyncOrders()

  const handleSyncOrders = async () => {
    if (!selectedStore?.id) return

    try {
      await syncOrders.mutateAsync({
        storeId: selectedStore.id,
        daysBack: period === "7d" ? 7 : period === "30d" ? 30 : 90,
      })
      toast.success(t("sales.syncOrders"))
    } catch (error) {
      toast.error(t("sales.loadingError"))
    }
  }

  const stats = analytics
    ? [
        {
          titleKey: "sales.revenue",
          value: formatPrice(analytics.total_revenue),
          change: "",
          trend: "up" as const,
          icon: DollarSign,
        },
        {
          titleKey: "sales.ordersCount",
          value: formatNumber(analytics.total_orders),
          change: "",
          trend: "up" as const,
          icon: ShoppingCart,
        },
        {
          titleKey: "sales.itemsSold",
          value: formatNumber(analytics.total_items_sold),
          change: "",
          trend: "up" as const,
          icon: Package,
        },
        {
          titleKey: "sales.avgOrder",
          value: formatPrice(analytics.avg_order_value),
          change: "",
          trend: "up" as const,
          icon: BarChart3,
        },
      ]
    : []

  return (
    <SubscriptionGate>
      <FeatureGate feature="orders_view">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("sales.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("sales.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v as "7d" | "30d" | "90d")}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">
                {t("sales.7days")}
              </SelectItem>
              <SelectItem value="30d">
                {t("sales.30days")}
              </SelectItem>
              <SelectItem value="90d">
                {t("sales.90days")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleSyncOrders}
            disabled={!selectedStore || syncOrders.isPending}
          >
            {syncOrders.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t("sales.syncOrders")}
          </Button>
          <Button variant="outline" disabled={!selectedStore}>
            <Download className="h-4 w-4 mr-2" />
            {t("sales.export")}
          </Button>
        </div>
      </div>

      {/* API Token Banner */}
      {selectedStore && !hasValidToken && (
        <Alert className="border-yellow-500/50 bg-yellow-500/5">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-600">{t("sales.tokenNotConnected")}</AlertTitle>
          <AlertDescription className="text-muted-foreground flex flex-col sm:flex-row sm:items-center gap-2">
            <span>{t("sales.tokenNotConnectedDesc")}</span>
            <Link href="/dashboard/integrations">
              <Button variant="outline" size="sm" className="gap-1">
                <Key className="h-3 w-3" />
                {t("sales.connectToken")}
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* No store selected */}
      {!selectedStore && <NoStoreSelected />}

      {/* Content when store is selected */}
      {selectedStore && (
        <>
          {/* Stats */}
          {analyticsLoading && <StatsLoading />}

          {analyticsError && (
            <Card className="glass-card border-destructive/50">
              <CardContent className="p-6 flex items-center gap-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div>
                  <h3 className="font-semibold">
                    {t("sales.loadingError")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("sales.loadingErrorDesc")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!analyticsLoading && !analyticsError && analytics && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.titleKey} className="glass-card glass-hover">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-xl bg-muted">
                        <stat.icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      {stat.change && (
                        <div
                          className={`flex items-center gap-1 text-sm ${
                            stat.trend === "up" ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {stat.trend === "up" ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          {stat.change}
                        </div>
                      )}
                    </div>
                    <div className="mt-4">
                      <p className="text-2xl font-semibold">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">
                        {t(stat.titleKey)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Chart */}
          {analyticsLoading && <ChartLoading />}

          {!analyticsLoading && !analyticsError && analytics && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>
                  {t("sales.chart")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={analytics.daily_stats} />
              </CardContent>
            </Card>
          )}

          {/* Top products */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>
                {t("sales.topProducts")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topProductsLoading && <TopProductsLoading />}

              {!topProductsLoading && topProducts && topProducts.length > 0 && (
                <Tabs defaultValue="sales">
                  <TabsList className="mb-4">
                    <TabsTrigger value="sales">
                      {t("sales.bySales")}
                    </TabsTrigger>
                    <TabsTrigger value="revenue">
                      {t("sales.byRevenue")}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="sales" className="space-y-4">
                    {[...topProducts]
                      .sort((a, b) => b.sales_count - a.sales_count)
                      .map((product, index) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-4 rounded-xl bg-muted/30"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-lg font-semibold text-muted-foreground w-6">
                              {index + 1}
                            </span>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatPrice(product.revenue)}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-base">
                            {product.sales_count} {t("sales.pcs")}
                          </Badge>
                        </div>
                      ))}
                  </TabsContent>
                  <TabsContent value="revenue" className="space-y-4">
                    {[...topProducts]
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((product, index) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-4 rounded-xl bg-muted/30"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-lg font-semibold text-muted-foreground w-6">
                              {index + 1}
                            </span>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {product.sales_count} {t("sales.pcs")}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-base">
                            {formatPrice(product.revenue)}
                          </Badge>
                        </div>
                      ))}
                  </TabsContent>
                </Tabs>
              )}

              {!topProductsLoading && (!topProducts || topProducts.length === 0) && (
                <div className="py-8 text-center text-muted-foreground">
                  {t("sales.noSalesData")}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
      </FeatureGate>
    </SubscriptionGate>
  )
}
