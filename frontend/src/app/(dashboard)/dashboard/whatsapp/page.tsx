"use client"

import { useState, useEffect } from "react"
import { useStore } from "@/store/use-store"
import { useT } from "@/lib/i18n"
import { SubscriptionGate } from "@/components/shared/subscription-gate"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  MessageSquare,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Loader2,
  QrCode,
  Send,
  Phone,
  Users,
  Megaphone,
  Ban,
  Play,
  Search,
  XCircle,
  FileText,
  Bot,
  Pencil,
  BarChart3,
  Clock,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import {
  useWhatsAppSessions,
  useCreateSession,
  useDeleteSession,
  useSessionQRCode,
  usePairByPhone,
  useSendWhatsAppMessage,
  useCustomerContacts,
  useBlockContact,
  useUnblockContact,
  useBroadcasts,
  useCreateBroadcast,
  useStartBroadcast,
  useCancelBroadcast,
  useWhatsAppTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useAISalesmanSettings,
  useUpdateAISalesmanSettings,
  useAISalesmanHistory,
  useAISalesmanStats,
  type WhatsAppTemplate,
  type AISalesmanSettings,
} from "@/hooks/api/use-whatsapp"
import { useStores } from "@/hooks/api/use-stores"
import { TemplatePicker } from "@/components/whatsapp/template-picker"
import { TemplateEditor } from "@/components/whatsapp/template-editor"
import { PRESET_TEMPLATES, type PresetTemplate } from "@/components/whatsapp/template-constants"

