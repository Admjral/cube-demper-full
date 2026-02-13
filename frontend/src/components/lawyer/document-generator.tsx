'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useGenerateDocument, useLawyerDocuments, type DocumentType, type LawyerLanguage, type GeneratedDocument } from '@/hooks/api/use-lawyer'
import { FileText, Loader2, Download, Copy, Check, Clock, Info } from 'lucide-react'

interface DocumentGeneratorProps {
  language: LawyerLanguage
}

const documentTypes: { value: DocumentType; label: string; description: string; category: 'contract' | 'employment' | 'claim' | 'marketplace_claim' }[] = [
  { value: 'supply_contract', label: 'Договор поставки', description: 'Договор на поставку товаров между сторонами', category: 'contract' },
  { value: 'sale_contract', label: 'Договор купли-продажи', description: 'Договор на куплю-продажу товаров', category: 'contract' },
  { value: 'service_contract', label: 'Договор оказания услуг', description: 'Договор на оказание услуг между исполнителем и заказчиком', category: 'contract' },
  { value: 'employment_contract', label: 'Трудовой договор', description: 'Договор между работодателем и работником по ТК РК', category: 'employment' },
  { value: 'claim_to_supplier', label: 'Претензия поставщику', description: 'Претензия о ненадлежащем исполнении договора поставки', category: 'claim' },
  { value: 'claim_to_buyer', label: 'Претензия покупателю', description: 'Претензия покупателю о ненадлежащем исполнении обязательств по оплате', category: 'claim' },
  { value: 'claim_to_marketplace', label: 'Претензия маркетплейсу', description: 'Претензия маркетплейсу о нарушении прав продавца', category: 'marketplace_claim' },
]

// Initial form states
const initialContractData = {
  seller_type: 'ИП',
  seller_name: '',
  seller_representative: '',
  seller_bin: '',
  seller_address: '',
  buyer_type: 'ТОО',
  buyer_name: '',
  buyer_representative: '',
  buyer_bin: '',
  buyer_address: '',
  goods_description: '',
  total_amount: '',
  delivery_date: '',
  payment_terms: '',
}

const initialEmploymentData = {
  employer_name: '',
  employer_bin: '',
  employer_address: '',
  employer_representative: '',
  employee_name: '',
  employee_iin: '',
  employee_address: '',
  position: '',
  salary: '',
  work_start_date: '',
  probation_months: '0',
  work_schedule: '5/2, с 9:00 до 18:00',
  vacation_days: '24',
}

const initialClaimData = {
  claimant_name: '',
  claimant_address: '',
  claimant_contacts: '',
  respondent_name: '',
  respondent_address: '',
  contract_number: '',
  contract_date: '',
  claim_description: '',
  requirements: '',
  claim_amount: '',
}

const initialMarketplaceClaimData = {
  claimant_name: '',
  claimant_address: '',
  claimant_contacts: '',
  marketplace_name: 'Kaspi.kz',
  claim_description: '',
  requirements: '',
  claim_amount: '',
}

