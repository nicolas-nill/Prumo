import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/** Static illustration of the core loop (message in → structured record out). */
export function ChatPreview({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 text-[0.875rem]', className)} aria-label="Exemplo de conversa com o PRUMO no WhatsApp" role="img">
      <div className="max-w-[78%] self-end rounded-[16px] rounded-br-[6px] bg-chat-out px-4 py-2.5 text-chat-out-fg shadow-sm">
        Gastei 47,90 no almoço
        <span className="mt-1 flex items-center justify-end gap-1 text-[0.6875rem] text-chat-meta">
          12:41 <Check className="size-3" aria-hidden />
        </span>
      </div>
      <div className="max-w-[86%] self-start rounded-[16px] rounded-bl-[6px] bg-chat-in px-4 py-3 text-chat-in-fg shadow-sm">
        <p>
          Registrei <strong className="font-semibold">R$ 47,90</strong> em Restaurantes.
        </p>
        <p className="mt-1 text-[0.8125rem] text-chat-meta">Você usou 62% do orçamento de Restaurantes com 48% do mês decorrido.</p>
      </div>
      <div className="max-w-[60%] self-end rounded-[16px] rounded-br-[6px] bg-chat-out px-4 py-2.5 text-chat-out-fg shadow-sm">
        Foi no cartão Nubank
      </div>
      <div className="max-w-[70%] self-start rounded-[16px] rounded-bl-[6px] bg-chat-in px-4 py-2.5 text-chat-in-fg shadow-sm">
        Pronto, atualizei para o cartão Nubank.
      </div>
    </div>
  )
}
