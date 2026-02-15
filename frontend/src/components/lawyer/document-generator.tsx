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
import {
  useGenerateDocument, useUpdateDocument, useDownloadDocumentPdf,
  useLawyerDocuments,
  type DocumentType, type LawyerLanguage, type GeneratedDocument
} from '@/hooks/api/use-lawyer'
import { FileText, Loader2, Download, Copy, Check, Clock, Info, Save, Pencil, Eye } from 'lucide-react'

interface DocumentGeneratorProps {
  language: LawyerLanguage
}

type DocCategory = 'contract' | 'rent' | 'employment' | 'claim' | 'marketplace_claim' | 'complaint' | 'registration' | 'application' | 'act'

const documentTypes: { value: DocumentType; label: string; description: string; category: DocCategory }[] = [
  // Contracts
  { value: 'supply_contract', label: 'Договор поставки', description: 'Договор на поставку товаров между сторонами', category: 'contract' },
  { value: 'sale_contract', label: 'Договор купли-продажи', description: 'Договор на куплю-продажу товаров', category: 'contract' },
  { value: 'service_contract', label: 'Договор оказания услуг', description: 'Договор на оказание услуг между исполнителем и заказчиком', category: 'contract' },
  { value: 'rent_contract', label: 'Договор аренды', description: 'Договор аренды имущества (помещение, оборудование)', category: 'rent' },
  { value: 'employment_contract', label: 'Трудовой договор', description: 'Договор между работодателем и работником по ТК РК', category: 'employment' },
  // Claims
  { value: 'claim_to_supplier', label: 'Претензия поставщику', description: 'Претензия о ненадлежащем исполнении договора поставки', category: 'claim' },
  { value: 'claim_to_buyer', label: 'Претензия покупателю', description: 'Претензия покупателю о ненадлежащем исполнении обязательств по оплате', category: 'claim' },
  { value: 'claim_to_marketplace', label: 'Претензия маркетплейсу', description: 'Претензия маркетплейсу о нарушении прав продавца', category: 'marketplace_claim' },
  { value: 'complaint_to_authority', label: 'Жалоба в орган', description: 'Жалоба в государственный орган на нарушение прав', category: 'complaint' },
  // Applications
  { value: 'ip_registration', label: 'Регистрация ИП', description: 'Заявление о государственной регистрации ИП', category: 'registration' },
  { value: 'too_registration', label: 'Регистрация ТОО', description: 'Заявление о государственной регистрации ТОО', category: 'registration' },
  { value: 'license_application', label: 'Заявление на лицензию', description: 'Заявление на получение лицензии на деятельность', category: 'application' },
  { value: 'tax_application', label: 'Заявление в налоговую', description: 'Заявление в департамент государственных доходов', category: 'application' },
  // Acts
  { value: 'acceptance_act', label: 'Акт приёма-передачи', description: 'Акт приёма-передачи имущества между сторонами', category: 'act' },
  { value: 'work_completion_act', label: 'Акт выполненных работ', description: 'Акт подтверждения выполненных работ/услуг', category: 'act' },
  { value: 'reconciliation_act', label: 'Акт сверки', description: 'Акт сверки взаиморасчётов между контрагентами', category: 'act' },
]

// Initial form states
const initialContractData = {
  seller_type: 'ИП', seller_name: '', seller_representative: '', seller_bin: '', seller_address: '',
  buyer_type: 'ТОО', buyer_name: '', buyer_representative: '', buyer_bin: '', buyer_address: '',
  goods_description: '', total_amount: '', delivery_date: '', payment_terms: '',
}

const initialRentData = {
  landlord_type: 'ИП', landlord_name: '', landlord_representative: '', landlord_bin: '', landlord_address: '',
  tenant_type: 'ТОО', tenant_name: '', tenant_representative: '', tenant_bin: '', tenant_address: '',
  property_description: '', rental_purpose: 'коммерческая деятельность',
  rent_amount: '', payment_day: '5', utilities_payment: 'Арендатором отдельно',
  start_date: '', end_date: '',
}

const initialEmploymentData = {
  employer_name: '', employer_bin: '', employer_address: '', employer_representative: '',
  employee_name: '', employee_iin: '', employee_address: '',
  position: '', salary: '', work_start_date: '', probation_months: '0',
  work_schedule: '5/2, с 9:00 до 18:00', vacation_days: '24',
}

const initialClaimData = {
  claimant_name: '', claimant_address: '', claimant_contacts: '',
  respondent_name: '', respondent_address: '',
  contract_number: '', contract_date: '',
  claim_description: '', requirements: '', claim_amount: '',
}

