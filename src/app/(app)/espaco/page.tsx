import type { Metadata } from 'next'
import { EyeOff, Lock, UserPlus, Users } from 'lucide-react'
import { InviteDialog } from '@/components/space/invite-dialog'
import { RemoveMemberButton, RenameSpaceForm, RevokeInvitationButton } from '@/components/space/member-actions'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, Panel, SectionHeading } from '@/components/ui/misc'
import { formatDateBR } from '@/domain/dates'
import { PLAN_ENTITLEMENTS, planLabel } from '@/domain/entitlements'
import { canPerform, canRemoveMember, roleLabel } from '@/domain/permissions'
import { getSpaceContext } from '@/server/session'

export const metadata: Metadata = { title: 'Espaço' }

export default async function SpacePage() {
  const { viewer, space } = await getSpaceContext()
  const invitations = canPerform(space.myRole, 'members.invite') ? await viewer.repo.listInvitations(space.id) : []
  const pending = invitations.filter((i) => i.status === 'pending')
  const entitlements = PLAN_ENTITLEMENTS[space.plan]
  const seatsLeft = entitlements.maxMembers - space.members.length - pending.length
  const canInvite = canPerform(space.myRole, 'members.invite') && seatsLeft > 0

  return (
    <div className="flex flex-col gap-8">
      <header className="pt-2">
        <p className="text-eyebrow mb-2">{space.type === 'shared' ? 'Espaço compartilhado' : 'Espaço'}</p>
        <h1 className="text-page-title">{space.name}</h1>
        <p className="mt-2 max-w-2xl text-secondary">
          Um espaço financeiro reúne as contas, o planejamento e as metas de quem decide junto. Cada pessoa continua com a própria conta de acesso.
        </p>
      </header>

      <section aria-labelledby="members-title">
        <SectionHeading
          id="members-title"
          title="Pessoas"
          description={`Plano ${planLabel(space.plan)} · até ${entitlements.maxMembers} pessoas`}
          actions={
            canInvite ? (
              <InviteDialog
                spaceName={space.name}
                trigger={
                  <Button size="sm">
                    <UserPlus aria-hidden /> Convidar
                  </Button>
                }
              />
            ) : null
          }
        />
        <Panel className="px-2 py-2">
          <ul>
            {space.members.map((m) => {
              const self = m.userId === viewer.userId
              return (
                <li key={m.userId} className="flex items-center gap-3 border-t border-divider px-3 py-3 first:border-t-0">
                  <Avatar name={m.fullName} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.fullName} {self ? <span className="font-normal text-fg-muted">(você)</span> : null}
                    </p>
                    <p className="text-caption">
                      {roleLabel(m.role)} · desde {formatDateBR(m.joinedAt.slice(0, 10))}
                    </p>
                  </div>
                  {canRemoveMember(space.myRole, m.role, viewer.userId, m.userId) ? <RemoveMemberButton userId={m.userId} name={m.fullName} self={self} /> : null}
                </li>
              )
            })}
            {pending.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 border-t border-divider px-3 py-3">
                <span className="inline-flex size-11 items-center justify-center rounded-full border border-dashed border-border-strong text-fg-muted">
                  <UserPlus className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{inv.email}</p>
                  <p className="text-caption">Convite pendente · expira em {formatDateBR(inv.expiresAt.slice(0, 10))}</p>
                </div>
                <Badge tone="warning">Pendente</Badge>
                <RevokeInvitationButton invitationId={inv.id} />
              </li>
            ))}
          </ul>
        </Panel>
        {space.members.length === 1 && canInvite ? (
          <p className="mt-3 text-caption">Convide quem divide as contas com você. O convite chega por um link que você envia como preferir.</p>
        ) : null}
      </section>

      {space.type === 'shared' ? (
        <section aria-labelledby="privacy-title">
          <SectionHeading id="privacy-title" title="Como funciona a privacidade" />
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { icon: Users, title: 'Compartilhado', text: 'Gastos da casa e do casal aparecem para todos, com quem pagou.' },
              { icon: Lock, title: 'Pessoal', text: 'Gastos pessoais aparecem com o nome de quem gastou e só essa pessoa edita.' },
              { icon: EyeOff, title: 'Pessoal e privado', text: 'Ficam fora da lista e dos totais da outra pessoa. Não viramos ferramenta de vigilância.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-[16px] border border-border bg-surface p-5">
                <Icon className="size-5 text-accent" aria-hidden />
                <p className="mt-3 text-card-title">{title}</p>
                <p className="mt-1 text-secondary">{text}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="settings-title">
        <SectionHeading id="settings-title" title="Nome do espaço" />
        <RenameSpaceForm name={space.name} disabled={!canPerform(space.myRole, 'space.update')} />
      </section>
    </div>
  )
}
