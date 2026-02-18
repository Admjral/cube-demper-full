"use client"

import { useState } from "react"

import Image from "next/image"
import { useT } from "@/lib/i18n"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Store,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle,
  Loader2,
  ShoppingBag,
  Clock,
  Package,
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
  ChevronDown,
  Info,
  Phone,
  Mail,
  ArrowLeft,
} from "lucide-react"
import { toast } from "sonner"
import {
  useStores,
  useStoreSubscriptions,
  useKaspiAuth,
  useKaspiPhoneAuth,
  useKaspiPhoneVerify,
  useDeleteStore,
  useSyncStore,
  useUpdateStoreApiToken,
} from "@/hooks/api/use-stores"

type AuthMethod = "phone" | "email"
type PhoneStep = "phone" | "sms"

export default function IntegrationsPage() {
  const t = useT()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteStoreId, setDeleteStoreId] = useState<string | null>(null)

  // Auth method state
  const [authMethod, setAuthMethod] = useState<AuthMethod>("phone")

  // Email auth state
  const [kaspiEmail, setKaspiEmail] = useState("")
  const [kaspiPassword, setKaspiPassword] = useState("")

  // Phone auth state
  const [phoneNumber, setPhoneNumber] = useState("")
  const [smsCode, setSmsCode] = useState("")
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone")

  // API token state
  const [apiTokenInputs, setApiTokenInputs] = useState<Record<string, string>>({})
  const [showTokenInputs, setShowTokenInputs] = useState<Record<string, boolean>>({})

  // API hooks
  const { data: stores, isLoading: storesLoading } = useStores()
  const { data: storeSubscriptions } = useStoreSubscriptions()
  const maxStores = storeSubscriptions?.max_stores ?? 1
  const canAddStore = (stores?.length ?? 0) < maxStores
  const kaspiAuth = useKaspiAuth()
  const phoneAuth = useKaspiPhoneAuth()
  const phoneVerify = useKaspiPhoneVerify()
  const deleteStore = useDeleteStore()
  const syncStore = useSyncStore()
  const updateApiToken = useUpdateStoreApiToken()

  const connectedStores = stores?.filter((s) => s.is_active) || []
  const totalProducts = stores?.reduce((acc, s) => acc + (s.products_count || 0), 0) || 0

  const resetDialog = () => {
    setAuthMethod("phone")
    setKaspiEmail("")
    setKaspiPassword("")
    setPhoneNumber("")
    setSmsCode("")
    setPhoneStep("phone")
  }

  const handleConnectKaspi = async () => {
    if (!kaspiEmail || !kaspiPassword) {
      toast.error(t("integrations.connectError"))
      return
    }
    try {
      await kaspiAuth.mutateAsync({ email: kaspiEmail, password: kaspiPassword })
      toast.success(t("integrations.connectSuccess"))
      setShowAddDialog(false)
      resetDialog()
    } catch (error: any) {
      toast.error(error?.message || t("integrations.connectError"))
    }
  }

  // phoneNumber stores only the 10 digits after +7 (e.g. "7051751603")
  // Full number for API = "7" + phoneNumber (e.g. "77051751603")
  const fullPhone = "7" + phoneNumber

  const handleSendSms = async () => {
    if (!phoneNumber || phoneNumber.length !== 10) {
      toast.error(t("integrations.smsError"))
      return
    }
    try {
      const result = await phoneAuth.mutateAsync({ phone: fullPhone })
      toast.success(result.message || t("integrations.smsSent"))
      setPhoneStep("sms")
    } catch (error: any) {
      toast.error(error?.message || t("integrations.smsError"))
    }
  }

  const handleVerifySms = async () => {
    if (!smsCode || smsCode.length < 4) {
      toast.error(t("integrations.smsVerifyError"))
      return
    }
    try {
      await phoneVerify.mutateAsync({ phone: fullPhone, sms_code: smsCode })
      toast.success(t("integrations.connectSuccess"))
      setShowAddDialog(false)
      resetDialog()
    } catch (error: any) {
      toast.error(error?.message || t("integrations.smsVerifyError"))
    }
  }

  const handleDeleteStore = async () => {
    if (!deleteStoreId) return
    try {
      await deleteStore.mutateAsync(deleteStoreId)
      toast.success(t("integrations.storeDeleted"))
      setShowDeleteDialog(false)
      setDeleteStoreId(null)
    } catch {
      toast.error(t("integrations.deleteError"))
    }
  }

  const handleSaveApiToken = async (storeId: string) => {
    const token = apiTokenInputs[storeId]
    if (!token) return
    try {
      await updateApiToken.mutateAsync({ storeId, apiToken: token })
      toast.success(t("integrations.apiTokenSaved"))
      setApiTokenInputs((prev) => ({ ...prev, [storeId]: "" }))
    } catch {
      toast.error(t("integrations.apiTokenSaveError"))
    }
  }

  const handleSyncStore = async (storeId: string) => {
    try {
      const result = await syncStore.mutateAsync(storeId)
      toast.success(
        `${t("integrations.synced")} ${result.products_count} ${t("common.products")}`
      )
    } catch {
      toast.error(t("integrations.syncError"))
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t("integrations.never")
    const date = new Date(dateString)
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const isConnecting = kaspiAuth.isPending || phoneAuth.isPending || phoneVerify.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("integrations.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("integrations.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} disabled={!canAddStore}>
          <Plus className="h-4 w-4 mr-2" />
          {t("integrations.addStore")}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("integrations.totalStores")}
              </p>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-2">{stores?.length || 0}<span className="text-sm text-muted-foreground font-normal">/{maxStores}</span></p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("integrations.activeStores")}
              </p>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-semibold mt-2">{connectedStores.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("integrations.productsCount")}
              </p>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-2">{totalProducts}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invalid token alert */}
      {stores?.some((s) => s.api_key_set && !s.api_key_valid) && (
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {stores
                .filter((s) => s.api_key_set && !s.api_key_valid)
                .map((s) => (
                  <p key={s.id} className="text-sm">
                    {t("integrations.apiTokenExpiredAlert").replace("{name}", s.name)}
                  </p>
                ))}
              <p className="text-xs text-muted-foreground">
                {t("integrations.apiTokenExpiredWarning")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stores list */}
      {storesLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stores && stores.length > 0 ? (
        <div className="space-y-4">
          {stores.map((store) => (
            <Card key={store.id} className="glass-card">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-3 rounded-xl ${
                        store.is_active ? "bg-green-500/10" : "bg-muted"
                      }`}
                    >
                      <Store
                        className={`h-6 w-6 ${
                          store.is_active
                            ? "text-green-500"
                            : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{store.name}</h3>
                        <Badge
                          variant={store.is_active ? "default" : "secondary"}
                        >
                          {store.is_active
                            ? t("common.active")
                            : t("common.inactive")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Merchant ID: {store.merchant_id}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {store.products_count || 0}{" "}
                          {t("common.products")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t("integrations.syncLabel")}{" "}
                          {formatDate(store.last_sync)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSyncStore(store.id)}
                      disabled={syncStore.isPending}
                    >
                      {syncStore.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2 hidden sm:inline">
                        {t("integrations.sync")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        setDeleteStoreId(store.id)
                        setShowDeleteDialog(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* API Token Section */}
                <div className="border-t pt-4 mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t("integrations.apiToken")}</span>
                    </div>
                    <Badge
                      variant={
                        store.api_key_set && store.api_key_valid
                          ? "default"
                          : store.api_key_set && !store.api_key_valid
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {store.api_key_set && store.api_key_valid
                        ? t("integrations.apiTokenActive")
                        : store.api_key_set && !store.api_key_valid
                        ? t("integrations.apiTokenInvalid")
                        : t("integrations.apiTokenNotSet")}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {t("integrations.apiTokenDesc")}
                  </p>

                  {/* Token input */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showTokenInputs[store.id] ? "text" : "password"}
                        placeholder={t("integrations.apiTokenPlaceholder")}
                        value={apiTokenInputs[store.id] || ""}
                        onChange={(e) =>
                          setApiTokenInputs((prev) => ({ ...prev, [store.id]: e.target.value }))
                        }
                        disabled={updateApiToken.isPending}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setShowTokenInputs((prev) => ({ ...prev, [store.id]: !prev[store.id] }))
                        }
                      >
                        {showTokenInputs[store.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSaveApiToken(store.id)}
                      disabled={!apiTokenInputs[store.id] || updateApiToken.isPending}
                    >
                      {updateApiToken.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("integrations.apiTokenSave")
                      )}
                    </Button>
                  </div>

                  {/* How to get token - visual instructions */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <ChevronDown className="h-3 w-3" />
                      {t("integrations.apiTokenHowTo")}
                    </summary>
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3 overflow-hidden">
                      <Image
                        src="/instructions.png"
                        alt="Инструкция по получению API токена Kaspi"
                        width={800}
                        height={600}
                        className="w-full h-auto rounded-md"
                        priority={false}
                      />
                    </div>
                    <p className="mt-2 text-yellow-600 dark:text-yellow-500 font-medium">
                      {t("integrations.apiTokenExpiredWarning")}
                    </p>
                  </details>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass-card border-dashed">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center text-center py-8">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Store className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">
                {t("integrations.noStores")}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("integrations.noStoresDesc")}
              </p>
              <Button onClick={() => setShowAddDialog(true)} disabled={!canAddStore}>
                <Plus className="h-4 w-4 mr-2" />
                {t("integrations.addStore")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete store confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open)
        if (!open) setDeleteStoreId(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("integrations.deleteStore")}</DialogTitle>
            <DialogDescription>
              {t("integrations.deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteDialog(false)
              setDeleteStoreId(null)
            }}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteStore}
              disabled={deleteStore.isPending}
            >
              {deleteStore.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t("integrations.deleteStore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add store dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open)
        if (!open) resetDialog()
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("integrations.connectStore")}
            </DialogTitle>
            <DialogDescription>
              {t("integrations.connectDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                {maxStores > 1
                  ? `${t("integrations.storesUsed")}: ${stores?.length ?? 0}/${maxStores}`
                  : t("integrations.storeLimit")}
              </p>
            </div>
          </div>

          {/* Auth method tabs */}
          <div className="flex rounded-lg border p-1 gap-1">
            <button
              type="button"
              onClick={() => { setAuthMethod("phone"); setPhoneStep("phone") }}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
                authMethod === "phone"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              disabled={isConnecting}
            >
              <Phone className="h-4 w-4" />
              {t("integrations.connectByPhone")}
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod("email")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors ${
                authMethod === "email"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              disabled={isConnecting}
            >
              <Mail className="h-4 w-4" />
              {t("integrations.connectByEmail")}
            </button>
          </div>

          {/* Phone auth */}
          {authMethod === "phone" && (
            <div className="space-y-4 pt-2">
              {phoneStep === "phone" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="kaspi-phone">{t("integrations.phoneNumber")}</Label>
                    <div className="flex">
                      <div className="flex items-center justify-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground select-none">
                        +7
                      </div>
                      <Input
                        id="kaspi-phone"
                        type="tel"
                        inputMode="numeric"
                        placeholder="(705) 175-16-03"
                        value={phoneNumber}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 10)
                          setPhoneNumber(digits)
                        }}
                        disabled={phoneAuth.isPending}
                        className="rounded-l-none"
                        maxLength={10}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("integrations.phoneDesc")}
                    </p>
                  </div>
                  <Button
                    onClick={handleSendSms}
                    disabled={phoneAuth.isPending || phoneNumber.length !== 10}
                    className="w-full"
                  >
                    {phoneAuth.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("integrations.sendingSms")}
                      </>
                    ) : (
                      <>
                        <Phone className="h-4 w-4 mr-2" />
                        {t("integrations.sendSms")}
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sms-code">{t("integrations.smsCode")}</Label>
                    <Input
                      id="sms-code"
                      type="text"
                      inputMode="numeric"
                      placeholder={t("integrations.smsCodePlaceholder")}
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                      disabled={phoneVerify.isPending}
                      maxLength={6}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("integrations.smsCodeDesc")}
                    </p>
                  </div>
                  <Button
                    onClick={handleVerifySms}
                    disabled={phoneVerify.isPending || smsCode.length < 4}
                    className="w-full"
                  >
                    {phoneVerify.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("integrations.verifyingSms")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t("integrations.verifySms")}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPhoneStep("phone"); setSmsCode("") }}
                    disabled={phoneVerify.isPending}
                    className="w-full"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("integrations.backToPhone")}
                  </Button>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                {t("integrations.securityNote")}
              </p>
            </div>
          )}

          {/* Email auth */}
          {authMethod === "email" && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="kaspi-email">Email</Label>
                <Input
                  id="kaspi-email"
                  type="email"
                  placeholder="seller@example.com"
                  value={kaspiEmail}
                  onChange={(e) => setKaspiEmail(e.target.value)}
                  disabled={kaspiAuth.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kaspi-password">
                  {t("integrations.password")}
                </Label>
                <Input
                  id="kaspi-password"
                  type="password"
                  placeholder={"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                  value={kaspiPassword}
                  onChange={(e) => setKaspiPassword(e.target.value)}
                  disabled={kaspiAuth.isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("integrations.securityNote")}
              </p>
              <Button
                onClick={handleConnectKaspi}
                disabled={kaspiAuth.isPending}
                className="w-full"
              >
                {kaspiAuth.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("integrations.connecting")}
                  </>
                ) : (
                  <>
                    <Store className="h-4 w-4 mr-2" />
                    {t("integrations.connect")}
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