const initialMarketplaceClaimData = {
  claimant_name: '', claimant_address: '', claimant_contacts: '',
  marketplace_name: 'Kaspi.kz', claim_description: '', requirements: '', claim_amount: '',
}

const initialComplaintData = {
  applicant_name: '', applicant_address: '', applicant_contacts: '', applicant_iin: '',
  authority_name: '', authority_address: '',
  complaint_subject: '', complaint_description: '', legal_basis: '', requirements: '',
}

const initialIpRegistrationData = {
  applicant_name: '', applicant_iin: '', applicant_address: '', applicant_phone: '',
  birth_date: '', business_address: '', business_name: '',
  activity_type: '', tax_regime: 'Упрощённая декларация (спецрежим)',
  business_form: 'Личное предпринимательство', tax_office: '',
}

const initialTooRegistrationData = {
  company_name: '', legal_address: '', charter_capital: '100000',
  founders_info: '', founders_shares: '',
  director_name: '', director_iin: '',
  activity_types: '', tax_regime: 'Общеустановленный режим', justice_department: '',
}

const initialLicenseData = {
  applicant_type: 'ТОО', applicant_name: '', applicant_bin: '', applicant_address: '', applicant_phone: '',
  licensing_authority: '', business_address: '',
  license_type: '', license_subtype: '', qualifications: '', applicant_representative: '',
}

const initialTaxApplicationData = {
  taxpayer_type: 'ИП', taxpayer_name: '', taxpayer_bin: '', taxpayer_address: '', taxpayer_phone: '', taxpayer_rnn: '',
  application_type: '', application_body: '', request_text: '', attachments: '', taxpayer_representative: '', tax_office: '',
}

const initialAcceptanceActData = {
  sender_type: 'ТОО', sender_name: '', sender_representative: '', sender_basis: 'Устава',
  receiver_type: 'ТОО', receiver_name: '', receiver_representative: '', receiver_basis: 'Устава',
  items_table: '', total_amount: '', condition: 'Имущество передано в исправном состоянии', claims: 'Не имеются',
}

const initialWorkActData = {
  executor_type: 'ТОО', executor_name: '', executor_representative: '', executor_basis: 'Устава',
  customer_type: 'ТОО', customer_name: '', customer_representative: '', customer_basis: 'Устава',
  contract_number: '', contract_date: '', works_table: '', total_amount: '', vat_text: 'включая НДС 12%',
}

const initialReconciliationData = {
  party1_type: 'ТОО', party1_name: '', party1_representative: '',
  party2_type: 'ТОО', party2_name: '', party2_representative: '',
  contract_number: '', contract_date: '', period_start: '', period_end: '',
  party1_operations: '', party2_operations: '',
  party1_debit_total: '0', party1_credit_total: '0',
  party2_debit_total: '0', party2_credit_total: '0',
  reconciliation_result: 'Расхождений не обнаружено.',
}

