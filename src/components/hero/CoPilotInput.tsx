"use client";

import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ChevronUpIcon, ChevronDownIcon, SendIcon } from "@/lib/icons";

export interface CoPilotInputProps {
  /**
   * Placeholder text shown in the collapsed bar and the input field.
   * Defaults to "Ask about your plan..."
   */
  placeholder?: string;
  /**
   * Called when the user submits a message. Return a promise that resolves
   * when the response has finished streaming.
   */
  onSubmit: (message: string) => Promise<void>;
  /**
   * The current response text. Supply incrementally to produce the
   * word-by-word streaming appearance per spec. The container itself
   * does not animate — only the text content changes.
   */
  response?: string;
  /** True while a response is being streamed. */
  isLoading?: boolean;
  /**
   * Error message to display in place of the response area.
   * Supply a short, direct string without em-dashes or banned words.
   */
  errorMessage?: string;
  /** Additional CSS class names applied to the outer wrapper. */
  className?: string;
}

/**
 * CoPilotInput — Component 2 per design-direction v3 Section 6.
 *
 * Bottom-anchored drawer with collapsed (thin bar) and expanded (280px) states.
 * Collapsed bar shows placeholder text and an expand chevron.
 * Expanded state shows a text input with a teal send button and a response area.
 *
 * This is a focused question-and-answer tool, not a chat interface:
 *   - No AI avatar
 *   - No chat bubbles
 *   - Response text displayed in plain Poppins 400 16px, left-aligned
 *   - Drawer slides up on expand (200ms cubic-bezier per Section 8)
 *
 * Responsive: full-width on all breakpoints. Fixed to bottom on mobile/tablet,
 * relative on desktop when used inside a layout column.
 */
export function CoPilotInput({
  placeholder = "Ask about your plan...",
  onSubmit,
  response = "",
  isLoading = false,
  errorMessage,
  className = "",
}: CoPilotInputProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function toggle() {
    setOpen((prev) => !prev);
    if (!open) {
      // Focus input after open animation starts
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    setValue("");
    await onSubmit(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(e as unknown as FormEvent);
    }
  }

  return (
    <div
      className={[
        "w-full border-t border-[var(--neutral-300)] bg-[var(--color-white)]",
        "overflow-hidden",
        "fixed bottom-0 left-0 right-0 md:relative md:bottom-auto md:left-auto md:right-auto",
        className,
      ].join(" ")}
      style={{
        transition: `height var(--duration-normal) var(--ease-slide)`,
        height: open ? "280px" : "44px",
      }}
    >
      {/* Collapsed bar — always visible as the toggle */}
      <button
        type="button"
        onClick={toggle}
        className={[
          "flex items-center justify-between w-full px-4 h-11",
          "cursor-pointer",
        ].join(" ")}
        aria-expanded={open}
        aria-controls="copilot-panel"
      >
        <span
          className="text-[var(--neutral-500)] truncate"
          style={{ fontSize: "var(--text-body)", lineHeight: "var(--text-body-lh)" }}
        >
          {placeholder}
        </span>
        {open ? (
          <ChevronDownIcon
            size={16}
            weight="regular"
            style={{ color: "var(--neutral-500)" }}
            aria-hidden
          />
        ) : (
          <ChevronUpIcon
            size={16}
            weight="regular"
            style={{ color: "var(--neutral-500)" }}
            aria-hidden
          />
        )}
      </button>

      {/* Expanded panel */}
      <div
        id="copilot-panel"
        className="flex flex-col h-[calc(280px-44px)]"
        style={{ opacity: open ? 1 : 0, transition: `opacity 100ms 100ms` }}
        aria-hidden={!open}
      >
        {/* Response area */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {errorMessage ? (
            <p
              className="text-[var(--color-danger)]"
              style={{ fontSize: "var(--text-body)", lineHeight: "var(--text-body-lh)" }}
            >
              {errorMessage}
            </p>
          ) : (
            <p
              className="text-[var(--neutral-800)] whitespace-pre-wrap"
              style={{ fontSize: "var(--text-body)", lineHeight: "var(--text-body-lh)" }}
            >
              {response}
              {isLoading && !response && (
                <span className="inline-block w-1 h-4 bg-[var(--color-teal)] align-middle animate-pulse ml-0.5" />
              )}
            </p>
          )}
        </div>

        {/* Input row */}
        <form
          onSubmit={submit}
          className="flex items-end gap-2 px-4 pb-3 border-t border-[var(--neutral-200)]"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className={[
              "flex-1 resize-none rounded-md border border-[var(--neutral-300)]",
              "bg-[var(--neutral-100)] px-3 py-2 outline-none",
              "placeholder:text-[var(--neutral-500)]",
              "focus:border-[var(--color-teal)] focus:ring-1 focus:ring-[var(--color-teal)]",
              "disabled:opacity-50",
            ].join(" ")}
            style={{
              fontSize: "var(--text-body)",
              lineHeight: "var(--text-body-lh)",
              color: "var(--neutral-950)",
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !value.trim()}
            aria-label="Send"
            className={[
              "flex items-center justify-center shrink-0 w-9 h-9 rounded-md",
              "bg-[var(--color-teal)] text-[var(--color-white)]",
              "transition-opacity duration-[var(--duration-fast)]",
              "disabled:opacity-40",
              "hover:not-disabled:bg-[var(--color-teal-dark)]",
            ].join(" ")}
          >
            <SendIcon size={16} weight="regular" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
