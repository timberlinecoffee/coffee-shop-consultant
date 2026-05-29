import * as React from "react"
import { cn } from "@/lib/utils"

function Card({
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-[var(--border)] text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-2 px-4 py-3 border-b border-[var(--border)]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("font-semibold text-sm text-[var(--foreground)]", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2 flex-shrink-0", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("px-4 py-3", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("px-4 py-3 border-t border-[var(--border)]", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("text-xs text-[var(--muted-foreground)]", className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle, CardAction, CardContent, CardFooter, CardDescription }
