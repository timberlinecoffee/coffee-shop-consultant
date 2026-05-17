// TIM-777 / TIM-620-C: Server entry for the Location & Lease workspace.
// Fetches initial candidates server-side and passes to CandidateListCard.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BottomTabBar } from '@/components/bottom-tab-bar'
import { CandidateListCard } from '@/components/location-lease/CandidateListCard'
import type { Candidate } from '@/components/location-lease/CandidateListCard'

export const dynamic = 'force-dynamic'

export default async function LocationLeaseWorkspacePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase
      .from('users')
      .select('ai_credits_remaining, subscription_tier')
      .eq('id', user.id)
      .single(),
    supabase
      .from('coffee_shop_plans')
      .select('id')
      .eq('user_id', user.id)
      .single(),
  ])

  if (!plan) redirect('/dashboard')

  const { data: rows } = await supabase
    .from('location_candidates')
    .select('*')
    .eq('plan_id', plan.id)
    .eq('archived', false)
    .order('position')

  const initialCandidates: Candidate[] = (rows ?? []).map(r => ({
    id: r.id,
    name: r.name,
    address: r.address ?? null,
    neighborhood: r.neighborhood ?? null,
    sq_ft: r.sq_ft ?? null,
    asking_rent_cents: r.asking_rent_cents ?? null,
    cam_cents: r.cam_cents ?? null,
    listing_url: r.listing_url ?? null,
    broker_contact: r.broker_contact ?? null,
    status: (r.status ?? 'shortlisted') as Candidate['status'],
    notes: r.notes ?? null,
    position: r.position ?? 0,
  }))

  return (
    <div className="min-h-screen bg-neutral-100 pb-16 lg:pb-0">
      {/* Top nav */}
      <nav className="bg-white border-b border-grey-light px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-teal rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">TCS</span>
              </div>
            </Link>
            <span className="text-neutral-500 text-sm">/</span>
            <Link
              href="/dashboard"
              className="text-sm text-neutral-500 hover:text-neutral-950 transition-colors hidden sm:block"
            >
              Dashboard
            </Link>
            <span className="text-neutral-500 text-sm hidden sm:block">/</span>
            <span className="text-sm font-medium text-neutral-950">
              Workspace 2: Location &amp; Lease
            </span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <CandidateListCard
          initialCandidates={initialCandidates}
          planId={plan.id}
          aiCreditsRemaining={profile?.ai_credits_remaining ?? 0}
          subscriptionTier={profile?.subscription_tier ?? 'free'}
        />
      </div>

      <BottomTabBar />
    </div>
  )
}
