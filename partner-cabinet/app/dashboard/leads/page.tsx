"use client"

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// Mock data for leads
const leads = [
    {
        id: "user_102",
        date: "2024-05-18",
        status: "paid",
        amount: 5000,
        source: "Instagram",
    },
    {
        id: "user_101",
        date: "2024-05-17",
        status: "registered",
        amount: 0,
        source: "Telegram",
    },
    {
        id: "user_100",
        date: "2024-05-16",
        status: "registered",
        amount: 0,
        source: "Direct Link",
    },
    {
        id: "user_99",
        date: "2024-05-15",
        status: "paid",
        amount: 5000,
        source: "Instagram",
    },
    {
        id: "user_98",
        date: "2024-05-14",
        status: "clicked",
        amount: 0,
        source: "Unknown",
    },
]

export default function LeadsPage() {
    return (
        <div className="grid gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Мои Клиенты</CardTitle>
                    <CardDescription>
                        Список пользователей, перешедших по вашей ссылке или использовавших промокод.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Пользователь (ID)</TableHead>
                                <TableHead>Дата регистрации</TableHead>
                                <TableHead>Источник</TableHead>
                                <TableHead>Статус</TableHead>
                                <TableHead className="text-right">Ваш доход</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {leads.map((lead) => (
                                <TableRow key={lead.id}>
                                    <TableCell className="font-medium">{lead.id}</TableCell>
                                    <TableCell>{lead.date}</TableCell>
                                    <TableCell>{lead.source}</TableCell>
                                    <TableCell>
                                        <StatusBadge status={lead.status} />
                                    </TableCell>
                                    <TableCell className={cn("text-right font-bold", lead.amount > 0 ? "text-green-600" : "text-muted-foreground")}>
                                        {lead.amount > 0 ? `+${lead.amount} ₸` : "0 ₸"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'paid') {
        return (
            <span className="inline-flex items-center rounded-full border border-transparent bg-green-500/15 px-2.5 py-0.5 text-xs font-semibold text-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                Оплатил тариф
            </span>
        )
    }
    if (status === 'registered') {
        return (
            <span className="inline-flex items-center rounded-full border border-transparent bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                Зарегистрирован
            </span>
        )
    }
    return (
        <span className="inline-flex items-center rounded-full border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            Переход
        </span>
    )
}
