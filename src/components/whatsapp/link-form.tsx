'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { revokeWhatsAppIdentityAction, startWhatsAppLinkAction } from '@/features/whatsapp/actions'

export function LinkWhatsAppForm({ businessNumber, devTools }: { businessNumber: string | null; devTools: boolean }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string>()
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      setError(undefined)
      const result = await startWhatsAppLinkAction(phone)
      if (!result.ok) {
        setError(result.error.fieldErrors?.phone)
        if (!result.error.fieldErrors?.phone) toast.error(result.error.message)
        return
      }
      if (result.data.status === 'verified') {
        toast.success('Esse número já está conectado.')
        setPhone('')
        return
      }
      setCode({ code: result.data.code!, expiresAt: result.data.expiresAt! })
    })

  if (code) {
    const message = `PRUMO ${code.code}`
    const digits = businessNumber?.replace(/\D/g, '')
    return (
      <div className="rounded-[16px] border border-border bg-surface p-5">
        <p className="text-label">Agora, do seu WhatsApp, envie esta mensagem para o PRUMO:</p>
        <p className="mt-3 font-display text-3xl font-semibold tracking-[0.08em] tabular select-all">{message}</p>
        <p className="mt-2 text-caption">
          {businessNumber ? `Número do PRUMO: ${businessNumber}. ` : ''}O código vale por 15 minutos e só funciona a partir do número informado.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {digits ? (
            <Button asChild>
              <a href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer noopener">
                <MessageCircle aria-hidden /> Abrir no WhatsApp
              </a>
            </Button>
          ) : null}
          {devTools ? (
            <Button variant="secondary" asChild>
              <Link href="/dev/whatsapp">Enviar pelo simulador</Link>
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setCode(null)}>
            Usar outro número
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Field label="Seu número de WhatsApp" error={error} className="sm:w-72">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" autoComplete="tel" />
      </Field>
      <Button type="submit" loading={pending}>
        Gerar código
      </Button>
    </form>
  )
}

export function RevokeIdentityButton({ identityId }: { identityId: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await revokeWhatsAppIdentityAction(identityId)
          if (result.ok) toast.success('Número desconectado.')
          else toast.error(result.error.message)
        })
      }
    >
      Desconectar
    </Button>
  )
}