export function DocumentGenerator({ language }: DocumentGeneratorProps) {
  const [activeTab, setActiveTab] = useState('generate')
  const [docType, setDocType] = useState<DocumentType>('supply_contract')
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null)
  const [copied, setCopied] = useState(false)

  // Form data for each document category
  const [contractData, setContractData] = useState(initialContractData)
  const [employmentData, setEmploymentData] = useState(initialEmploymentData)
  const [claimData, setClaimData] = useState(initialClaimData)
  const [marketplaceClaimData, setMarketplaceClaimData] = useState(initialMarketplaceClaimData)

  const { mutate: generateDocument, isPending } = useGenerateDocument()
  const { data: documents } = useLawyerDocuments()

  const currentDocInfo = documentTypes.find(d => d.value === docType)
  const category = currentDocInfo?.category || 'contract'

  const handleGenerate = () => {
    let data: Record<string, any> = {}
    if (category === 'contract') {
      data = { ...contractData, total_amount: parseInt(contractData.total_amount) || 0 }
    } else if (category === 'employment') {
      data = {
        ...employmentData,
        salary: parseInt(employmentData.salary) || 0,
        probation_months: parseInt(employmentData.probation_months) || 0,
        vacation_days: parseInt(employmentData.vacation_days) || 24,
      }
    } else if (category === 'claim') {
      data = { ...claimData, claim_amount: parseInt(claimData.claim_amount) || 0 }
    } else if (category === 'marketplace_claim') {
      data = { ...marketplaceClaimData, claim_amount: parseInt(marketplaceClaimData.claim_amount) || 0 }
    }

    generateDocument({ document_type: docType, language, data }, {
      onSuccess: (doc) => setGeneratedDoc(doc),
    })
  }

  const handleCopy = () => {
    if (generatedDoc) {
      navigator.clipboard.writeText(generatedDoc.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ---- Render helpers for each form category ----

  const renderContractFields = () => {
    const set = (field: string, value: string) => setContractData(prev => ({ ...prev, [field]: value }))
    const roleLabels = docType === 'service_contract'
      ? { seller: 'Исполнитель', buyer: 'Заказчик' }
      : docType === 'sale_contract'
        ? { seller: 'Продавец', buyer: 'Покупатель' }
        : { seller: 'Поставщик', buyer: 'Покупатель' }

    return (
      <>
        {/* Seller/Provider */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{roleLabels.seller}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Тип</Label>
            <Select value={contractData.seller_type} onValueChange={(v) => set('seller_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ИП">ИП</SelectItem>
                <SelectItem value="ТОО">ТОО</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Наименование</Label>
            <Input placeholder="Иванов И.И." value={contractData.seller_name} onChange={(e) => set('seller_name', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">БИН/ИИН</Label>
            <Input placeholder="123456789012" value={contractData.seller_bin} onChange={(e) => set('seller_bin', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Представитель</Label>
            <Input placeholder="ФИО директора" value={contractData.seller_representative} onChange={(e) => set('seller_representative', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Адрес</Label>
          <Input placeholder="г. Алматы, ул. ..." value={contractData.seller_address} onChange={(e) => set('seller_address', e.target.value)} />
        </div>

        {/* Buyer */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">{roleLabels.buyer}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Тип</Label>
            <Select value={contractData.buyer_type} onValueChange={(v) => set('buyer_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ИП">ИП</SelectItem>
                <SelectItem value="ТОО">ТОО</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Наименование</Label>
            <Input placeholder="Ромашка" value={contractData.buyer_name} onChange={(e) => set('buyer_name', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">БИН/ИИН</Label>
            <Input placeholder="123456789012" value={contractData.buyer_bin} onChange={(e) => set('buyer_bin', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Представитель</Label>
            <Input placeholder="ФИО директора" value={contractData.buyer_representative} onChange={(e) => set('buyer_representative', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Адрес</Label>
          <Input placeholder="г. Алматы, ул. ..." value={contractData.buyer_address} onChange={(e) => set('buyer_address', e.target.value)} />
        </div>

        {/* Subject */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Предмет договора</p>
        <div className="space-y-1">
          <Label className="text-xs">{docType === 'service_contract' ? 'Описание услуг' : 'Описание товаров'}</Label>
          <Textarea placeholder="Электроника: смартфоны, ноутбуки..." value={contractData.goods_description} onChange={(e) => set('goods_description', e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Сумма (тенге)</Label>
            <Input type="number" placeholder="1 000 000" value={contractData.total_amount} onChange={(e) => set('total_amount', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Дата {docType === 'service_contract' ? 'оказания' : 'поставки'}</Label>
            <Input type="date" value={contractData.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Условия оплаты</Label>
          <Input placeholder="В течение 5 банковских дней после поставки" value={contractData.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} />
        </div>
      </>
    )
  }

  const renderEmploymentFields = () => {
    const set = (field: string, value: string) => setEmploymentData(prev => ({ ...prev, [field]: value }))
    return (
      <>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Работодатель</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Наименование</Label>
            <Input placeholder='ТОО "Компания"' value={employmentData.employer_name} onChange={(e) => set('employer_name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">БИН</Label>
            <Input placeholder="123456789012" value={employmentData.employer_bin} onChange={(e) => set('employer_bin', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Представитель</Label>
            <Input placeholder="Директор Иванов И.И." value={employmentData.employer_representative} onChange={(e) => set('employer_representative', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Адрес</Label>
            <Input placeholder="г. Алматы, ул. ..." value={employmentData.employer_address} onChange={(e) => set('employer_address', e.target.value)} />
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Работник</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">ФИО</Label>
            <Input placeholder="Петров Пётр Петрович" value={employmentData.employee_name} onChange={(e) => set('employee_name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ИИН</Label>
            <Input placeholder="900101350123" value={employmentData.employee_iin} onChange={(e) => set('employee_iin', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Адрес работника</Label>
          <Input placeholder="г. Алматы, ул. ..." value={employmentData.employee_address} onChange={(e) => set('employee_address', e.target.value)} />
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Условия работы</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Должность</Label>
            <Input placeholder="Менеджер" value={employmentData.position} onChange={(e) => set('position', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Оклад (тенге/мес)</Label>
            <Input type="number" placeholder="300 000" value={employmentData.salary} onChange={(e) => set('salary', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Дата начала</Label>
            <Input type="date" value={employmentData.work_start_date} onChange={(e) => set('work_start_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Испытательный срок (мес)</Label>
            <Select value={employmentData.probation_months} onValueChange={(v) => set('probation_months', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Без испытательного</SelectItem>
                <SelectItem value="1">1 месяц</SelectItem>
                <SelectItem value="2">2 месяца</SelectItem>
                <SelectItem value="3">3 месяца</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">График работы</Label>
            <Input value={employmentData.work_schedule} onChange={(e) => set('work_schedule', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Отпуск (дней)</Label>
            <Input type="number" value={employmentData.vacation_days} onChange={(e) => set('vacation_days', e.target.value)} />
          </div>
        </div>
      </>
    )
  }

  const renderClaimFields = () => {
    const set = (field: string, value: string) => setClaimData(prev => ({ ...prev, [field]: value }))
    return (
      <>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Заявитель (вы)</p>
        <div className="space-y-1">
          <Label className="text-xs">Наименование / ФИО</Label>
          <Input placeholder='ИП Иванов или ТОО "Ромашка"' value={claimData.claimant_name} onChange={(e) => set('claimant_name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Адрес</Label>
            <Input placeholder="г. Алматы, ул. ..." value={claimData.claimant_address} onChange={(e) => set('claimant_address', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Контакты (телефон)</Label>
            <Input placeholder="+7 (7xx) xxx-xx-xx" value={claimData.claimant_contacts} onChange={(e) => set('claimant_contacts', e.target.value)} />
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">
          {docType === 'claim_to_supplier' ? 'Поставщик (ответчик)' : 'Покупатель (ответчик)'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Наименование</Label>
            <Input placeholder="Название компании" value={claimData.respondent_name} onChange={(e) => set('respondent_name', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Адрес</Label>
            <Input placeholder="г. Алматы, ул. ..." value={claimData.respondent_address} onChange={(e) => set('respondent_address', e.target.value)} />
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Договор (если есть)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Номер договора</Label>
            <Input placeholder="123/2026" value={claimData.contract_number} onChange={(e) => set('contract_number', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Дата договора</Label>
            <Input type="date" value={claimData.contract_date} onChange={(e) => set('contract_date', e.target.value)} />
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Суть претензии</p>
        <div className="space-y-1">
          <Label className="text-xs">Описание нарушения</Label>
          <Textarea placeholder="Опишите что произошло..." value={claimData.claim_description} onChange={(e) => set('claim_description', e.target.value)} rows={3} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Требования</Label>
          <Textarea placeholder="Что вы требуете..." value={claimData.requirements} onChange={(e) => set('requirements', e.target.value)} rows={2} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Сумма требований (тенге)</Label>
          <Input type="number" placeholder="0" value={claimData.claim_amount} onChange={(e) => set('claim_amount', e.target.value)} />
        </div>
      </>
    )
  }

  const renderMarketplaceClaimFields = () => {
    const set = (field: string, value: string) => setMarketplaceClaimData(prev => ({ ...prev, [field]: value }))
    return (
      <>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Заявитель (вы)</p>
        <div className="space-y-1">
          <Label className="text-xs">Наименование / ФИО</Label>
          <Input placeholder='ИП Иванов или ТОО "Ромашка"' value={marketplaceClaimData.claimant_name} onChange={(e) => set('claimant_name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Адрес</Label>
            <Input placeholder="г. Алматы, ул. ..." value={marketplaceClaimData.claimant_address} onChange={(e) => set('claimant_address', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Контакты (телефон)</Label>
            <Input placeholder="+7 (7xx) xxx-xx-xx" value={marketplaceClaimData.claimant_contacts} onChange={(e) => set('claimant_contacts', e.target.value)} />
          </div>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Маркетплейс</p>
        <div className="space-y-1">
          <Label className="text-xs">Маркетплейс</Label>
          <Select value={marketplaceClaimData.marketplace_name} onValueChange={(v) => set('marketplace_name', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Kaspi.kz">Kaspi.kz</SelectItem>
              <SelectItem value="Wildberries">Wildberries</SelectItem>
              <SelectItem value="Ozon">Ozon</SelectItem>
              <SelectItem value="Uzum Market">Uzum Market</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">Суть претензии</p>
        <div className="space-y-1">
          <Label className="text-xs">Описание нарушения</Label>
          <Textarea placeholder="Опишите что произошло (блокировка магазина, удержание средств, и т.д.)..." value={marketplaceClaimData.claim_description} onChange={(e) => set('claim_description', e.target.value)} rows={3} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Требования</Label>
          <Textarea placeholder="Что вы требуете (разблокировка, возврат средств, и т.д.)..." value={marketplaceClaimData.requirements} onChange={(e) => set('requirements', e.target.value)} rows={2} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Сумма требований (тенге)</Label>
          <Input type="number" placeholder="0" value={marketplaceClaimData.claim_amount} onChange={(e) => set('claim_amount', e.target.value)} />
        </div>
      </>
    )
  }

  const renderFormFields = () => {
    switch (category) {
      case 'contract': return renderContractFields()
      case 'employment': return renderEmploymentFields()
      case 'claim': return renderClaimFields()
      case 'marketplace_claim': return renderMarketplaceClaimFields()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b px-4">
          <TabsList className="h-12">
            <TabsTrigger value="generate" className="gap-2">
              <FileText className="h-4 w-4" />
              Создать документ
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="h-4 w-4" />
              История
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="generate" className="flex-1 p-4 overflow-auto">
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
            {/* Form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Параметры документа</CardTitle>
                <CardDescription>Заполните данные для генерации</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-3">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Тип документа</Label>
                      <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {documentTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Description */}
                    {currentDocInfo && (
                      <div className="flex items-start gap-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{currentDocInfo.description}</span>
                      </div>
                    )}

                    {/* Dynamic form fields */}
                    {renderFormFields()}

                    <Button
                      onClick={handleGenerate}
                      disabled={isPending}
                      className="w-full mt-2"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Генерация...
                        </>
                      ) : (
                        'Сгенерировать документ'
                      )}
                    </Button>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Предпросмотр</CardTitle>
                  <CardDescription>
                    {generatedDoc ? generatedDoc.title : 'Документ будет показан здесь'}
                  </CardDescription>
                </div>
                {generatedDoc && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopy}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded border p-4">
                  {generatedDoc ? (
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {generatedDoc.content}
                    </pre>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <FileText className="h-12 w-12" />
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 p-4 overflow-auto">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>История документов</CardTitle>
                <CardDescription>Ранее сгенерированные документы</CardDescription>
              </CardHeader>
              <CardContent>
                {documents && documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 border rounded-lg hover:bg-muted cursor-pointer flex items-center justify-between"
                        onClick={() => { setGeneratedDoc(doc); setActiveTab('generate') }}
                      >
                        <div>
                          <p className="font-medium">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(doc.created_at).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Нет сохранённых документов
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
