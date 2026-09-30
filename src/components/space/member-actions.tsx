'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { removeMemberAction, renameSpaceFromFormAction, revokeInvitationAction } from '@/features/couples/actions'

export function RemoveMemberButton({ userId, name, self }: { userId: string; name: string; self: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <>
      <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setOpen(true)}>
        {self ? 'Sair do espaço' : 'Remover'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader title={self ? 'Sair deste espaço?' : `Remover ${name.split(' ')[0]}?`} />
          <DialogBody>
            <p className="text-secondary">
              {self
                ? 'Você deixa de ver os dados deste espaço. Suas movimentações registradas aqui continuam no histórico do espaço.'
                : 'A pessoa perde o acesso ao espaço. O que ela registrou continua no histórico.'}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const result = await removeMemberAction(userId)
                  if (!result.ok) return void toast.error(result.error.message)
                  setOpen(false)
                  toast.success(self ? 'Você saiu do espaço.' : 'Membro removido.')
                  if (result.data.left) router.push('/visao-geral')
                })
              }
            >
              {self ? 'Sair' : 'Remover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await revokeInvitationAction(invitationId)
          if (result.ok) toast.success('Convite cancelado.')
          else toast.error(result.error.message)
        })
      }
    >
      Cancelar
    </Button>
  )
}

export function RenameSpaceForm({ name, disabled }: { name: string; disabled: boolean }) {
  const [value, setValue] = useState(name)
  const [pending, start] = useTransition()
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const result = await renameSpaceFromFormAction({ name: value })
          if (result.ok) toast.success('Nome atualizado.')
          else toast.error(result.error.message)
        })
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} aria-label="Nome do espaço" disabled={disabled} className="max-w-xs" />
      <Button type="submit" variant="secondary" loading={pending} disabled={disabled || value.trim() === name}>
        Salvar
      </Button>
    </form>
  )
}
