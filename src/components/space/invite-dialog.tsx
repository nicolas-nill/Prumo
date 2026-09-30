'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { createInvitationAction } from '@/features/couples/actions'

export function InviteDialog({ trigger, spaceName }: { trigger: ReactNode; spaceName: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('admin')
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<{ url: string; email: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setError(undefined)
      const res = await createInvitationAction({ email, role })
      if (!res.ok) {
        setError(res.error.fieldErrors?.email)
        if (!res.error.fieldErrors?.email) toast.error(res.error.message)
        return
      }
      setResult({ url: res.data.url, email: res.data.email })
    })

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  const message = result ? `Te convidei para o nosso espaço “${spaceName}” no PRUMO. Entre com ${result.email}: ${result.url}` : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setResult(null)
          setEmail('')
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader
          title={result ? 'Convite pronto' : 'Convidar para o espaço'}
          description={result ? 'Envie o link para a pessoa. Ele vale por 7 dias e só funciona com o e-mail convidado.' : 'A pessoa verá os gastos compartilhados. O que for marcado como pessoal e privado continua só de quem registrou.'}
        />
        {result ? (
          <>
            <DialogBody className="grid gap-4">
              <div className="rounded-[12px] border border-border bg-surface-muted p-3">
                <p className="break-all font-mono text-[0.8125rem] leading-relaxed select-all">{result.url}</p>
              </div>
              <p className="text-caption">Por segurança, este link aparece só agora. Se perder, gere um novo convite.</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer noopener">
                  <MessageCircle aria-hidden /> Enviar pelo WhatsApp
                </a>
              </Button>
              <Button onClick={copy}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copiado' : 'Copiar link'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            noValidate
          >
            <DialogBody className="grid gap-4">
              <Field label="E-mail da pessoa" error={error}>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" inputMode="email" required autoFocus />
              </Field>
              <Field label="Permissão" hint="Administradores também podem convidar e gerenciar o espaço.">
                <Select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}>
                  <option value="admin">Administrador</option>
                  <option value="member">Membro</option>
                </Select>
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="submit" loading={pending}>
                Gerar convite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
