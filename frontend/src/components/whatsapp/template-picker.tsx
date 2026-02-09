import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { PRESET_TEMPLATES, type PresetTemplate } from "./template-constants"

interface TemplatePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (preset: PresetTemplate) => void
  locale: string
}

export function TemplatePicker({ open, onOpenChange, onSelect, locale }: TemplatePickerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle>
            {locale === "ru" ? "Выберите шаблон" : "Choose a template"}
          </SheetTitle>
          <SheetDescription>
            {locale === "ru"
              ? "Готовые шаблоны для событий заказа или создайте свой"
              : "Pre-built templates for order events or create your own"}
          </SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          {PRESET_TEMPLATES.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-card hover:bg-accent/50 active:scale-[0.97] transition-all text-center"
            >
              <span className="text-3xl">{preset.icon}</span>
              <span className="text-sm font-medium leading-tight">
                {locale === "ru" ? preset.nameRu : preset.nameEn}
              </span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
