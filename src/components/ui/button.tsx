import * as React from "react"
import { cn } from "@/lib/utils"

type Variant = "default" | "outline" | "ghost" | "destructive" | "link" | "secondary"
type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const variantClasses: Record<Variant, string> = {
  default: "bg-[var(--teal)] text-white hover:bg-[var(--teal-darker)] border-transparent",
  outline: "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]",
  ghost: "text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] border-transparent",
  destructive: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
  link: "text-[var(--teal)] underline-offset-4 hover:underline border-transparent",
  secondary: "bg-[var(--surface-warm-100)] text-[var(--foreground)] hover:bg-[var(--border)] border-transparent",
}

const sizeClasses: Record<Size, string> = {
  default: "h-8 px-3 text-sm gap-1.5",
  xs: "h-6 px-2 text-xs rounded-xl gap-1",
  sm: "h-7 px-2.5 text-xs gap-1",
  lg: "h-9 px-4 text-sm gap-2",
  icon: "h-8 w-8 p-0",
  "icon-xs": "h-6 w-6 p-0",
  "icon-sm": "h-7 w-7 p-0",
  "icon-lg": "h-9 w-9 p-0",
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

function Button({
  variant = "default",
  size = "default",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl border font-medium transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]/50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
}

export { Button }
