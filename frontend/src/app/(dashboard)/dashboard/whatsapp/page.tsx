"use client"

import { useState } from "react"
import { useStore } from "@/store/use-store"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Clock,
  FileText,
  Settings2,
  Plus,
  Edit,
  Trash2,
  Loader2,
  QrCode,
} from "lucide-react"
import { toast } from "sonner"
import {
  useWhatsAppSessions,
  useWhatsAppTemplates,
  useWhatsAppSettings,
  useCreateSession,
  useDeleteSession,
  useSessionQRCode,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useUpdateWhatsAppSettings,
  WhatsAppSession,
  WhatsAppTemplate,
} from "@/hooks/api/use-whatsapp"

export default function WhatsAppPage() {
  const { locale } = useStore()
  const [newSessionName, setNewSessionName] = useState("")
  const [showQRDialog, setShowQRDialog] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({
    name: "",
    name_en: "",
    message: "",
    variables: [] as string[],
  })

  // API hooks
  const { data: sessions, isLoading: sessionsLoading } = useWhatsAppSessions()
  const { data: templates, isLoading: templatesLoading } = useWhatsAppTemplates()
  const { data: settings, isLoading: settingsLoading } = useWhatsAppSettings()
  const { data: qrData, isLoading: qrLoading } = useSessionQRCode(
    selectedSessionId || "",
    showQRDialog && !!selectedSessionId
  )

  const createSession = useCreateSession()
  const deleteSession = useDeleteSession()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const deleteTemplateM = useDeleteTemplate()
  const updateSettings = useUpdateWhatsAppSettings()

  // Get active session
  const activeSession = sessions?.find((s) => s.status === "connected")
  const isConnected = !!activeSession

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      toast.error("Введите имя сессии")
      return
    }
    try {
      const session = await createSession.mutateAsync(newSessionName)
      setSelectedSessionId(session.id)
      setShowQRDialog(true)
      setNewSessionName("")
      toast.success("Сессия создана. Отсканируйте QR-код")
    } catch (error) {
      toast.error("Ошибка создания сессии")
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("Удалить сессию?")) return
    try {
      await deleteSession.mutateAsync(sessionId)
      toast.success("Сессия удалена")
    } catch {
      toast.error("Ошибка удаления")
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.message) {
      toast.error("Заполните название и текст шаблона")
      return
    }
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          name: templateForm.name,
          name_en: templateForm.name_en,
          message: templateForm.message,
          variables: templateForm.variables,
        })
        toast.success("Шаблон обновлён")
      } else {
        await createTemplate.mutateAsync({
          name: templateForm.name,
          name_en: templateForm.name_en,
          message: templateForm.message,
          variables: templateForm.variables,
        })
        toast.success("Шаблон создан")
      }
      setShowTemplateDialog(false)
      setEditingTemplate(null)
      setTemplateForm({ name: "", name_en: "", message: "", variables: [] })
    } catch {
      toast.error("Ошибка сохранения")
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Удалить шаблон?")) return
    try {
      await deleteTemplateM.mutateAsync(templateId)
      toast.success("Шаблон удалён")
    } catch {
      toast.error("Ошибка удаления")
    }
  }

  const handleToggleTemplate = async (template: WhatsAppTemplate) => {
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        is_active: !template.is_active,
      })
    } catch {
      toast.error("Ошибка обновления")
    }
  }

  const handleSaveSettings = async () => {
    if (!settings) return
    try {
      await updateSettings.mutateAsync({
        daily_limit: settings.daily_limit,
        interval_seconds: settings.interval_seconds,
        work_hours_start: settings.work_hours_start,
        work_hours_end: settings.work_hours_end,
      })
      toast.success("Настройки сохранены")
    } catch {
      toast.error("Ошибка сохранения")
    }
  }

  const openEditTemplate = (template: WhatsAppTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      name_en: template.name_en || "",
      message: template.message,
      variables: template.variables,
    })
    setShowTemplateDialog(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {locale === "ru" ? "WhatsApp / WAHA" : "WhatsApp / WAHA"}
          </h1>
          <p className="text-muted-foreground">
            {locale === "ru"
              ? "Автоматизация сообщений клиентам"
              : "Customer message automation"}
          </p>
        </div>
        <Badge
          variant={isConnected ? "default" : "destructive"}
          className="flex items-center gap-2 px-3 py-1.5"
        >
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4" />
              {locale === "ru" ? "Подключено" : "Connected"}
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4" />
              {locale === "ru" ? "Отключено" : "Disconnected"}
            </>
          )}
        </Badge>
      </div>

      {/* Sessions */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {locale === "ru" ? "Сессии WhatsApp" : "WhatsApp Sessions"}
            </span>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  {locale === "ru" ? "Добавить" : "Add"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {locale === "ru" ? "Новая сессия" : "New Session"}
                  </DialogTitle>
                  <DialogDescription>
                    {locale === "ru"
                      ? "Введите имя для новой WhatsApp сессии"
                      : "Enter a name for the new WhatsApp session"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>{locale === "ru" ? "Имя сессии" : "Session name"}</Label>
                    <Input
                      placeholder={locale === "ru" ? "Мой WhatsApp" : "My WhatsApp"}
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleCreateSession}
                    disabled={createSession.isPending}
                    className="w-full"
                  >
                    {createSession.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {locale === "ru" ? "Создать" : "Create"}
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
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        session.status === "connected"
                          ? "bg-green-500"
                          : session.status === "qr_pending"
                          ? "bg-yellow-500 animate-pulse"
                          : "bg-red-500"
                      }`}
                    />
                    <div>
                      <p className="font-medium">{session.session_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {session.phone_number || session.status}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {session.status === "qr_pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedSessionId(session.id)
                          setShowQRDialog(true)
                        }}
                      >
                        <QrCode className="h-4 w-4 mr-2" />
                        QR
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => handleDeleteSession(session.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {locale === "ru"
                ? "Нет сессий. Создайте первую сессию WhatsApp."
                : "No sessions. Create your first WhatsApp session."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* QR Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {locale === "ru" ? "Отсканируйте QR-код" : "Scan QR Code"}
            </DialogTitle>
            <DialogDescription>
              {locale === "ru"
                ? "Откройте WhatsApp на телефоне и отсканируйте код"
                : "Open WhatsApp on your phone and scan this code"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            {qrLoading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : qrData?.qr_code ? (
              <img
                src={`data:image/png;base64,${qrData.qr_code}`}
                alt="QR Code"
                className="w-64 h-64"
              />
            ) : qrData?.status === "connected" ? (
              <div className="text-center">
                <Wifi className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <p className="text-green-500 font-medium">
                  {locale === "ru" ? "Подключено!" : "Connected!"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {locale === "ru" ? "QR-код загружается..." : "Loading QR code..."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="templates">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="templates" className="flex-1 sm:flex-none">
            <FileText className="h-4 w-4 mr-2" />
            {locale === "ru" ? "Шаблоны" : "Templates"}
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 sm:flex-none">
            <Settings2 className="h-4 w-4 mr-2" />
            {locale === "ru" ? "Настройки" : "Settings"}
          </TabsTrigger>
        </TabsList>

        {/* Templates tab */}
        <TabsContent value="templates" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              {locale === "ru" ? "Шаблоны сообщений" : "Message templates"}
            </h2>
            <Button
              onClick={() => {
                setEditingTemplate(null)
                setTemplateForm({ name: "", name_en: "", message: "", variables: [] })
                setShowTemplateDialog(true)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              {locale === "ru" ? "Добавить" : "Add"}
            </Button>
          </div>

          {templatesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="space-y-4">
              {templates.map((template) => (
                <Card key={template.id} className="glass-card">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">
                            {locale === "ru" ? template.name : template.name_en || template.name}
                          </h3>
                          <Switch
                            checked={template.is_active}
                            onCheckedChange={() => handleToggleTemplate(template)}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 p-3 bg-muted/30 rounded-lg">
                          {template.message}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {template.variables.map((v) => (
                            <Badge key={v} variant="outline" className="text-xs">
                              {`{{${v}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditTemplate(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeleteTemplate(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {locale === "ru"
                ? "Нет шаблонов. Создайте первый шаблон."
                : "No templates. Create your first template."}
            </p>
          )}
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings" className="space-y-6 mt-4">
          {settingsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : settings ? (
            <>
              {/* Limits */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {locale === "ru" ? "Лимиты и интервалы" : "Limits and intervals"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        {locale === "ru"
                          ? "Лимит сообщений в день"
                          : "Daily message limit"}
                      </Label>
                      <Input
                        type="number"
                        value={settings.daily_limit}
                        onChange={(e) =>
                          updateSettings.mutate({
                            daily_limit: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {locale === "ru"
                          ? "Интервал между сообщениями (сек)"
                          : "Interval between messages (sec)"}
                      </Label>
                      <Input
                        type="number"
                        value={settings.interval_seconds}
                        onChange={(e) =>
                          updateSettings.mutate({
                            interval_seconds: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Working hours */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {locale === "ru" ? "Рабочие часы" : "Working hours"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{locale === "ru" ? "Начало" : "Start"}</Label>
                      <Input
                        type="time"
                        value={settings.work_hours_start}
                        onChange={(e) =>
                          updateSettings.mutate({
                            work_hours_start: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{locale === "ru" ? "Конец" : "End"}</Label>
                      <Input
                        type="time"
                        value={settings.work_hours_end}
                        onChange={(e) =>
                          updateSettings.mutate({
                            work_hours_end: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {locale === "ru"
                      ? "Сообщения будут отправляться только в указанное время"
                      : "Messages will only be sent during specified hours"}
                  </p>
                </CardContent>
              </Card>

              <Button onClick={handleSaveSettings} className="w-full sm:w-auto">
                {locale === "ru" ? "Сохранить настройки" : "Save settings"}
              </Button>
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate
                ? locale === "ru"
                  ? "Редактировать шаблон"
                  : "Edit Template"
                : locale === "ru"
                ? "Новый шаблон"
                : "New Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>{locale === "ru" ? "Название" : "Name"}</Label>
              <Input
                value={templateForm.name}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, name: e.target.value })
                }
                placeholder={locale === "ru" ? "Заказ принят" : "Order received"}
              />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ru" ? "Название (EN)" : "Name (EN)"}</Label>
              <Input
                value={templateForm.name_en}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, name_en: e.target.value })
                }
                placeholder="Order received"
              />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ru" ? "Текст сообщения" : "Message text"}</Label>
              <textarea
                className="w-full min-h-[100px] p-3 rounded-md border bg-background"
                value={templateForm.message}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, message: e.target.value })
                }
                placeholder={
                  locale === "ru"
                    ? "Здравствуйте, {{name}}! Ваш заказ #{{order_id}} принят."
                    : "Hello, {{name}}! Your order #{{order_id}} is received."
                }
              />
              <p className="text-xs text-muted-foreground">
                {locale === "ru"
                  ? "Используйте {{переменная}} для подстановки данных"
                  : "Use {{variable}} for data substitution"}
              </p>
            </div>
            <Button
              onClick={handleSaveTemplate}
              disabled={createTemplate.isPending || updateTemplate.isPending}
              className="w-full"
            >
              {(createTemplate.isPending || updateTemplate.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {locale === "ru" ? "Сохранить" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
