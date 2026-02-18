"use client"

import { useState } from "react"
import { useStore } from "@/store/use-store"
import { useT } from "@/lib/i18n"
import { SubscriptionGate } from "@/components/shared/subscription-gate"
import { FeatureGate } from "@/components/shared/feature-gate"
import { useSalesAnalytics, useTopProducts, useOrderPipeline, useOrderBreakdowns } from "@/hooks/api/use-analytics"
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
  Calendar,
  Download,
  Store,
  AlertCircle,
  Key,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Truck,
  CreditCard,
  MapPin,
} from "lucide-react"
import Link from "next/link"
import type { BreakdownItem } from "@/types/api"

// ── Helpers ──────────────────────────────────────────────────────────────

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU").format(price) + " \u20B8"
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value)
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toString()
}

// ── Donut Chart (SVG) ────────────────────────────────────────────────────

const DONUT_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#64748b", // slate (for "other")
]

function DonutChart({
  items,
  size = 160,
}: {
  items: BreakdownItem[]
  size?: number
}) {
  const total = items.reduce((s, i) => s + i.count, 0)
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ width: size, height: size }}
      >
        Нет данных
      </div>
    )
  }

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 10
  const strokeWidth = 28

  let cumAngle = -90 // start at top
  const arcs = items.map((item, i) => {
    const pct = item.count / total
    const angle = pct * 360
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180

    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)

    const largeArc = angle > 180 ? 1 : 0

    // For single-item (100%), draw a full circle
    if (pct >= 0.999) {
      return (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
          strokeWidth={strokeWidth}
        />
      )
    }

    return (
      <path
        key={i}
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
        fill="none"
        stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    )
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        className="fill-foreground text-xl font-semibold"
      >
        {formatNumber(total)}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        className="fill-muted-foreground text-xs"
      >
        заказов
      </text>
    </svg>
  )
}

