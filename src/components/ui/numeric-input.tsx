"use client";

// TIM-1261: Shared numeric input for the Financial Suite. Fixes the leading-zero
// entry bug — a field sitting at 0 used to render a literal "0", so placing the
// cursor and typing appended ("05", "012") instead of replacing it. Here a 0
// value renders blank (with a "0" placeholder) and any leading zero the user
// types is stripped, so the first digit always replaces the zero. Drop-in for
// `<input type="number">`: forwards every prop and keeps the caller's existing
// value / onChange contract (onChange still reads `e.target.value`).

export type NumericInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function NumericInput({ value, onChange, placeholder, ...rest }: NumericInputProps) {
  return (
    <input
      {...rest}
      type="number"
      placeholder={placeholder ?? "0"}
      value={value === 0 ? "" : value}
      onChange={(e) => {
        const el = e.currentTarget;
        const stripped = el.value.replace(/^(-?)0+(?=\d)/, "$1");
        if (stripped !== el.value) el.value = stripped;
        onChange?.(e);
      }}
    />
  );
}
