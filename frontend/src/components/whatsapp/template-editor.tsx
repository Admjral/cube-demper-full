"use client"

import { useRef } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Loader2 } from "lucide-react"
import { VARIABLE_CHIPS } from "./template-constants"
import { TemplatePreview } from "./template-preview"

interface TemplateForm {
  name: string
  name_en: string
  message: string
  variables: string[]
  trigger_event: string
}

interface TemplateEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: TemplateForm
  setForm: React.Dispatch<React.SetStateAction<TemplateForm>>
  onSave: () => void
  isSaving: boolean
  isEditing: boolean
  triggerLabel: string
  locale: string
}

export function TemplateEditor({
  open,
  onOpenChange,
  form,
  setForm,
  onSave,
  isSaving,
  isEditing,
  triggerLabel,
  locale,
}: TemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertVariable = (variable: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = form.message
    const newText = text.slice(0, start) + `{${variable}}` + text.slice(end)
    setForm((f) => ({ ...f, message: newText }))
    requestAnimationFrame(() => {
      const pos = start + variable.length + 2
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="flex-row items-center gap-3 px-4 py-3 border-b space-y-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 -ml-2"
            onClick={() => onOpenChange(false)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-base truncate">
              {isEditing
                ? locale === "ru" ? "Редактировать шаблон" : "Edit Template"
                : locale === "ru" ? "Новый шаблон" : "New Template"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {locale === "ru" ? "Настройте текст шаблона" : "Configure template text"}
            </SheetDescription>
          </div>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving || !form.name || !form.message}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {locale === "ru" ? "Сохранить" : "Save"}
          </Button>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === "ru" ? "Название" : "Name"}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={locale === "ru" ? "Заказ принят" : "Order received"}
            />
          </div>

          {/* Name EN */}
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === "ru" ? "Название (EN)" : "Name (EN)"}</Label>
            <Input
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
              placeholder="Order received"
            />
          </div>

          {/* Trigger badge */}
          {form.trigger_event && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {locale === "ru" ? "Триггер:" : "Trigger:"}
              </span>
              <Badge variant="secondary" className="text-xs">
                {triggerLabel}
              </Badge>
            </div>
          )}

          {/* Message textarea */}
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === "ru" ? "Текст сообщения" : "Message"}</Label>
            <Textarea
              ref={textareaRef}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder={locale === "ru" ? "Введите текст шаблона..." : "Enter template text..."}
              rows={6}
              className="resize-none"
            />
          </div>

          {/* Variable chips */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">
              {locale === "ru" ? "Вставить переменную:" : "Insert variable:"}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {VARIABLE_CHIPS.map((chip) => (
                <button
                  key={chip.variable}
                  type="button"
                  onClick={() => insertVariable(chip.variable)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border bg-card hover:bg-accent/50 active:scale-95 transition-all"
                >
                  {locale === "ru" ? chip.labelRu : chip.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="pt-2 border-t">
            <TemplatePreview message={form.message} locale={locale} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
