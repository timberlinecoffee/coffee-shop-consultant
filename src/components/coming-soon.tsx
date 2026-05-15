import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: string;
  shipsWith: string;
}

export function ComingSoon({ title, description, icon, shipsWith }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-[#faf9f7] pb-16 lg:pb-0">
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-[#155e63] font-medium hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-[#efefef] p-8 text-center">
          <div className="text-5xl mb-4" aria-hidden="true">{icon}</div>
          <h1 className="font-semibold text-2xl text-[#1a1a1a] mb-2">{title}</h1>
          <p className="text-sm text-[#6b6b6b] mb-6 leading-relaxed">{description}</p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#faf9f7] rounded-full border border-[#efefef] mb-8">
            <span className="text-xs font-medium text-[#155e63]">Coming soon</span>
            <span className="text-xs text-[#6b6b6b]">· {shipsWith}</span>
          </div>
          <div>
            <Link
              href="/dashboard"
              className="inline-block bg-[#155e63] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[#114b50] transition-colors"
            >
              Return to dashboard
            </Link>
          </div>
        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