export function DocumentGenerator({ language }: DocumentGeneratorProps) {
  const [activeTab, setActiveTab] = useState('generate')
  const [docType, setDocType] = useState<DocumentType>('supply_contract')
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null)
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  // Form data for each category
  const [contractData, setContractData] = useState(initialContractData)
  const [rentData, setRentData] = useState(initialRentData)
  const [employmentData, setEmploymentData] = useState(initialEmploymentData)
  const [claimData, setClaimData] = useState(initialClaimData)
  const [marketplaceClaimData, setMarketplaceClaimData] = useState(initialMarketplaceClaimData)
  const [complaintData, setComplaintData] = useState(initialComplaintData)
  const [ipRegData, setIpRegData] = useState(initialIpRegistrationData)
  const [tooRegData, setTooRegData] = useState(initialTooRegistrationData)
  const [licenseData, setLicenseData] = useState(initialLicenseData)
  const [taxAppData, setTaxAppData] = useState(initialTaxApplicationData)
  const [acceptanceActData, setAcceptanceActData] = useState(initialAcceptanceActData)
  const [workActData, setWorkActData] = useState(initialWorkActData)
  const [reconciliationData, setReconciliationData] = useState(initialReconciliationData)

  const { mutate: generateDocument, isPending } = useGenerateDocument()
  const { mutate: updateDocument, isPending: isSaving } = useUpdateDocument()
  const { mutate: downloadPdf, isPending: isDownloading } = useDownloadDocumentPdf()
  const { data: documents } = useLawyerDocuments()

  const currentDocInfo = documentTypes.find(d => d.value === docType)
  const category = currentDocInfo?.category || 'contract'

  const handleGenerate = () => {
    let data: Record<string, any> = {}

    switch (category) {
      case 'contract':
        data = { ...contractData, total_amount: parseInt(contractData.total_amount) || 0 }
        break
      case 'rent':
        data = { ...rentData, rent_amount: parseInt(rentData.rent_amount) || 0 }
        break
      case 'employment':
        data = { ...employmentData, salary: parseInt(employmentData.salary) || 0, probation_months: parseInt(employmentData.probation_months) || 0, vacation_days: parseInt(employmentData.vacation_days) || 24 }
        break
      case 'claim':
        data = { ...claimData, claim_amount: parseInt(claimData.claim_amount) || 0 }
        break
      case 'marketplace_claim':
        data = { ...marketplaceClaimData, claim_amount: parseInt(marketplaceClaimData.claim_amount) || 0 }
        break
      case 'complaint':
        data = { ...complaintData }
        break
      case 'registration':
        data = docType === 'ip_registration' ? { ...ipRegData } : { ...tooRegData }
        break
      case 'application':
        data = docType === 'license_application' ? { ...licenseData } : { ...taxAppData }
        break
      case 'act':
        if (docType === 'acceptance_act') data = { ...acceptanceActData, total_amount: parseInt(acceptanceActData.total_amount) || 0 }
        else if (docType === 'work_completion_act') data = { ...workActData, total_amount: parseInt(workActData.total_amount) || 0 }
        else data = { ...reconciliationData }
        break
    }

    generateDocument({ document_type: docType, language, data }, {
      onSuccess: (doc) => {
        setGeneratedDoc(doc)
        setIsEditing(false)
      },
    })
  }

  const handleCopy = () => {
    if (generatedDoc) {
      navigator.clipboard.writeText(isEditing ? editContent : generatedDoc.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleEdit = () => {
    if (generatedDoc) {
      setEditContent(generatedDoc.content)
      setIsEditing(true)
    }
  }

  const handleSave = () => {
    if (generatedDoc) {
      updateDocument({ id: generatedDoc.id, content: editContent }, {
        onSuccess: () => {
          setGeneratedDoc({ ...generatedDoc, content: editContent })
          setIsEditing(false)
        },
      })
    }
  }

  const handleDownloadPdf = () => {
    if (generatedDoc) {
      downloadPdf({ id: generatedDoc.id, title: generatedDoc.title })
    }
  }

  // ---- Form field helpers ----

  const field = (label: string, value: string, onChange: (v: string) => void, opts?: { type?: string; placeholder?: string; rows?: number }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {opts?.rows ? (
        <Textarea placeholder={opts.placeholder || ''} value={value} onChange={(e) => onChange(e.target.value)} rows={opts.rows} />
      ) : (
        <Input type={opts?.type || 'text'} placeholder={opts?.placeholder || ''} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )

  const typeSelect = (label: string, value: string, onChange: (v: string) => void) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ИП">ИП</SelectItem>
          <SelectItem value="ТОО">ТОО</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )

  const sectionTitle = (title: string) => (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-2">{title}</p>
  )

  // ---- Render forms per category ----

  const renderContractFields = () => {
    const set = (f: string, v: string) => setContractData(prev => ({ ...prev, [f]: v }))
    const role = docType === 'service_contract' ? { s: 'Исполнитель', b: 'Заказчик' } : docType === 'sale_contract' ? { s: 'Продавец', b: 'Покупатель' } : { s: 'Поставщик', b: 'Покупатель' }
    return (<>
      {sectionTitle(role.s)}
      <div className="grid grid-cols-2 gap-3">
        {typeSelect('Тип', contractData.seller_type, v => set('seller_type', v))}
        {field('Наименование', contractData.seller_name, v => set('seller_name', v), { placeholder: 'Иванов И.И.' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('БИН/ИИН', contractData.seller_bin, v => set('seller_bin', v), { placeholder: '123456789012' })}
        {field('Представитель', contractData.seller_representative, v => set('seller_representative', v), { placeholder: 'ФИО директора' })}
      </div>
      {field('Адрес', contractData.seller_address, v => set('seller_address', v), { placeholder: 'г. Алматы, ул. ...' })}
      {sectionTitle(role.b)}
      <div className="grid grid-cols-2 gap-3">
        {typeSelect('Тип', contractData.buyer_type, v => set('buyer_type', v))}
        {field('Наименование', contractData.buyer_name, v => set('buyer_name', v), { placeholder: 'Ромашка' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('БИН/ИИН', contractData.buyer_bin, v => set('buyer_bin', v), { placeholder: '123456789012' })}
        {field('Представитель', contractData.buyer_representative, v => set('buyer_representative', v), { placeholder: 'ФИО директора' })}
      </div>
      {field('Адрес', contractData.buyer_address, v => set('buyer_address', v), { placeholder: 'г. Алматы, ул. ...' })}
      {sectionTitle('Предмет договора')}
      {field(docType === 'service_contract' ? 'Описание услуг' : 'Описание товаров', contractData.goods_description, v => set('goods_description', v), { placeholder: 'Электроника: смартфоны, ноутбуки...', rows: 2 })}
      <div className="grid grid-cols-2 gap-3">
        {field('Сумма (тенге)', contractData.total_amount, v => set('total_amount', v), { type: 'number', placeholder: '1000000' })}
        {field('Дата ' + (docType === 'service_contract' ? 'оказания' : 'поставки'), contractData.delivery_date, v => set('delivery_date', v), { type: 'date' })}
      </div>
      {field('Условия оплаты', contractData.payment_terms, v => set('payment_terms', v), { placeholder: 'В течение 5 банковских дней после поставки' })}
    </>)
  }

  const renderRentFields = () => {
    const set = (f: string, v: string) => setRentData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Арендодатель')}
      <div className="grid grid-cols-2 gap-3">
        {typeSelect('Тип', rentData.landlord_type, v => set('landlord_type', v))}
        {field('Наименование', rentData.landlord_name, v => set('landlord_name', v), { placeholder: 'Иванов И.И.' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('БИН/ИИН', rentData.landlord_bin, v => set('landlord_bin', v), { placeholder: '123456789012' })}
        {field('Представитель', rentData.landlord_representative, v => set('landlord_representative', v))}
      </div>
      {field('Адрес', rentData.landlord_address, v => set('landlord_address', v), { placeholder: 'г. Алматы, ул. ...' })}
      {sectionTitle('Арендатор')}
      <div className="grid grid-cols-2 gap-3">
        {typeSelect('Тип', rentData.tenant_type, v => set('tenant_type', v))}
        {field('Наименование', rentData.tenant_name, v => set('tenant_name', v))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('БИН/ИИН', rentData.tenant_bin, v => set('tenant_bin', v), { placeholder: '123456789012' })}
        {field('Представитель', rentData.tenant_representative, v => set('tenant_representative', v))}
      </div>
      {field('Адрес', rentData.tenant_address, v => set('tenant_address', v), { placeholder: 'г. Алматы, ул. ...' })}
      {sectionTitle('Объект аренды')}
      {field('Описание имущества', rentData.property_description, v => set('property_description', v), { placeholder: 'Нежилое помещение, 100 кв.м, 1 этаж', rows: 2 })}
      {field('Цель аренды', rentData.rental_purpose, v => set('rental_purpose', v))}
      <div className="grid grid-cols-2 gap-3">
        {field('Арендная плата (тенге/мес)', rentData.rent_amount, v => set('rent_amount', v), { type: 'number', placeholder: '200000' })}
        {field('Оплата до (число)', rentData.payment_day, v => set('payment_day', v), { placeholder: '5' })}
      </div>
      {field('Коммунальные услуги', rentData.utilities_payment, v => set('utilities_payment', v))}
      <div className="grid grid-cols-2 gap-3">
        {field('Дата начала', rentData.start_date, v => set('start_date', v), { type: 'date' })}
        {field('Дата окончания', rentData.end_date, v => set('end_date', v), { type: 'date' })}
      </div>
    </>)
  }

  const renderEmploymentFields = () => {
    const set = (f: string, v: string) => setEmploymentData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Работодатель')}
      <div className="grid grid-cols-2 gap-3">
        {field('Наименование', employmentData.employer_name, v => set('employer_name', v), { placeholder: 'ТОО "Компания"' })}
        {field('БИН', employmentData.employer_bin, v => set('employer_bin', v), { placeholder: '123456789012' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('Представитель', employmentData.employer_representative, v => set('employer_representative', v))}
        {field('Адрес', employmentData.employer_address, v => set('employer_address', v), { placeholder: 'г. Алматы, ул. ...' })}
      </div>
      {sectionTitle('Работник')}
      <div className="grid grid-cols-2 gap-3">
        {field('ФИО', employmentData.employee_name, v => set('employee_name', v), { placeholder: 'Петров Пётр Петрович' })}
        {field('ИИН', employmentData.employee_iin, v => set('employee_iin', v), { placeholder: '900101350123' })}
      </div>
      {field('Адрес', employmentData.employee_address, v => set('employee_address', v), { placeholder: 'г. Алматы, ул. ...' })}
      {sectionTitle('Условия работы')}
      <div className="grid grid-cols-2 gap-3">
        {field('Должность', employmentData.position, v => set('position', v), { placeholder: 'Менеджер' })}
        {field('Оклад (тенге/мес)', employmentData.salary, v => set('salary', v), { type: 'number', placeholder: '300000' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('Дата начала', employmentData.work_start_date, v => set('work_start_date', v), { type: 'date' })}
        <div className="space-y-1">
          <Label className="text-xs">Испытательный срок</Label>
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
        {field('График', employmentData.work_schedule, v => set('work_schedule', v))}
        {field('Отпуск (дней)', employmentData.vacation_days, v => set('vacation_days', v), { type: 'number' })}
      </div>
    </>)
  }

  const renderClaimFields = () => {
    const set = (f: string, v: string) => setClaimData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Заявитель (вы)')}
      {field('Наименование / ФИО', claimData.claimant_name, v => set('claimant_name', v), { placeholder: 'ИП Иванов' })}
      <div className="grid grid-cols-2 gap-3">
        {field('Адрес', claimData.claimant_address, v => set('claimant_address', v), { placeholder: 'г. Алматы, ул. ...' })}
        {field('Телефон', claimData.claimant_contacts, v => set('claimant_contacts', v), { placeholder: '+7 (7xx) xxx-xx-xx' })}
      </div>
      {sectionTitle(docType === 'claim_to_supplier' ? 'Поставщик (ответчик)' : 'Покупатель (ответчик)')}
      <div className="grid grid-cols-2 gap-3">
        {field('Наименование', claimData.respondent_name, v => set('respondent_name', v))}
        {field('Адрес', claimData.respondent_address, v => set('respondent_address', v))}
      </div>
      {sectionTitle('Договор (если есть)')}
      <div className="grid grid-cols-2 gap-3">
        {field('Номер', claimData.contract_number, v => set('contract_number', v), { placeholder: '123/2026' })}
        {field('Дата', claimData.contract_date, v => set('contract_date', v), { type: 'date' })}
      </div>
      {sectionTitle('Суть претензии')}
      {field('Описание нарушения', claimData.claim_description, v => set('claim_description', v), { rows: 3 })}
      {field('Требования', claimData.requirements, v => set('requirements', v), { rows: 2 })}
      {field('Сумма требований (тенге)', claimData.claim_amount, v => set('claim_amount', v), { type: 'number' })}
    </>)
  }

  const renderMarketplaceClaimFields = () => {
    const set = (f: string, v: string) => setMarketplaceClaimData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Заявитель (вы)')}
      {field('Наименование / ФИО', marketplaceClaimData.claimant_name, v => set('claimant_name', v))}
      <div className="grid grid-cols-2 gap-3">
        {field('Адрес', marketplaceClaimData.claimant_address, v => set('claimant_address', v))}
        {field('Телефон', marketplaceClaimData.claimant_contacts, v => set('claimant_contacts', v))}
      </div>
      {sectionTitle('Маркетплейс')}
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
      {sectionTitle('Суть претензии')}
      {field('Описание нарушения', marketplaceClaimData.claim_description, v => set('claim_description', v), { rows: 3 })}
      {field('Требования', marketplaceClaimData.requirements, v => set('requirements', v), { rows: 2 })}
      {field('Сумма требований (тенге)', marketplaceClaimData.claim_amount, v => set('claim_amount', v), { type: 'number' })}
    </>)
  }

  const renderComplaintFields = () => {
    const set = (f: string, v: string) => setComplaintData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Заявитель')}
      {field('ФИО', complaintData.applicant_name, v => set('applicant_name', v))}
      <div className="grid grid-cols-2 gap-3">
        {field('Адрес', complaintData.applicant_address, v => set('applicant_address', v))}
        {field('Телефон', complaintData.applicant_contacts, v => set('applicant_contacts', v))}
      </div>
      {field('ИИН (необязательно)', complaintData.applicant_iin, v => set('applicant_iin', v), { placeholder: '900101350123' })}
      {sectionTitle('Государственный орган')}
      {field('Наименование органа', complaintData.authority_name, v => set('authority_name', v), { placeholder: 'Департамент по защите прав потребителей' })}
      {field('Адрес органа', complaintData.authority_address, v => set('authority_address', v))}
      {sectionTitle('Суть жалобы')}
      {field('Предмет жалобы', complaintData.complaint_subject, v => set('complaint_subject', v), { placeholder: 'нарушение прав потребителя' })}
      {field('Описание', complaintData.complaint_description, v => set('complaint_description', v), { rows: 3 })}
      {field('Правовое основание', complaintData.legal_basis, v => set('legal_basis', v), { placeholder: 'ГК РК, Закон о защите прав потребителей' })}
      {field('Требования (ПРОШУ)', complaintData.requirements, v => set('requirements', v), { rows: 2 })}
    </>)
  }

  const renderRegistrationFields = () => {
    if (docType === 'ip_registration') {
      const set = (f: string, v: string) => setIpRegData(prev => ({ ...prev, [f]: v }))
      return (<>
        {sectionTitle('Сведения о заявителе')}
        {field('ФИО', ipRegData.applicant_name, v => set('applicant_name', v))}
        <div className="grid grid-cols-2 gap-3">
          {field('ИИН', ipRegData.applicant_iin, v => set('applicant_iin', v))}
          {field('Дата рождения', ipRegData.birth_date, v => set('birth_date', v), { type: 'date' })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field('Адрес регистрации', ipRegData.applicant_address, v => set('applicant_address', v))}
          {field('Телефон', ipRegData.applicant_phone, v => set('applicant_phone', v))}
        </div>
        {sectionTitle('Деятельность')}
        {field('Наименование ИП', ipRegData.business_name, v => set('business_name', v))}
        {field('Адрес деятельности', ipRegData.business_address, v => set('business_address', v))}
        {field('Вид деятельности (ОКЭД)', ipRegData.activity_type, v => set('activity_type', v), { placeholder: '47.91 Розничная торговля по заказам' })}
        {field('Режим налогообложения', ipRegData.tax_regime, v => set('tax_regime', v))}
        {field('Налоговый орган', ipRegData.tax_office, v => set('tax_office', v), { placeholder: 'по месту жительства' })}
      </>)
    }
    // ТОО registration
    const set = (f: string, v: string) => setTooRegData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Сведения о ТОО')}
      {field('Наименование', tooRegData.company_name, v => set('company_name', v), { placeholder: 'Ромашка' })}
      {field('Юридический адрес', tooRegData.legal_address, v => set('legal_address', v))}
      {field('Уставный капитал (тенге)', tooRegData.charter_capital, v => set('charter_capital', v), { type: 'number' })}
      {sectionTitle('Учредители')}
      {field('Сведения об учредителях', tooRegData.founders_info, v => set('founders_info', v), { rows: 2, placeholder: 'ФИО, ИИН, адрес' })}
      {field('Доли учредителей', tooRegData.founders_shares, v => set('founders_shares', v), { rows: 2 })}
      {sectionTitle('Руководитель')}
      <div className="grid grid-cols-2 gap-3">
        {field('ФИО директора', tooRegData.director_name, v => set('director_name', v))}
        {field('ИИН', tooRegData.director_iin, v => set('director_iin', v))}
      </div>
      {sectionTitle('Деятельность')}
      {field('Виды деятельности (ОКЭД)', tooRegData.activity_types, v => set('activity_types', v), { rows: 2 })}
      {field('Режим налогообложения', tooRegData.tax_regime, v => set('tax_regime', v))}
      {field('Департамент юстиции', tooRegData.justice_department, v => set('justice_department', v), { placeholder: 'по месту нахождения' })}
    </>)
  }

  const renderApplicationFields = () => {
    if (docType === 'license_application') {
      const set = (f: string, v: string) => setLicenseData(prev => ({ ...prev, [f]: v }))
      return (<>
        {sectionTitle('Заявитель')}
        <div className="grid grid-cols-2 gap-3">
          {typeSelect('Тип', licenseData.applicant_type, v => set('applicant_type', v))}
          {field('Наименование', licenseData.applicant_name, v => set('applicant_name', v))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field('БИН/ИИН', licenseData.applicant_bin, v => set('applicant_bin', v))}
          {field('Телефон', licenseData.applicant_phone, v => set('applicant_phone', v))}
        </div>
        {field('Юр. адрес', licenseData.applicant_address, v => set('applicant_address', v))}
        {field('Адрес деятельности', licenseData.business_address, v => set('business_address', v))}
        {sectionTitle('Лицензия')}
        {field('Лицензирующий орган', licenseData.licensing_authority, v => set('licensing_authority', v))}
        {field('Вид деятельности', licenseData.license_type, v => set('license_type', v))}
        {field('Подвид деятельности', licenseData.license_subtype, v => set('license_subtype', v))}
        {field('Квалификационные требования', licenseData.qualifications, v => set('qualifications', v), { rows: 2 })}
      </>)
    }
    // Tax application
    const set = (f: string, v: string) => setTaxAppData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Налогоплательщик')}
      <div className="grid grid-cols-2 gap-3">
        {typeSelect('Тип', taxAppData.taxpayer_type, v => set('taxpayer_type', v))}
        {field('Наименование', taxAppData.taxpayer_name, v => set('taxpayer_name', v))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('БИН/ИИН', taxAppData.taxpayer_bin, v => set('taxpayer_bin', v))}
        {field('РНН', taxAppData.taxpayer_rnn, v => set('taxpayer_rnn', v))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('Адрес', taxAppData.taxpayer_address, v => set('taxpayer_address', v))}
        {field('Телефон', taxAppData.taxpayer_phone, v => set('taxpayer_phone', v))}
      </div>
      {sectionTitle('Заявление')}
      {field('Тип заявления', taxAppData.application_type, v => set('application_type', v), { placeholder: 'О постановке на учёт по НДС' })}
      {field('Текст заявления', taxAppData.application_body, v => set('application_body', v), { rows: 3 })}
      {field('Прошу (требования)', taxAppData.request_text, v => set('request_text', v), { rows: 2 })}
      {field('Приложения', taxAppData.attachments, v => set('attachments', v), { rows: 2 })}
      {field('Налоговый орган', taxAppData.tax_office, v => set('tax_office', v), { placeholder: 'по месту регистрации' })}
    </>)
  }

  const renderActFields = () => {
    if (docType === 'acceptance_act') {
      const set = (f: string, v: string) => setAcceptanceActData(prev => ({ ...prev, [f]: v }))
      return (<>
        {sectionTitle('Передающая сторона')}
        <div className="grid grid-cols-2 gap-3">
          {typeSelect('Тип', acceptanceActData.sender_type, v => set('sender_type', v))}
          {field('Наименование', acceptanceActData.sender_name, v => set('sender_name', v))}
        </div>
        {field('Представитель', acceptanceActData.sender_representative, v => set('sender_representative', v))}
        {sectionTitle('Принимающая сторона')}
        <div className="grid grid-cols-2 gap-3">
          {typeSelect('Тип', acceptanceActData.receiver_type, v => set('receiver_type', v))}
          {field('Наименование', acceptanceActData.receiver_name, v => set('receiver_name', v))}
        </div>
        {field('Представитель', acceptanceActData.receiver_representative, v => set('receiver_representative', v))}
        {sectionTitle('Имущество')}
        {field('Перечень имущества', acceptanceActData.items_table, v => set('items_table', v), { rows: 3, placeholder: '1. Ноутбук HP — 1 шт.\n2. Монитор Dell — 2 шт.' })}
        {field('Сумма (тенге)', acceptanceActData.total_amount, v => set('total_amount', v), { type: 'number' })}
        {field('Состояние', acceptanceActData.condition, v => set('condition', v))}
      </>)
    }
    if (docType === 'work_completion_act') {
      const set = (f: string, v: string) => setWorkActData(prev => ({ ...prev, [f]: v }))
      return (<>
        {sectionTitle('Исполнитель')}
        <div className="grid grid-cols-2 gap-3">
          {typeSelect('Тип', workActData.executor_type, v => set('executor_type', v))}
          {field('Наименование', workActData.executor_name, v => set('executor_name', v))}
        </div>
        {field('Представитель', workActData.executor_representative, v => set('executor_representative', v))}
        {sectionTitle('Заказчик')}
        <div className="grid grid-cols-2 gap-3">
          {typeSelect('Тип', workActData.customer_type, v => set('customer_type', v))}
          {field('Наименование', workActData.customer_name, v => set('customer_name', v))}
        </div>
        {field('Представитель', workActData.customer_representative, v => set('customer_representative', v))}
        {sectionTitle('Договор')}
        <div className="grid grid-cols-2 gap-3">
          {field('Номер договора', workActData.contract_number, v => set('contract_number', v))}
          {field('Дата договора', workActData.contract_date, v => set('contract_date', v), { type: 'date' })}
        </div>
        {sectionTitle('Работы')}
        {field('Перечень работ', workActData.works_table, v => set('works_table', v), { rows: 3, placeholder: '1. Разработка сайта — 500 000 тг\n2. Дизайн — 200 000 тг' })}
        {field('Общая сумма (тенге)', workActData.total_amount, v => set('total_amount', v), { type: 'number' })}
      </>)
    }
    // Reconciliation
    const set = (f: string, v: string) => setReconciliationData(prev => ({ ...prev, [f]: v }))
    return (<>
      {sectionTitle('Сторона 1')}
      <div className="grid grid-cols-2 gap-3">
        {typeSelect('Тип', reconciliationData.party1_type, v => set('party1_type', v))}
        {field('Наименование', reconciliationData.party1_name, v => set('party1_name', v))}
      </div>
      {field('Представитель', reconciliationData.party1_representative, v => set('party1_representative', v))}
      {sectionTitle('Сторона 2')}
      <div className="grid grid-cols-2 gap-3">
        {typeSelect('Тип', reconciliationData.party2_type, v => set('party2_type', v))}
        {field('Наименование', reconciliationData.party2_name, v => set('party2_name', v))}
      </div>
      {field('Представитель', reconciliationData.party2_representative, v => set('party2_representative', v))}
      {sectionTitle('Договор и период')}
      <div className="grid grid-cols-2 gap-3">
        {field('Номер договора', reconciliationData.contract_number, v => set('contract_number', v))}
        {field('Дата договора', reconciliationData.contract_date, v => set('contract_date', v), { type: 'date' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('Период с', reconciliationData.period_start, v => set('period_start', v), { type: 'date' })}
        {field('Период по', reconciliationData.period_end, v => set('period_end', v), { type: 'date' })}
      </div>
      {sectionTitle('Операции стороны 1')}
      {field('Операции', reconciliationData.party1_operations, v => set('party1_operations', v), { rows: 2, placeholder: '| 01.01.2026 | Оплата по счёту №1 | 100 000 | 0 |' })}
      <div className="grid grid-cols-2 gap-3">
        {field('Итого дебет', reconciliationData.party1_debit_total, v => set('party1_debit_total', v))}
        {field('Итого кредит', reconciliationData.party1_credit_total, v => set('party1_credit_total', v))}
      </div>
      {sectionTitle('Операции стороны 2')}
      {field('Операции', reconciliationData.party2_operations, v => set('party2_operations', v), { rows: 2 })}
      <div className="grid grid-cols-2 gap-3">
        {field('Итого дебет', reconciliationData.party2_debit_total, v => set('party2_debit_total', v))}
        {field('Итого кредит', reconciliationData.party2_credit_total, v => set('party2_credit_total', v))}
      </div>
      {field('Результат сверки', reconciliationData.reconciliation_result, v => set('reconciliation_result', v))}
    </>)
  }

  const renderFormFields = () => {
    switch (category) {
      case 'contract': return renderContractFields()
      case 'rent': return renderRentFields()
      case 'employment': return renderEmploymentFields()
      case 'claim': return renderClaimFields()
      case 'marketplace_claim': return renderMarketplaceClaimFields()
      case 'complaint': return renderComplaintFields()
      case 'registration': return renderRegistrationFields()
      case 'application': return renderApplicationFields()
      case 'act': return renderActFields()
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

                    {currentDocInfo && (
                      <div className="flex items-start gap-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{currentDocInfo.description}</span>
                      </div>
                    )}

                    {renderFormFields()}

                    <Button onClick={handleGenerate} disabled={isPending} className="w-full mt-2">
                      {isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Генерация...</>) : 'Сгенерировать документ'}
                    </Button>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Preview / Editor */}
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{isEditing ? 'Редактирование' : 'Предпросмотр'}</CardTitle>
                  <CardDescription>
                    {generatedDoc ? generatedDoc.title : 'Документ будет показан здесь'}
                  </CardDescription>
                </div>
                {generatedDoc && (
                  <div className="flex gap-1.5">
                    {isEditing ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} title="Отмена">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="default" size="sm" onClick={handleSave} disabled={isSaving} title="Сохранить">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={handleEdit} title="Редактировать">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCopy} title="Копировать">
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isDownloading} title="Скачать PDF">
                          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded border p-4">
                  {generatedDoc ? (
                    isEditing ? (
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[460px] font-mono text-sm resize-none border-0 p-0 focus-visible:ring-0"
                      />
                    ) : (
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {generatedDoc.content}
                      </pre>
                    )
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
                        onClick={() => { setGeneratedDoc(doc); setIsEditing(false); setActiveTab('generate') }}
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
