"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function EmailConfirmBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("email_banner_dismissed") === "true") return;

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !session.user.email_confirmed_at) {
        setShow(true);
      }
    });
  }, []);

  if (!show) return null;

  function dismiss() {
    sessionStorage.setItem("email_banner_dismissed", "true");
    setShow(false);
  }

  return (
    <div className="w-full bg-[var(--warning-bg-14)] border-b border-[var(--warning-amber-bg-3)] px-4 py-2.5 flex items-center justify-between text-sm text-[var(--coffee-brown-5)]">
      <span>Check your email when you have a moment; your account is saved.</span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-4 text-[var(--dark-grey)] hover:text-[var(--coffee-brown-5)] transition-colors text-xl leading-none"
      >
        &times;
      </button>
    </div>
  );
}
