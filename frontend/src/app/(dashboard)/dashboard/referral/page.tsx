"use client"

import { useState, useEffect } from "react"
import { useT } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Users,
  CreditCard,
  Wallet,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  Banknote,
} from "lucide-react"
import { toast } from "sonner"
import {
  getReferralStats,
  getReferralLeads,
  getReferralTransactions,
  getReferralLink,
  requestPayout,
  type ReferralStats,
  type ReferralLead,
  type ReferralTransaction,
  type ReferralLink,
} from "@/hooks/use-referral"

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(price / 100)) + " \u20b8"
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function ReferralPage() {
  const t = useT()
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [leads, setLeads] = useState<ReferralLead[]>([])
  const [transactions, setTransactions] = useState<ReferralTransaction[]>([])
  const [link, setLink] = useState<ReferralLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState("")
  const [payoutRequisites, setPayoutRequisites] = useState("")
  const [payoutLoading, setPayoutLoading] = useState(false)
  const [showPayout, setShowPayout] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [s, l, tr, lnk] = await Promise.all([
          getReferralStats(),
          getReferralLeads(),
          getReferralTransactions(),
          getReferralLink(),
        ])
        setStats(s)
        setLeads(l.leads)
        setTransactions(tr.transactions)
        setLink(lnk)
      } catch (e) {
        console.error("Failed to load referral data", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleCopyCode = () => {
    if (!link?.promo_code) return
    navigator.clipboard.writeText(link.promo_code)
    setCopied(true)
    toast.success(t("referral.codeCopied"))
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePayout = async () => {
    const amount = Math.round(parseFloat(payoutAmount) * 100)
    if (!amount || amount < 500000) {
      toast.error(t("referral.minPayoutError"))
      return
    }
    if (!payoutRequisites.trim()) {
      toast.error(t("referral.requisitesError"))
      return
    }
    setPayoutLoading(true)
    try {
      const res = await requestPayout(amount, payoutRequisites.trim())
      toast.success(res.message)
      setShowPayout(false)
      setPayoutAmount("")
      setPayoutRequisites("")
      const [s, tr] = await Promise.all([getReferralStats(), getReferralTransactions()])
      setStats(s)
      setTransactions(tr.transactions)
    } catch (e: any) {
      toast.error(e?.message || t("referral.payoutError"))
    } finally {
      setPayoutLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">{t("referral.title")}</h1>
        <p className="text-muted-foreground">{t("referral.subtitle")}</p>
      </div>

      {/* Promo code */}
      {link && (
        <Card className="glass-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-2">{t("referral.yourCode")}</p>
            <div className="flex items-center gap-4">
              <code className="text-3xl font-mono font-bold tracking-widest bg-muted px-6 py-3 rounded-xl">
                {link.promo_code}
              </code>
              <Button variant="outline" size="lg" onClick={handleCopyCode} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t("referral.copied") : t("referral.copy")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {t("referral.howItWorks")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="glass-card glass-hover">
            <CardContent className="p-6">
              <div className="p-2 rounded-xl bg-muted w-fit">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-4">
                <p className="text-2xl font-semibold">{stats.registrations}</p>
                <p className="text-sm text-muted-foreground">{t("referral.registrations")}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card glass-hover">
            <CardContent className="p-6">
              <div className="p-2 rounded-xl bg-muted w-fit">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-4">
                <p className="text-2xl font-semibold">{stats.paid_users}</p>
                <p className="text-sm text-muted-foreground">{t("referral.paidUsers")}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card glass-hover">
            <CardContent className="p-6">
              <div className="p-2 rounded-xl bg-muted w-fit">
                <Wallet className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-4">
                <p className="text-2xl font-semibold">{formatPrice(stats.available_balance)}</p>
                <p className="text-sm text-muted-foreground">{t("referral.balance")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payout */}
      {stats && stats.available_balance >= 500000 && (
        <div>
          {!showPayout ? (
            <Button onClick={() => setShowPayout(true)} className="gap-2">
              <Banknote className="h-4 w-4" />
              {t("referral.requestPayout")}
            </Button>
          ) : (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>{t("referral.requestPayout")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground">{t("referral.payoutAmount")}</label>
                  <Input
                    type="number"
                    placeholder="5000"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("referral.availableLabel")}: {formatPrice(stats.available_balance)}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">{t("referral.requisites")}</label>
                  <Input
                    placeholder={t("referral.requisitesPlaceholder")}
                    value={payoutRequisites}
                    onChange={(e) => setPayoutRequisites(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handlePayout} disabled={payoutLoading}>
                    {payoutLoading ? t("referral.processing") : t("referral.send")}
                  </Button>
                  <Button variant="outline" onClick={() => setShowPayout(false)}>
                    {t("referral.cancel")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Leads */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>{t("referral.leads")}</CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t("referral.noLeads")}
            </p>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/30"
                >
                  <div>
                    <p className="font-medium">{lead.full_name || lead.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead.registered_at ? formatDate(lead.registered_at) : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {lead.partner_earned > 0 && (
                      <span className="text-sm text-green-600">
                        +{formatPrice(lead.partner_earned)}
                      </span>
                    )}
                    <Badge variant={lead.status === "paid" ? "default" : "secondary"}>
                      {lead.status === "paid" ? t("referral.paid") : t("referral.registered")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      {transactions.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>{t("referral.transactions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${tx.type === "income" ? "bg-green-500/10" : "bg-orange-500/10"}`}>
                      {tx.type === "income" ? (
                        <ArrowDownLeft className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-orange-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.created_at ? formatDate(tx.created_at) : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${tx.type === "income" ? "text-green-600" : "text-orange-600"}`}>
                      {tx.type === "income" ? "+" : "-"}{formatPrice(Math.abs(tx.amount))}
                    </span>
                    <Badge
                      variant={tx.status === "completed" ? "default" : tx.status === "pending" ? "secondary" : "destructive"}
                    >
                      {tx.status === "completed" ? t("referral.completed") : tx.status === "pending" ? t("referral.pending") : t("referral.rejected")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
