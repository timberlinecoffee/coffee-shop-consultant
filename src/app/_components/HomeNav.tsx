"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";

export default function HomeNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-200 ${
        scrolled ? "bg-white border-b border-neutral-200" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="Groundwork home">
          <Logo variant={scrolled ? "color" : "white"} height={28} priority />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className={`text-sm font-medium transition-colors duration-200 ${
              scrolled ? "text-neutral-700 hover:text-neutral-950" : "text-white/80 hover:text-white"
            }`}
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors duration-200 ${
              scrolled
                ? "bg-teal text-white hover:bg-teal-dark"
                : "bg-white text-teal hover:bg-neutral-100"
            }`}
          >
            Start Your Plan
          </Link>
        </div>
      </div>
    </nav>
  );
}