function DonutLegend({ items }: { items: BreakdownItem[] }) {
  const total = items.reduce((s, i) => s + i.count, 0)
  return (
    <div className="space-y-2 mt-4">
      {items.map((item, i) => {
        const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0"
        return (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="truncate">{item.label}</span>
            </div>
            <span className="text-muted-foreground ml-2 whitespace-nowrap">
              {item.count} ({pct}%)
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Bar Chart ────────────────────────────────────────────────────────────

function SimpleBarChart({
  data,
  dataKey,
  label,
}: {
  data: { date: string; revenue: number; orders: number }[]
  dataKey: "revenue" | "orders"
  label: string
}) {
  const t = useT()
  const { locale } = useStore()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (!data || data.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center bg-muted/30 rounded-xl">
        <p className="text-muted-foreground">{t("sales.noData")}</p>
      </div>
    )
  }

  const values = data.map((d) => d[dataKey])
  const maxVal = Math.max(...values)
  const barAreaHeight = 220

  const ticks =
    maxVal > 0 ? [0, 1, 2, 3, 4].map((i) => Math.round((maxVal / 4) * i)) : [0]

  return (
    <div className="relative">
      <div className="flex">
        <div className="flex-1 relative">
          {/* Grid lines */}
          <div
            className="absolute inset-0 px-4 pointer-events-none"
            style={{ height: `${barAreaHeight}px` }}
          >
            {ticks.map((tick, i) => {
              const bottom = maxVal > 0 ? (tick / maxVal) * barAreaHeight : 0
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
          <div
            className="flex items-end gap-1 px-4 relative"
            style={{ height: `${barAreaHeight}px` }}
          >
            {data.map((day, index) => {
              const val = day[dataKey]
              const barHeight = maxVal > 0 ? (val / maxVal) * barAreaHeight : 0
              const date = new Date(day.date)
              const dayLabel = date.toLocaleDateString(
                locale === "ru" ? "ru-RU" : "kk-KZ",
                { day: "numeric", month: "short" }
              )
              const isHovered = hoveredIndex === index

              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center relative"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {isHovered && (
                    <div className="absolute bottom-full mb-2 z-10 pointer-events-none">
                      <div className="bg-popover text-popover-foreground border shadow-lg rounded-lg px-3 py-2 text-xs whitespace-nowrap">
                        <p className="font-semibold">{dayLabel}</p>
                        <p>
                          {dataKey === "revenue"
                            ? formatPrice(day.revenue)
                            : `${formatNumber(day.orders)} ${t("sales.orders")}`}
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
                const dayLabel = date.toLocaleDateString(
                  locale === "ru" ? "ru-RU" : "kk-KZ",
                  { day: "numeric", month: "short" }
                )
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

        {/* Y-axis labels */}
        <div
          className="w-14 relative shrink-0"
          style={{ height: `${barAreaHeight}px` }}
        >
          {ticks.map((tick, i) => {
            const bottom = maxVal > 0 ? (tick / maxVal) * barAreaHeight : 0
            return (
              <span
                key={i}
                className="absolute right-0 text-[10px] text-muted-foreground -translate-y-1/2"
                style={{ bottom: `${bottom}px` }}
              >
                {dataKey === "revenue" ? formatCompact(tick) : formatNumber(tick)}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Loading Skeletons ────────────────────────────────────────────────────

function PipelineLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="glass-card">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-20 mb-3" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-4 w-24" />
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
        <Skeleton className="h-[260px] w-full rounded-xl" />
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
        <h3 className="text-lg font-semibold mb-2">{t("sales.selectStore")}</h3>
        <p className="text-muted-foreground mb-4">{t("sales.selectStoreDesc")}</p>
        <Link href="/dashboard/integrations">
          <Button>{t("sales.addStore")}</Button>
        </Link>
      </CardContent>
    </Card>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { selectedStore } = useStore()
  const t = useT()
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d")
  const { data: stores } = useStores()
  const hasValidToken =
    stores?.some((s) => s.api_key_set && s.api_key_valid) ?? false

  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } =
    useSalesAnalytics(selectedStore?.id, period)

  const { data: topProducts, isLoading: topProductsLoading } =
    useTopProducts(selectedStore?.id, period)

  const { data: pipeline, isLoading: pipelineLoading } =
    useOrderPipeline(selectedStore?.id, period)

  const { data: breakdowns, isLoading: breakdownsLoading } =
    useOrderBreakdowns(selectedStore?.id, period)

  return (
    <SubscriptionGate>
      <FeatureGate feature="orders_view">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t("sales.title")}</h1>
              <p className="text-muted-foreground">{t("sales.subtitle")}</p>
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
                  <SelectItem value="7d">{t("sales.7days")}</SelectItem>
                  <SelectItem value="30d">{t("sales.30days")}</SelectItem>
                  <SelectItem value="90d">{t("sales.90days")}</SelectItem>
                </SelectContent>
              </Select>
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
              <AlertTitle className="text-yellow-600">
                {t("sales.tokenNotConnected")}
              </AlertTitle>
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

          {!selectedStore && <NoStoreSelected />}

          {selectedStore && (
            <>
              {/* ── Pipeline Cards ──────────────────────────── */}
              {pipelineLoading && <PipelineLoading />}
              {!pipelineLoading && pipeline && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card className="glass-card glass-hover border-l-4 border-l-amber-500">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {t("sales.active")}
                        </span>
                      </div>
                      <p className="text-2xl font-semibold">
                        {formatNumber(pipeline.active.count)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(pipeline.active.revenue)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="glass-card glass-hover border-l-4 border-l-emerald-500">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 text-emerald-600 mb-2">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {t("sales.completed")}
                        </span>
                      </div>
                      <p className="text-2xl font-semibold">
                        {formatNumber(pipeline.completed.count)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(pipeline.completed.revenue)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="glass-card glass-hover border-l-4 border-l-red-500">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 text-red-500 mb-2">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {t("sales.cancelled")}
                        </span>
                      </div>
                      <p className="text-2xl font-semibold">
                        {formatNumber(pipeline.cancelled.count)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(pipeline.cancelled.revenue)}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="glass-card glass-hover border-l-4 border-l-blue-500">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 text-blue-600 mb-2">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {t("sales.conversion")}
                        </span>
                      </div>
                      <p className="text-2xl font-semibold">
                        {pipeline.conversion_rate}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("sales.cancellationRate")}: {pipeline.cancellation_rate}%
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── Revenue Chart ──────────────────────────── */}
              {analyticsLoading && <ChartLoading />}
              {analyticsError && (
                <Card className="glass-card border-destructive/50">
                  <CardContent className="p-6 flex items-center gap-4">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <div>
                      <h3 className="font-semibold">{t("sales.loadingError")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("sales.loadingErrorDesc")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {!analyticsLoading && !analyticsError && analytics && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle>{t("sales.revenueChart")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SimpleBarChart
                      data={analytics.daily_stats}
                      dataKey="revenue"
                      label={t("sales.revenue")}
                    />
                  </CardContent>
                </Card>
              )}

              {/* ── Orders Chart ───────────────────────────── */}
              {!analyticsLoading && !analyticsError && analytics && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle>{t("sales.ordersChart")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SimpleBarChart
                      data={analytics.daily_stats}
                      dataKey="orders"
                      label={t("sales.ordersCount")}
                    />
                  </CardContent>
                </Card>
              )}

              {/* ── Donut Breakdowns ───────────────────────── */}
              {breakdownsLoading && (
                <div className="grid gap-4 md:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="glass-card">
                      <CardContent className="p-6">
                        <Skeleton className="h-[160px] w-[160px] rounded-full mx-auto" />
                        <Skeleton className="h-4 w-32 mx-auto mt-4" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {!breakdownsLoading && breakdowns && (
                <div className="grid gap-4 md:grid-cols-3">
                  {/* Payment breakdown */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        {t("sales.paymentBreakdown")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                      <DonutChart items={breakdowns.payment} />
                      <DonutLegend items={breakdowns.payment} />
                    </CardContent>
                  </Card>

                  {/* Delivery breakdown */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        {t("sales.deliveryBreakdown")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                      <DonutChart items={breakdowns.delivery} />
                      <DonutLegend items={breakdowns.delivery} />
                    </CardContent>
                  </Card>

                  {/* City breakdown (top-5 + other) */}
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {t("sales.cityBreakdown")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                      {(() => {
                        const top5 = breakdowns.cities.slice(0, 5)
                        const rest = breakdowns.cities.slice(5)
                        const otherCount = rest.reduce((s, c) => s + c.count, 0)
                        const otherRevenue = rest.reduce((s, c) => s + c.revenue, 0)
                        const items =
                          otherCount > 0
                            ? [
                                ...top5,
                                {
                                  label: t("sales.other"),
                                  count: otherCount,
                                  revenue: otherRevenue,
                                },
                              ]
                            : top5
                        return (
                          <>
                            <DonutChart items={items} />
                            <DonutLegend items={items} />
                          </>
                        )
                      })()}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ── City Table ─────────────────────────────── */}
              {!breakdownsLoading &&
                breakdowns &&
                breakdowns.cities.length > 0 && (
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        {t("sales.cityTable")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-2 px-3 font-medium">
                                {t("sales.city")}
                              </th>
                              <th className="text-right py-2 px-3 font-medium">
                                {t("sales.ordersCount")}
                              </th>
                              <th className="text-right py-2 px-3 font-medium">
                                {t("sales.revenue")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {breakdowns.cities.map((city, i) => (
                              <tr
                                key={i}
                                className="border-b border-border/50 last:border-0"
                              >
                                <td className="py-2.5 px-3 font-medium">
                                  {city.label}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {formatNumber(city.count)}
                                </td>
                                <td className="py-2.5 px-3 text-right text-muted-foreground">
                                  {formatPrice(city.revenue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* ── Delivery Cost Card ─────────────────────── */}
              {!breakdownsLoading && breakdowns && breakdowns.delivery_cost_total > 0 && (
                <Card className="glass-card">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-red-500/10">
                      <Truck className="h-6 w-6 text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("sales.deliveryCost")}
                      </p>
                      <p className="text-xl font-semibold">
                        {formatPrice(breakdowns.delivery_cost_total)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Top Products ────────────────────────────── */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>{t("sales.topProducts")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {topProductsLoading && <TopProductsLoading />}

                  {!topProductsLoading &&
                    topProducts &&
                    topProducts.length > 0 && (
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

                  {!topProductsLoading &&
                    (!topProducts || topProducts.length === 0) && (
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
