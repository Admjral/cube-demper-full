"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function PromoCodeCard() {
    const [copied, setCopied] = useState(false)
    const promoCode = "DEMPER24"
    const referralLink = `https://cube-demper.com/r/${promoCode}`

    const onCopy = () => {
        navigator.clipboard.writeText(referralLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Ваш Промокод</CardTitle>
                <CardDescription>
                    Клиент получает скидку, а вы — 5000 ₸
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed bg-muted/50 p-6">
                    <span className="font-mono text-3xl font-bold tracking-[0.2em] text-primary">
                        {promoCode}
                    </span>
                </div>
                <div className="flex space-x-2">
                    <Input value={referralLink} readOnly className="bg-muted/50 font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={onCopy} className="shrink-0">
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
