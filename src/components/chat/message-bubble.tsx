"use client"

import { Children, Fragment } from "react"
import { Download, Eye, FileText } from "lucide-react"
import { useTheme } from "next-themes"
import Markdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"
import remarkGfm from "remark-gfm"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useI18n } from "@/i18n"
import { getAgentAvatarUrl, getUserAvatarUrl, useAvatarVersion } from "@/lib/avatar"
import { cn } from "@/lib/utils"
import type { Message } from "@/types"

interface MessageBubbleProps {
  message: Message
  showSenderInfo?: boolean
  onAgentAvatarClick?: (agentId: string, agentName: string) => void
}

export function MessageBubble({ message, showSenderInfo = false, onAgentAvatarClick }: MessageBubbleProps) {
  const { t } = useI18n()
  useAvatarVersion()

  if (message.type === "system") {
    return (
      <div className="flex justify-center py-3">
        <span className="text-xs text-muted-foreground/80 bg-muted/60 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  if (message.type === "orchestration") {
    return (
      <div className="flex items-center justify-center py-2 gap-2">
        <div className="h-px flex-1 bg-border/50" />
        <span className="text-[11px] text-muted-foreground/70 px-2 shrink-0">
          {message.orchestrationInfo?.reason ?? message.content}
        </span>
        <div className="h-px flex-1 bg-border/50" />
      </div>
    )
  }

  const isUser = message.senderId === "user"

  if (isUser) {
    const hasAttachments = message.attachments && message.attachments.length > 0
    return (
      <div className="flex gap-2.5 py-1.5 group">
        <Avatar className="h-9 w-9 shrink-0 mt-0.5">
          <AvatarImage src={getUserAvatarUrl()} alt={t("common.me")} />
          <AvatarFallback className="text-xs font-medium bg-green-100 text-green-700">
            {message.senderAvatar}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col items-start max-w-[70%]">
          <div className="rounded-lg rounded-tl-sm px-3 py-2 text-sm leading-relaxed bg-[#d6e4ff] text-foreground">
            {hasAttachments && (
              <div className={cn("flex gap-2 flex-wrap", message.content && "mb-2")}>
                {message.attachments!.map((att) => (
                  <img
                    key={att.id}
                    src={att.dataUrl}
                    alt="attachment"
                    className="max-h-48 max-w-64 rounded-md object-contain"
                  />
                ))}
              </div>
            )}
            {message.type === "task-card" && message.taskCard ? (
              <TaskCardContent taskCard={message.taskCard} />
            ) : message.type === "file" && message.fileAttachment ? (
              <FileAttachmentContent file={message.fileAttachment} text={message.content} />
            ) : message.content ? (
              <MessageContent content={message.content} mentions={message.mentions} />
            ) : null}
          </div>
          <span className="text-[11px] text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {message.timestamp}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 py-1.5 group">
      <div className="relative shrink-0 mt-0.5">
        <button
          className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onAgentAvatarClick?.(message.senderId, message.senderName)}
        >
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={getAgentAvatarUrl(message.senderId, message.senderName)}
              alt={message.senderName}
            />
            <AvatarFallback className="text-xs font-medium bg-blue-100 text-blue-700">
              {message.senderAvatar}
            </AvatarFallback>
          </Avatar>
        </button>
        <Badge
          variant="secondary"
          className="absolute -top-1.5 -right-1.5 z-10 h-[16px] px-1 text-[10px] rounded bg-blue-500/10 text-blue-600 border-blue-200 font-medium pointer-events-none"
        >
          AI
        </Badge>
      </div>

      <div className="flex flex-col items-start max-w-[70%]">
        {showSenderInfo && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-foreground/80">
              {message.senderName}
            </span>
            {message.senderRole && (
              <span className="text-[10px] text-muted-foreground">
                {message.senderRole}
              </span>
            )}
          </div>
        )}

        <div className="rounded-lg rounded-tl-sm px-3 py-2 text-sm leading-relaxed bg-muted">
          {message.type === "task-card" && message.taskCard ? (
            <TaskCardContent taskCard={message.taskCard} />
          ) : message.type === "file" && message.fileAttachment ? (
            <FileAttachmentContent file={message.fileAttachment} text={message.content} />
          ) : (
            <MessageContent content={message.content} mentions={message.mentions} />
          )}
        </div>

        {/* Timestamp — hover only */}
        <span className="text-[11px] text-muted-foreground/50 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {message.timestamp}
        </span>
      </div>
    </div>
  )
}

