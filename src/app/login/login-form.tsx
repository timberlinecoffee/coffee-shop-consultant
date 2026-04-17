"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function LoginForm({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const router = useRouter();

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
      } else {
        setError(null);
        alert("Check your email to confirm your account!");
      }
    } else {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        // Check onboarding status before redirecting
        if (data.user) {
          const { data: profile } = await supabase
            .from("users")
            .select("onboarding_completed")
            .eq("id", data.user.id)
            .single();
          if (!profile?.onboarding_completed) {
            router.push("/onboarding");
          } else {
            router.push("/dashboard");
          }
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      }
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 border border-[#efefef] rounded-xl py-3 text-sm font-medium text-[#1a1a1a] hover:border-[#afafaf] hover:bg-[#faf9f7] transition-colors disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-[#afafaf]">
        <div className="flex-1 h-px bg-[#efefef]" />
        <span>or</span>
        <div className="flex-1 h-px bg-[#efefef]" />
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-[#1a1a1a] mb-1">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-medium text-[#1a1a1a] mb-1">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            minLength={8}
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#155e63] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#0e4448] transition-colors disabled:opacity-50"
        >
          {loading ? "Just a moment..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="w-full text-center text-xs text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
      >
        {mode === "signin" ? "New here? Create a free account instead" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
