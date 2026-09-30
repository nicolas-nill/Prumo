import type { Metadata } from 'next'
import Link from 'next/link'
import { SignInForm } from '@/components/auth/auth-forms'
import { Avatar } from '@/components/ui/misc'
import { signInDemoAction } from '@/features/auth/actions'
import { getDataMode } from '@/lib/env'
import { DEMO_USERS } from '@/server/data/demo/dataset'

export const metadata: Metadata = { title: 'Entrar' }

export default async function SignInPage({ searchParams }: PageProps<'/entrar'>) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  const demo = getDataMode() === 'demo'

  return (
    <div>
      <h1 className="text-page-title">Entrar</h1>
      <p className="mt-2 text-secondary">Bom te ver de novo.</p>

      {demo ? (
        <div className="mt-8">
          <p className="text-label">Escolha um perfil de exemplo</p>
          <p className="mt-1 text-caption">Um casal com o mesmo espaço financeiro. Entre como cada um para ver a privacidade entre membros.</p>
          <div className="mt-4 grid gap-2">
            {(['lucas', 'marina'] as const).map((who) => (
              <form key={who} action={signInDemoAction}>
                <input type="hidden" name="who" value={who} />
                <input type="hidden" name="next" value={next ?? ''} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  <Avatar name={DEMO_USERS[who].fullName} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{DEMO_USERS[who].fullName}</span>
                    <span className="block text-caption">{who === 'lucas' ? 'Titular do espaço' : 'Parceira · administradora'}</span>
                  </span>
                  <span className="text-sm font-medium text-accent">Entrar</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <SignInForm next={next} linkError={params.erro === 'link'} />
          </div>
          <p className="mt-8 text-center text-sm text-fg-muted">
            Ainda não tem conta?{' '}
            <Link href={next ? `/cadastro?next=${encodeURIComponent(next)}` : '/cadastro'} className="font-medium text-accent hover:underline">
              Criar conta
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
