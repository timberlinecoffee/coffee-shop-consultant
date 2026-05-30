import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`flex h-9 w-full rounded-md border border-[var(--border-medium)] bg-white px-3 py-1 text-sm text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:opacity-50 transition-colors ${className}`}
      {...props}
    />
  )
);
Input.displayName = "Input";
