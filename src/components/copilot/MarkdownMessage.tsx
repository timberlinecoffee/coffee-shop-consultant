"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Components } from "react-markdown";

// Characters revealed per ~16 ms tick — fast enough to feel live, slow enough to see.
const REVEAL_PER_TICK = 8;
const TICK_MS = 16;

const MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-[var(--foreground)] mt-3 mb-1 first:mt-0 leading-snug">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-[var(--foreground)] mt-2.5 mb-1 first:mt-0 leading-snug">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-[var(--foreground)] mt-2 mb-0.5 first:mt-0 leading-snug">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="line-through text-[#888]">{children}</del>
  ),
  // Block code: multi-line or has a language class. Inline: single-line + no class.
  code: ({ children, className }) => {
    const text = String(children ?? "").replace(/\n$/, "");
    const isBlock = !!className || text.includes("\n");
    if (isBlock) {
      return (
        <code className="block bg-[var(--foreground)] text-[var(--warm-600)] rounded-lg p-3 text-xs font-mono whitespace-pre overflow-x-auto leading-relaxed">
          {text}
        </code>
      );
    }
    return (
      <code className="bg-[var(--warm-450)] text-[var(--warning-dark)] rounded px-1 py-0.5 text-[0.85em] font-mono">
        {children}
      </code>
    );
  },
  // Let code handle its own block styling; pre just strips extra wrapping.
  pre: ({ children }) => (
    <div className="mb-2 last:mb-0">{children}</div>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--teal)]/50 pl-3 text-[#555] italic mb-2 last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--teal)] underline underline-offset-2 hover:text-[var(--teal-900)] transition-colors"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 last:mb-0 rounded-lg border border-[var(--border)]">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-[var(--border)] bg-[var(--warm-350)] px-2.5 py-1.5 text-left font-semibold text-[var(--foreground)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--border)] px-2.5 py-1.5 last:border-b-0">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-[var(--border)]" />,
};

interface MarkdownMessageProps {
  /** Full text content to render (may still be growing when streaming). */
  content: string;
  /** True only for the currently-streaming assistant message. */
  streaming?: boolean;
}

export function MarkdownMessage({ content, streaming }: MarkdownMessageProps) {
  // Historical messages skip animation entirely.
  const [displayedLength, setDisplayedLength] = useState(
    streaming ? 0 : content.length,
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!streaming) {
      setDisplayedLength(content.length);
      return;
    }

    // Chase content.length at REVEAL_PER_TICK chars per tick.
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setDisplayedLength((prev) => {
        const next = Math.min(prev + REVEAL_PER_TICK, content.length);
        if (next >= content.length && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [content, streaming]);

  const displayed = streaming ? content.slice(0, displayedLength) : content;
  // Cursor while: still streaming from server OR animation hasn't caught up yet.
  const showCursor = streaming;

  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={MD_COMPONENTS}
      >
        {displayed}
      </ReactMarkdown>
      {showCursor && (
        <span
          aria-hidden
          className="ml-0.5 inline-block w-0.5 h-[1em] align-text-bottom bg-[var(--teal)] animate-pulse"
        />
      )}
    </div>
  );
}
