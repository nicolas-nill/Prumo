import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/logo'
import { DemoBanner } from '@/components/layout/demo-banner'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { requireViewer } from '@/server/session'

export const metadata: Metadata = { title: 'Primeiros passos' }

export default async function OnboardingPage({ searchParams }: PageProps<'/comecar'>) {
  const viewer = await requireViewer()
  const profile = await viewer.repo.getProfile()
  const params = await searchParams
  // Demo mode can preview the flow; real accounts that finished onboarding go to the app.
  const preview = viewer.mode === 'demo' && params.preview === '1'
  if (profile.onboardedAt && !preview) redirect('/visao-geral')

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <header className="px-5 py-5 sm:px-8">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-[520px] flex-1 px-5 pt-4 pb-16 sm:pt-10">
        <OnboardingWizard initialName={profile.fullName ?? ''} />
      </main>
    </div>
  )
}
