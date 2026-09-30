import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { DemoBanner } from '@/components/layout/demo-banner'
import { areDevToolsEnabled } from '@/lib/env'
import { getSpaceContext, getTransactionReference } from '@/server/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { viewer, profile, spaces, space } = await getSpaceContext()
  const reference = await getTransactionReference()

  return (
    <>
      <DemoBanner />
      <AppShell
        user={{ name: profile.fullName ?? 'Você', email: profile.email }}
        space={{ id: space.id, name: space.name, type: space.type }}
        spaces={spaces.map((s) => ({ id: s.id, name: s.name, type: s.type, memberCount: s.memberCount }))}
        devTools={areDevToolsEnabled()}
        demo={viewer.mode === 'demo'}
        reference={reference}
      >
        {children}
      </AppShell>
    </>
  )
}