function MessageContent({ content, mentions }: { content: string; mentions?: string[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const processMentions = (text: string) => {
    if (!mentions?.length) return text
    const parts = text.split(/(@\S+)/g)
    if (parts.length === 1) return text
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span
          key={i}
          className="text-blue-500 font-medium cursor-pointer hover:underline"
          role="link"
          tabIndex={0}
        >
          {part}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    )
  }

  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          return (
            <p className="mb-2 last:mb-0 leading-relaxed">
              {Children.map(children, (child) =>
                typeof child === "string" ? processMentions(child) : child
              )}
            </p>
          )
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "")
          return match ? (
            <SyntaxHighlighter
              PreTag="div"
              language={match[1]}
              style={isDark ? oneDark : oneLight}
              customStyle={{ borderRadius: "0.375rem", fontSize: "0.75rem", margin: "0.5rem 0" }}
            >
              {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
          ) : (
            <code className="bg-muted/80 px-1 py-0.5 rounded text-xs font-mono" {...props}>
              {children}
            </code>
          )
        },
        pre({ children }) {
          return <div>{children}</div>
        },
        ul({ children }) {
          return <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
        },
        ol({ children }) {
          return <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
        },
        li({ children }) {
          return <li className="leading-relaxed">{children}</li>
        },
        h1({ children }) {
          return <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-sm font-bold mb-1.5 mt-2.5 first:mt-0">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          )
        },
        a({ href, children }) {
          const safeHref = href && /^(https?:\/\/|mailto:|ftp:\/\/)/.test(href) ? href : undefined
          return (
            <a
              href={safeHref}
              className="text-blue-500 hover:underline"
              target={safeHref ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          )
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse w-full">{children}</table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th className="border border-border px-2 py-1 bg-muted font-medium text-left">
              {children}
            </th>
          )
        },
        td({ children }) {
          return <td className="border border-border px-2 py-1">{children}</td>
        },
        hr() {
          return <hr className="my-2 border-border" />
        },
        strong({ children }) {
          return <strong className="font-semibold">{children}</strong>
        },
        em({ children }) {
          return <em className="italic">{children}</em>
        },
      }}
    >
      {content}
    </Markdown>
  )
}

function TaskCardContent({
  taskCard,
}: {
  taskCard: NonNullable<Message["taskCard"]>
}) {
  const { t } = useI18n()

  return (
    <Card className="p-3 mt-1 bg-background gap-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{taskCard.title}</span>
        <Badge
          variant={taskCard.status === "completed" ? "default" : "secondary"}
          className="text-xs"
        >
          {taskCard.status === "completed"
            ? t("messageBubble.taskStatus.completed")
            : taskCard.status === "in-progress"
              ? t("messageBubble.taskStatus.inProgress")
              : t("messageBubble.taskStatus.failed")}
        </Badge>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("messageBubble.progress")}</span>
          <span>{taskCard.progress}%</span>
        </div>
        <Progress value={taskCard.progress} className="h-2" />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("messageBubble.scope", { scope: taskCard.scope })}
      </p>
      <div className="flex gap-2 mt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Eye className="h-3 w-3 mr-1" />
          {t("messageBubble.viewDetails")}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Download className="h-3 w-3 mr-1" />
          {t("messageBubble.downloadReport")}
        </Button>
      </div>
    </Card>
  )
}

function FileAttachmentContent({
  file,
  text,
}: {
  file: NonNullable<Message["fileAttachment"]>
  text: string
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-2">
      {text && <span className="whitespace-pre-wrap">{text}</span>}
      <Card className="p-3 bg-background flex items-center gap-3">
        <FileText className="h-8 w-8 text-blue-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{file.size}</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            {t("messageBubble.download")}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs">
            {t("messageBubble.preview")}
          </Button>
        </div>
      </Card>
    </div>
  )
}
