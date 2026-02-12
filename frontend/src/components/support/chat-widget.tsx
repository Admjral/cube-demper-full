"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import { MessageCircle, Send, Loader2, User, Headphones } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  getUserChat,
  getUserMessages,
  sendUserMessage,
  createUserChatWebSocket,
  SupportMessage,
  SupportChat,
} from "@/lib/support"
import { authClient } from "@/lib/auth"
import { useT } from "@/lib/i18n"

export function SupportChatWidget() {
  const [open, setOpen] = useState(false)
  const [chat, setChat] = useState<SupportChat | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const t = useT()

  const pathname = usePathname()

  const isAuthenticated = authClient.isAuthenticated()

  useEffect(() => {
    if (!isAuthenticated || !open) return

    async function loadChat() {
      setLoading(true)
      try {
        const chatData = await getUserChat()
        setChat(chatData)

        const messagesData = await getUserMessages()
        setMessages(messagesData.messages)

        if (chatData.id) {
          wsRef.current?.close()
          const ws = createUserChatWebSocket(
            chatData.id,
            (message) => {
              setMessages((prev) => [...prev, message])
              if (!open && message.sender_type === "support") {
                setUnreadCount((c) => c + 1)
              }
            }
          )
          wsRef.current = ws
        }
      } catch (e) {
        console.error("Failed to load chat:", e)
      } finally {
        setLoading(false)
      }
    }

    loadChat()

    return () => {
      wsRef.current?.close()
    }
  }, [isAuthenticated, open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (open) {
      setUnreadCount(0)
    }
  }, [open])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || sending) return

    setSending(true)
    try {
      const message = await sendUserMessage(newMessage)
      setMessages((prev) => [...prev, message])
      setNewMessage("")

      if (!chat) {
        const chatData = await getUserChat()
        setChat(chatData)

        if (chatData.id && !wsRef.current) {
          const ws = createUserChatWebSocket(chatData.id, (msg) => {
            setMessages((prev) => [...prev, msg])
          })
          wsRef.current = ws
        }
      }
    } catch (e) {
      console.error("Failed to send message:", e)
    } finally {
      setSending(false)
    }
  }

  if (!isAuthenticated) return null
  if (pathname === '/dashboard/support') return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="touch-target relative">
          <Headphones className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">{t('support.team')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 sm:w-96 p-0" align="end">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Headphones className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{t("support.team")}</h3>
            <p className="text-xs text-muted-foreground">{t("support.responseTime")}</p>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="h-[350px] p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{t("support.writeToUs")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2",
                    msg.sender_type === "user" && "flex-row-reverse"
                  )}
                >
                  <div
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                      msg.sender_type === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {msg.sender_type === "user" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Headphones className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-lg px-3 py-2",
                      msg.sender_type === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={cn(
                        "text-[10px] mt-1",
                        msg.sender_type === "user"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatDistanceToNow(new Date(msg.created_at), {
                        addSuffix: true,
                        locale: ru,
                      })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <form onSubmit={handleSend} className="p-3 border-t">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={t("support.enterMessage")}
              disabled={sending}
              className="flex-1 h-9"
            />
            <Button type="submit" size="icon" className="h-9 w-9" disabled={sending || !newMessage.trim()}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
