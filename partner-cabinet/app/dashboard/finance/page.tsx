"use client"

import { useState } from "react"
import { Plus, Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

// Mock data
const transactions = [
    {
        id: "TRX-9821",
        date: "2024-05-12",
        description: "Начисление за клиента (user_88)",
        amount: 5000,
        type: "income",
        status: "completed",
    },
    {
        id: "TRX-9822",
        date: "2024-05-14",
        description: "Начисление за клиента (user_91)",
        amount: 5000,
        type: "income",
        status: "completed",
    },
    {
        id: "PAY-001",
        date: "2024-05-15",
        description: "Вывод средств на Kaspi",
        amount: -10000,
        type: "payout",
        status: "processed",
    },
    {
        id: "TRX-9825",
        date: "2024-05-18",
        description: "Начисление за клиента (user_102)",
        amount: 5000,
        type: "income",
        status: "completed",
    },
]

export default function FinancePage() {
    const [isPayoutOpen, setIsPayoutOpen] = useState(false)
    const [amount, setAmount] = useState("")
    const [requisites, setRequisites] = useState("")

    const handleRequestPayout = (e: React.FormEvent) => {
        e.preventDefault()
        // Logic to send request to backend would go here
        setIsPayoutOpen(false)
        alert(`Запрос на выплату ${amount} ₸ отправлен!`)
        setAmount("")
        setRequisites("")
    }

    return (
        <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Доступный баланс</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">5,000 ₸</div>
                        <p className="text-xs text-muted-foreground">Минимальный вывод: 5 000 ₸</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Всего заработано</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">210,000 ₸</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Всего выведено</CardTitle>
                        <ArrowDownLeft className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">205,000 ₸</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold md:text-2xl">История транзакций</h2>

                <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Запросить выплату
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Запрос выплаты</DialogTitle>
                            <DialogDescription>
                                Укажите сумму и реквизиты для получения средств. Обработка занимает до 24 часов.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleRequestPayout}>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="amount" className="text-right">
                                        Сумма
                                    </Label>
                                    <Input
                                        id="amount"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="5000"
                                        className="col-span-3"
                                        type="number"
                                        min="5000"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="req" className="text-right">
                                        Реквизиты
                                    </Label>
                                    <Input
                                        id="req"
                                        value={requisites}
                                        onChange={(e) => setRequisites(e.target.value)}
                                        placeholder="Kaspi Gold: +7 7..."
                                        className="col-span-3"
                                        required
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit">Отправить запрос</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Дата</TableHead>
                            <TableHead>Описание</TableHead>
                            <TableHead className="text-right">Сумма</TableHead>
                            <TableHead>Статус</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.map((t) => (
                            <TableRow key={t.id}>
                                <TableCell className="font-medium">{t.id}</TableCell>
                                <TableCell>{t.date}</TableCell>
                                <TableCell>{t.description}</TableCell>
                                <TableCell className={cn("text-right font-bold", t.amount > 0 ? "text-green-600" : "text-black")}>
                                    {t.amount > 0 ? "+" : ""}{t.amount} ₸
                                </TableCell>
                                <TableCell>
                                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                        {t.status === 'completed' ? 'Выполнено' : 'В обработке'}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    )
}