export default function WhatsAppPage() {
  const { locale } = useStore()
  const t = useT()
  const [activeTab, setActiveTab] = useState("broadcasts")

  // Session state
  const [newSessionName, setNewSessionName] = useState("")
  const [showQRDialog, setShowQRDialog] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // Phone pairing state
  const [pairingTab, setPairingTab] = useState<"qr" | "phone">("qr")
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)

  // Manual send state
  const [manualSendPhone, setManualSendPhone] = useState("")
  const [manualSendMessage, setManualSendMessage] = useState("")

  // API hooks
  const { data: sessions, isLoading: sessionsLoading } = useWhatsAppSessions()
  const { data: qrData, isLoading: qrLoading } = useSessionQRCode(
    selectedSessionId || "",
    showQRDialog && !!selectedSessionId
  )

  const createSession = useCreateSession()
  const deleteSession = useDeleteSession()
  const pairByPhone = usePairByPhone()
  const sendMessage = useSendWhatsAppMessage()

  // Get active session
  const activeSession = sessions?.find((s) => s.status === "connected")
  const isConnected = !!activeSession

  // Auto-close QR dialog when session connects
  useEffect(() => {
    if (qrData?.status === "connected" && showQRDialog) {
      setShowQRDialog(false)
      setPairingCode(null)
      setPairingPhone("")
      setPairingTab("qr")
      toast.success(t("wa.connectedBang"))
    }
  }, [qrData?.status])

  // Session handlers
  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      toast.error(t("wa.enterSessionName"))
      return
    }
    try {
      const session = await createSession.mutateAsync(newSessionName)
      setSelectedSessionId(session.id)
      setShowQRDialog(true)
      setNewSessionName("")
      toast.success(locale === "ru" ? "Сессия создана. Отсканируйте QR-код" : "Session created. Scan QR code")
    } catch {
      toast.error(t("wa.sessionCreateError"))
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm(t("wa.deleteSession"))) return
    try {
      await deleteSession.mutateAsync(sessionId)
      toast.success(t("wa.sessionDeleted"))
    } catch {
      toast.error(t("wa.deleteError"))
    }
  }

  // Manual send handler
  const handleManualSend = async () => {
    if (!manualSendPhone || !manualSendMessage) {
      toast.error(locale === "ru" ? "Заполните номер и сообщение" : "Fill in phone and message")
      return
    }
    if (!activeSession) {
      toast.error(locale === "ru" ? "Нет активной сессии WhatsApp" : "No active WhatsApp session")
      return
    }
    try {
      await sendMessage.mutateAsync({
        session_id: activeSession.id,
        phone: manualSendPhone,
        message: manualSendMessage,
      })
      toast.success(locale === "ru" ? "Сообщение отправлено" : "Message sent")
      setManualSendPhone("")
      setManualSendMessage("")
    } catch {
      toast.error(locale === "ru" ? "Ошибка отправки" : "Error sending")
    }
  }

  return (
    <SubscriptionGate>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("wa.broadcastTitle")}</h1>
          <p className="text-muted-foreground">
            {t("wa.broadcastSubtitle")}
          </p>
        </div>
        <Badge
          variant={isConnected ? "default" : "destructive"}
          className="flex items-center gap-2 px-3 py-1.5"
        >
          {isConnected ? (
            <><Wifi className="h-4 w-4" />{t("wa.connected")}</>
          ) : (
            <><WifiOff className="h-4 w-4" />{t("wa.disconnected")}</>
          )}
        </Badge>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex overflow-x-auto lg:grid lg:grid-cols-5">
          <TabsTrigger value="broadcasts" className="gap-2 shrink-0">
            <Megaphone className="h-4 w-4 hidden sm:block" />
            {t("wa.broadcasts")}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2 shrink-0">
            <Users className="h-4 w-4 hidden sm:block" />
            {t("wa.contacts")}
          </TabsTrigger>
          <TabsTrigger value="connection" className="gap-2 shrink-0">
            <MessageSquare className="h-4 w-4 hidden sm:block" />
            {t("wa.connection")}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2 shrink-0">
            <FileText className="h-4 w-4 hidden sm:block" />
            {t("wa.templates")}
          </TabsTrigger>
          <TabsTrigger value="salesman" className="gap-2 shrink-0">
            <Bot className="h-4 w-4 hidden sm:block" />
            {t("wa.aiSalesmanTab")}
          </TabsTrigger>
        </TabsList>

        {/* Broadcasts Tab */}
        <TabsContent value="broadcasts" className="space-y-6 mt-6">
          <BroadcastsTab />
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="space-y-6 mt-6">
          <ContactsTab />
        </TabsContent>

        {/* Connection Tab */}
        <TabsContent value="connection" className="space-y-6 mt-6">
          {/* Sessions Card */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {t("wa.whatsappSessions")}
                </span>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      {t("common.add")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("wa.newSession")}</DialogTitle>
                      <DialogDescription>
                        {t("wa.newSessionDesc")}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>{t("wa.sessionName")}</Label>
                        <Input
                          placeholder={t("wa.sessionDefault")}
                          value={newSessionName}
                          onChange={(e) => setNewSessionName(e.target.value)}
                        />
                      </div>
                      <Button onClick={handleCreateSession} disabled={createSession.isPending} className="w-full">
                        {createSession.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {t("common.create")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : sessions && sessions.length > 0 ? (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div key={session.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full shrink-0 ${
                          session.status === "connected" ? "bg-green-500" :
                          session.status === "qr_pending" ? "bg-yellow-500 animate-pulse" : "bg-red-500"
                        }`} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{session.session_name}</p>
                          <p className="text-sm text-muted-foreground">{session.phone_number || session.status}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 self-end sm:self-auto">
                        {session.status === "qr_pending" && (
                          <Button variant="outline" size="sm" onClick={() => { setSelectedSessionId(session.id); setShowQRDialog(true) }}>
                            <QrCode className="h-4 w-4 mr-2" />QR
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteSession(session.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {t("wa.noSessions")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Manual Send Card */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                {t("wa.sendMessage")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("wa.phoneNumber")}</Label>
                  <Input
                    placeholder="+7 777 123 4567"
                    value={manualSendPhone}
                    onChange={(e) => setManualSendPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("wa.message")}</Label>
                <Textarea
                  placeholder={t("wa.messagePlaceholder")}
                  value={manualSendMessage}
                  onChange={(e) => setManualSendMessage(e.target.value)}
                  rows={3}
                />
              </div>
              <Button onClick={handleManualSend} disabled={sendMessage.isPending || !isConnected}>
                {sendMessage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Send className="h-4 w-4 mr-2" />
                {t("common.send")}
              </Button>
              {!isConnected && (
                <p className="text-sm text-destructive">
                  {t("wa.connectToSend")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <TemplatesTab />
        </TabsContent>

        {/* AI Salesman Tab */}
        <TabsContent value="salesman" className="space-y-6 mt-6">
          <AISalesmanTab />
        </TabsContent>
      </Tabs>

      {/* QR / Phone Pairing Dialog */}
      <Dialog open={showQRDialog} onOpenChange={(open) => {
        setShowQRDialog(open)
        if (!open) {
          setPairingCode(null)
          setPairingPhone("")
          setPairingTab("qr")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("wa.scanQR")}</DialogTitle>
            <DialogDescription>
              {t("wa.scanQRDesc")}
            </DialogDescription>
          </DialogHeader>

          {/* Tabs: QR / Phone */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={pairingTab === "qr" ? "default" : "ghost"}
              size="sm"
              onClick={() => setPairingTab("qr")}
            >
              <QrCode className="h-4 w-4 mr-2" />
              {t("wa.qrTab")}
            </Button>
            <Button
              variant={pairingTab === "phone" ? "default" : "ghost"}
              size="sm"
              onClick={() => setPairingTab("phone")}
            >
              <Phone className="h-4 w-4 mr-2" />
              {t("wa.phoneTab")}
            </Button>
          </div>

          {pairingTab === "qr" ? (
            <div className="flex flex-col items-center py-4">
              {qrLoading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : qrData?.qr_code ? (
                <img src={`data:image/png;base64,${qrData.qr_code}`} alt="QR Code" className="w-64 h-64" />
              ) : qrData?.status === "connected" ? (
                <div className="text-center">
                  <Wifi className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <p className="text-green-500 font-medium">{t("wa.connectedBang")}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("wa.qrLoading")}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("wa.enterPhone")}</Label>
                <Input
                  placeholder="+7 700 123 4567"
                  value={pairingPhone}
                  onChange={(e) => setPairingPhone(e.target.value)}
                  disabled={pairByPhone.isPending}
                />
              </div>

              {!pairingCode ? (
                <Button
                  className="w-full"
                  onClick={async () => {
                    if (!selectedSessionId || !pairingPhone.trim()) return
                    try {
                      const result = await pairByPhone.mutateAsync({
                        sessionId: selectedSessionId,
                        phoneNumber: pairingPhone,
                      })
                      setPairingCode(result.code)
                    } catch {
                      toast.error(t("wa.pairingError"))
                    }
                  }}
                  disabled={pairByPhone.isPending || !pairingPhone.trim()}
                >
                  {pairByPhone.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {t("wa.getCode")}
                </Button>
              ) : (
                <div className="text-center space-y-3">
                  <p className="text-sm text-muted-foreground">{t("wa.pairingCode")}</p>
                  <p className="text-3xl font-mono font-bold tracking-widest">{pairingCode}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("wa.pairingInstruction")}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </SubscriptionGate>
  )
}


// ==================== Templates Tab ====================

function TemplatesTab() {
  const t = useT()
  const { locale } = useStore()

  const { data: templates, isLoading } = useWhatsAppTemplates()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const deleteTemplate = useDeleteTemplate()

  const [showPicker, setShowPicker] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [form, setForm] = useState({
    name: "",
    name_en: "",
    message: "",
    variables: [] as string[],
    trigger_event: "",
  })

  const triggerMap = Object.fromEntries(
    PRESET_TEMPLATES.filter((p) => p.triggerEvent).map((p) => [
      p.triggerEvent,
      { icon: p.icon, labelRu: p.nameRu, labelEn: p.nameEn },
    ])
  )

  const getTriggerLabel = (event: string | null) => {
    if (!event) return { icon: "\u270F\uFE0F", label: t("wa.noTrigger") }
    const info = triggerMap[event]
    if (!info) return { icon: "\u270F\uFE0F", label: event }
    return { icon: info.icon, label: locale === "ru" ? info.labelRu : info.labelEn }
  }

  const handleSelectPreset = (preset: PresetTemplate) => {
    setEditingTemplate(null)
    setForm({
      name: locale === "ru" ? preset.nameRu : preset.nameEn,
      name_en: preset.nameEn,
      message: locale === "ru" ? preset.messageRu : preset.messageEn,
      variables: [],
      trigger_event: preset.triggerEvent,
    })
    setShowPicker(false)
    setShowEditor(true)
  }

  const handleEdit = (template: WhatsAppTemplate) => {
    setEditingTemplate(template)
    setForm({
      name: template.name,
      name_en: template.name_en || "",
      message: template.message,
      variables: template.variables || [],
      trigger_event: template.trigger_event || "",
    })
    setShowEditor(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.message) {
      toast.error(t("wa.fillNameAndText"))
      return
    }
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          name: form.name,
          name_en: form.name_en || undefined,
          message: form.message,
          variables: form.variables,
          trigger_event: form.trigger_event || undefined,
        })
        toast.success(t("wa.templateUpdated"))
      } else {
        await createTemplate.mutateAsync({
          name: form.name,
          name_en: form.name_en || undefined,
          message: form.message,
          variables: form.variables,
          trigger_event: form.trigger_event || undefined,
        })
        toast.success(t("wa.templateCreated"))
      }
      setShowEditor(false)
      setEditingTemplate(null)
    } catch {
      toast.error(t("wa.saveError"))
    }
  }

  const handleToggleActive = async (template: WhatsAppTemplate) => {
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        is_active: !template.is_active,
      })
    } catch {
      toast.error(t("wa.updateError"))
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!confirm(t("wa.deleteTemplate"))) return
    try {
      await deleteTemplate.mutateAsync(templateId)
      toast.success(t("wa.templateDeleted"))
    } catch {
      toast.error(t("wa.deleteError"))
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t("wa.messageTemplates")}
          </h3>
        </div>
        <Button onClick={() => setShowPicker(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("wa.addTemplate")}
        </Button>
      </div>

      {/* Templates List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-4">
                <div className="h-16 bg-muted/50 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !templates?.length ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t("wa.noTemplates")}</h3>
            <Button variant="outline" onClick={() => setShowPicker(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-2" />
              {t("wa.addTemplate")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => {
            const trigger = getTriggerLabel(template.trigger_event)
            return (
              <Card key={template.id} className="glass-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{template.name}</h4>
                        {template.trigger_event && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {trigger.icon} {trigger.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.message.substring(0, 120)}
                        {template.message.length > 120 && "..."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={template.is_active}
                        onCheckedChange={() => handleToggleActive(template)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Template Picker (bottom sheet) */}
      <TemplatePicker
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={handleSelectPreset}
      />

      {/* Template Editor (side sheet) */}
      <TemplateEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        isSaving={createTemplate.isPending || updateTemplate.isPending}
        isEditing={!!editingTemplate}
        triggerLabel={getTriggerLabel(form.trigger_event).label}
      />
    </div>
  )
}


// ==================== AI Salesman Tab ====================

function AISalesmanTab() {
  const t = useT()
  const { locale } = useStore()
  const { data: stores } = useStores()

  const [selectedStoreId, setSelectedStoreId] = useState<string>("")
  const [statsDays, setStatsDays] = useState(7)

  const { data: allSettings, isLoading: settingsLoading } = useAISalesmanSettings()
  const updateSettings = useUpdateAISalesmanSettings()
  const { data: statsData } = useAISalesmanStats(statsDays)
  const { data: historyData } = useAISalesmanHistory(20)

  // Local form state for settings
  const [settingsForm, setSettingsForm] = useState<{
    ai_enabled: boolean
    ai_tone: string
    ai_discount_percent: number
    ai_promo_code: string
    ai_review_bonus: string
    ai_send_delay_minutes: number
    ai_max_messages_per_day: number
  }>({
    ai_enabled: true,
    ai_tone: "friendly",
    ai_discount_percent: 0,
    ai_promo_code: "",
    ai_review_bonus: "",
    ai_send_delay_minutes: 10,
    ai_max_messages_per_day: 50,
  })

  // Auto-select first store
  useEffect(() => {
    if (!selectedStoreId && stores?.length) {
      setSelectedStoreId(stores[0].id)
    }
  }, [stores, selectedStoreId])

  // Sync form with fetched settings
  useEffect(() => {
    if (!allSettings || !selectedStoreId) return
    const settings = allSettings.find((s) => s.store_id === selectedStoreId)
    if (settings) {
      setSettingsForm({
        ai_enabled: settings.ai_enabled,
        ai_tone: settings.ai_tone || "friendly",
        ai_discount_percent: settings.ai_discount_percent || 0,
        ai_promo_code: settings.ai_promo_code || "",
        ai_review_bonus: settings.ai_review_bonus || "",
        ai_send_delay_minutes: settings.ai_send_delay_minutes,
        ai_max_messages_per_day: settings.ai_max_messages_per_day,
      })
    }
  }, [allSettings, selectedStoreId])

  const handleSaveSettings = async () => {
    if (!selectedStoreId) return
    try {
      await updateSettings.mutateAsync({
        storeId: selectedStoreId,
        ...settingsForm,
      })
      toast.success(t("wa.settingsSaved"))
    } catch {
      toast.error(t("wa.settingsSaveError"))
    }
  }

  const triggerLabels: Record<string, string> = {
    new_order: t("wa.newOrders"),
    order_approved: t("wa.orderPaid"),
    repeat_customer: t("wa.repeatCustomers"),
    review_request: t("wa.reviewRequest"),
    order_completed: t("wa.orderCompleted"),
  }

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t("wa.aiSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Store selector */}
          {stores && stores.length > 1 && (
            <div className="space-y-2">
              <Label>{t("wa.selectStore")}</Label>
              <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("wa.selectStore")} />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {settingsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !stores?.length ? (
            <p className="text-center text-muted-foreground py-4">{t("wa.noStoresAI")}</p>
          ) : (
            <>
              {/* AI Enabled */}
              <div className="flex items-center justify-between">
                <Label>{t("wa.aiEnabled")}</Label>
                <Switch
                  checked={settingsForm.ai_enabled}
                  onCheckedChange={(v) => setSettingsForm((f) => ({ ...f, ai_enabled: v }))}
                />
              </div>

              {/* Tone */}
              <div className="space-y-2">
                <Label>{t("wa.tone")}</Label>
                <Select
                  value={settingsForm.ai_tone}
                  onValueChange={(v) => setSettingsForm((f) => ({ ...f, ai_tone: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">{t("wa.friendly")}</SelectItem>
                    <SelectItem value="professional">{t("wa.professional")}</SelectItem>
                    <SelectItem value="casual">{t("wa.casual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Grid: discount, promo, review bonus, delay, limit */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("wa.maxDiscount")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={settingsForm.ai_discount_percent}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, ai_discount_percent: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("wa.promoCode")}</Label>
                  <Input
                    value={settingsForm.ai_promo_code}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, ai_promo_code: e.target.value }))}
                    placeholder="SALE10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("wa.reviewBonus")}</Label>
                  <Input
                    value={settingsForm.ai_review_bonus}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, ai_review_bonus: e.target.value }))}
                    placeholder={t("wa.reviewBonusDefault")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("wa.delay")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settingsForm.ai_send_delay_minutes}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, ai_send_delay_minutes: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("wa.messagesLimit")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settingsForm.ai_max_messages_per_day}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, ai_max_messages_per_day: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              <Button onClick={handleSaveSettings} disabled={updateSettings.isPending}>
                {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("common.save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t("wa.stats")}
            </span>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <Button
                  key={d}
                  variant={statsDays === d ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setStatsDays(d)}
                >
                  {d === 7 ? t("wa.period7d") : d === 30 ? t("wa.period30d") : t("wa.period90d")}
                </Button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsData ? (
            <div className="space-y-4">
              {/* Stats cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 text-center">
                  <p className="text-2xl font-semibold">{statsData.total_messages}</p>
                  <p className="text-xs text-muted-foreground">{t("wa.totalMessages")}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 text-center">
                  <p className="text-2xl font-semibold">{statsData.by_trigger?.new_order || statsData.by_trigger?.order_approved || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("wa.newOrders")}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 text-center">
                  <p className="text-2xl font-semibold">{statsData.by_trigger?.repeat_customer || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("wa.repeatCustomers")}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 text-center">
                  <p className="text-2xl font-semibold">{statsData.by_trigger?.review_request || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("wa.reviewRequests")}</p>
                </div>
              </div>

              {/* Daily breakdown */}
              {statsData.by_day?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">{t("wa.dailyStats")}</h4>
                  <div className="space-y-1">
                    {statsData.by_day.map((day) => (
                      <div key={day.date} className="flex items-center justify-between py-1.5 border-b border-muted/30 last:border-0">
                        <span className="text-sm text-muted-foreground">{day.date}</span>
                        <span className="text-sm font-medium">{day.count} {t("wa.msgs")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message History */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t("wa.aiMessageHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!historyData?.messages?.length ? (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t("wa.noHistory")}</h3>
              <p className="text-muted-foreground">{t("wa.noHistoryDesc")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyData.messages.map((msg) => (
                <div key={msg.id} className="p-3 rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        {triggerLabels[msg.trigger] || msg.trigger}
                      </Badge>
                      <span className="text-sm font-medium">{msg.customer_phone}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.created_at).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{msg.text}</p>
                  {msg.products_suggested?.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {msg.products_suggested.map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


// ==================== Contacts Tab ====================

function ContactsTab() {
  const t = useT()
  const { selectedStore } = useStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)

  const { data, isLoading } = useCustomerContacts({
    store_id: selectedStore?.id,
    search: searchQuery || undefined,
    page,
    per_page: 30,
  })

  const blockContact = useBlockContact()
  const unblockContact = useUnblockContact()

  const contacts = data?.contacts || []
  const total = data?.total || 0

  return (
    <div className="space-y-4">
      {/* Header with search */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t("wa.contacts")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("wa.contactsDesc")}
              </p>
            </div>
            <Badge variant="secondary" className="text-sm shrink-0">
              {t("wa.totalContacts")}: {total}
            </Badge>
          </div>
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("wa.searchContacts")}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Contacts list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="glass-card">
              <CardContent className="p-4">
                <div className="h-12 bg-muted/50 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t("wa.noContacts")}</h3>
            <p className="text-muted-foreground">{t("wa.noContactsDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contacts.map(contact => (
            <Card key={contact.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {contact.name || contact.phone}
                      </p>
                      {contact.store_name && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {contact.store_name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </span>
                      <span>{contact.orders_count} {t("wa.orders")}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (contact.is_blocked) {
                        unblockContact.mutate(contact.id)
                      } else {
                        blockContact.mutate(contact.id)
                      }
                    }}
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    {contact.is_blocked ? t("wa.unblock") : t("wa.block")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {total > 30 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                {t("wa.previous")}
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-3">
                {page} / {Math.ceil(total / 30)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(total / 30)}
                onClick={() => setPage(p => p + 1)}
              >
                &rarr;
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ==================== Broadcasts Tab ====================

function BroadcastsTab() {
  const t = useT()
  const { selectedStore } = useStore()
  const { data: stores } = useStores()
  const [showCreate, setShowCreate] = useState(false)
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    message_text: "",
    filter_min_orders: 0,
    filter_store_id: "",
  })

  const { data: broadcasts, isLoading } = useBroadcasts()
  const createBroadcast = useCreateBroadcast()
  const startBroadcast = useStartBroadcast()
  const cancelBroadcast = useCancelBroadcast()

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      draft: { label: t("wa.broadcastDraft"), className: "bg-muted text-muted-foreground" },
      sending: { label: t("wa.broadcastSending"), className: "bg-blue-500/20 text-blue-600" },
      completed: { label: t("wa.broadcastCompleted"), className: "bg-green-500/20 text-green-600" },
      failed: { label: t("wa.broadcastFailed"), className: "bg-red-500/20 text-red-600" },
      cancelled: { label: t("wa.broadcastCancelled"), className: "bg-yellow-500/20 text-yellow-600" },
    }
    const s = map[status] || map.draft
    return <Badge className={s.className}>{s.label}</Badge>
  }

  const handleCreate = async () => {
    if (!newCampaign.name || !newCampaign.message_text) {
      toast.error("Fill in name and message")
      return
    }
    try {
      await createBroadcast.mutateAsync({
        name: newCampaign.name,
        message_text: newCampaign.message_text,
        filter_min_orders: newCampaign.filter_min_orders,
        filter_store_id: newCampaign.filter_store_id || undefined,
      })
      toast.success("Broadcast created")
      setShowCreate(false)
      setNewCampaign({ name: "", message_text: "", filter_min_orders: 0, filter_store_id: "" })
    } catch {
      toast.error("Failed to create broadcast")
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            {t("wa.broadcasts")}
          </h3>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("wa.newBroadcast")}
        </Button>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("wa.newBroadcast")}</DialogTitle>
            <DialogDescription>{t("wa.contactsDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("wa.broadcastName")}</Label>
              <Input
                value={newCampaign.name}
                onChange={e => setNewCampaign(c => ({ ...c, name: e.target.value }))}
                placeholder="Акция февраль"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("wa.broadcastMessage")}</Label>
              <Textarea
                value={newCampaign.message_text}
                onChange={e => setNewCampaign(c => ({ ...c, message_text: e.target.value }))}
                placeholder="Здравствуйте! У нас скидки до 30%..."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("wa.broadcastMinOrders")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={newCampaign.filter_min_orders}
                  onChange={e => setNewCampaign(c => ({ ...c, filter_min_orders: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("wa.broadcastStore")}</Label>
                <Select
                  value={newCampaign.filter_store_id}
                  onValueChange={v => setNewCampaign(c => ({ ...c, filter_store_id: v === "all" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("wa.broadcastAllStores")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("wa.broadcastAllStores")}</SelectItem>
                    {stores?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={createBroadcast.isPending}
            >
              {createBroadcast.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("wa.broadcastCreate")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Broadcasts list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <Card key={i} className="glass-card">
              <CardContent className="p-4">
                <div className="h-16 bg-muted/50 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !broadcasts?.length ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t("wa.noBroadcasts")}</h3>
            <p className="text-muted-foreground">{t("wa.noBroadcastsDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {broadcasts.map(campaign => (
            <Card key={campaign.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{campaign.name}</h4>
                      {statusBadge(campaign.status)}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {campaign.message_text.substring(0, 80)}...
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{t("wa.broadcastRecipients")}: {campaign.total_recipients}</span>
                      {campaign.status === "sending" && (
                        <span className="text-blue-600">
                          {t("wa.broadcastProgress")}: {campaign.sent_count}/{campaign.total_recipients}
                        </span>
                      )}
                      {campaign.status === "completed" && (
                        <span className="text-green-600">
                          {t("wa.sent")}: {campaign.sent_count}, {t("wa.failed")}: {campaign.failed_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {campaign.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={() => startBroadcast.mutate(campaign.id)}
                        disabled={startBroadcast.isPending}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {t("wa.broadcastStart")}
                      </Button>
                    )}
                    {(campaign.status === "draft" || campaign.status === "sending") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelBroadcast.mutate(campaign.id)}
                        disabled={cancelBroadcast.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {t("wa.broadcastCancel")}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
