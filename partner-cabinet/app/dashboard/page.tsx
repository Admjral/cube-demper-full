"use client"

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card"
import { DollarSign, MousePointerClick, Users, CreditCard } from "lucide-react"
import { EarningsChart } from "@/components/dashboard/earnings-chart"
import { PromoCodeCard } from "@/components/dashboard/promo-code-card"

export default function DashboardPage() {
    return (
        <div className="grid gap-4 md:gap-8">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Клики по ссылке</CardTitle>
                        <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,234</div>
                        <p className="text-xs text-muted-foreground">+20.1% за месяц</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Регистрации</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">345</div>
                        <p className="text-xs text-muted-foreground">+15% конверсия</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Оплатившие</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">42</div>
                        <p className="text-xs text-muted-foreground">12% от регистраций</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Заработано</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">210,000 ₸</div>
                        <p className="text-xs text-muted-foreground">5000 ₸ за клиента</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Динамика дохода</CardTitle>
                            <CardDescription>Статистика за последние 30 дней</CardDescription>
                        </CardHeader>
                        <CardContent className="pl-2">
                            <EarningsChart />
                        </CardContent>
                    </Card>
                </div>
                <div className="col-span-3">
                    <PromoCodeCard />
                </div>
            </div>
        </div>
    )
}
