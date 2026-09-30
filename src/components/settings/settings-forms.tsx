'use client'

import { useTheme } from 'next-themes'
import { useState, useSyncExternalStore, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Archive, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CATEGORY_ICONS, CategoryIcon, ICON_KEYS } from '@/components/ui/category-icon'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import type { Category, CategoryGroup } from '@/domain/types'
import { createCategoryAction, updateCategoryAction, updateProfileAction } from '@/features/settings/actions'
import { BR_TIMEZONES } from '@/features/settings/constants'
import { cn } from '@/lib/utils/cn'

export function ProfileForm({ fullName, timezone, email }: { fullName: string; timezone: string; email: string | null }) {
  const [name, setName] = useState(fullName)
  const [tz, setTz] = useState(timezone)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <form
      className="grid max-w-xl gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const result = await updateProfileAction({ fullName: name, timezone: tz })
          if (!result.ok) {
            setError(result.error.fieldErrors?.fullName)
            return void toast.error(result.error.message)
          }
          toast.success('Perfil atualizado.')
        })
      }}
    >
      <Field label="Nome" error={error}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
      </Field>
      <Field label="E-mail" hint="Para alterar, fale com o suporte.">
        <Input value={email ?? ''} readOnly disabled />
      </Field>
      <Field label="Fuso horário" hint="Define o que é “hoje” e o mês de cada lançamento." className="sm:col-span-2">
        <Select value={tz} onChange={(e) => setTz(e.target.value)}>
          {BR_TIMEZONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Salvar perfil
        </Button>
      </div>
    </form>
  )
}

const noopSubscribe = () => () => {}

export function AppearanceControl() {
  const { theme, setTheme } = useTheme()
  // false during SSR/hydration (theme unknown on the server), true afterwards.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  return (
    <Segmented
      label="Aparência"
      value={(mounted ? theme : 'system') as 'light' | 'dark' | 'system'}
      onChange={setTheme}
      options={[
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Escuro' },
        { value: 'system', label: 'Sistema' },
      ]}
    />
  )
}

export function CategoryDialog({ category, groups, trigger, defaultKind = 'expense' }: { category?: Category; groups: CategoryGroup[]; trigger: ReactNode; defaultKind?: 'income' | 'expense' }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(category?.name ?? '')
  const [kind, setKind] = useState<'income' | 'expense'>(category?.kind ?? defaultKind)
  const [groupId, setGroupId] = useState<string | null>(category?.groupId ?? groups[0]?.id ?? null)
  const [icon, setIcon] = useState<string | null>(category?.icon ?? 'tag')
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      const payload = { name, kind, groupId: kind === 'expense' ? groupId : null, icon }
      const result = category ? await updateCategoryAction(category.id, payload) : await createCategoryAction(payload)
      if (!result.ok) {
        setError(result.error.fieldErrors?.name)
        return void toast.error(result.error.message)
      }
      toast.success(category ? 'Categoria atualizada.' : 'Categoria criada.')
      setOpen(false)
      if (!category) setName('')
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader title={category ? 'Editar categoria' : 'Nova categoria'} />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogBody className="grid gap-4">
            {category ? null : (
              <Segmented label="Tipo" fullWidth value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }]} />
            )}
            <Field label="Nome" error={error}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
            </Field>
            {kind === 'expense' ? (
              <Field label="Grupo do planejamento">
                <Select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value || null)}>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value="">Sem grupo</option>
                </Select>
              </Field>
            ) : null}
            <fieldset>
              <legend className="text-label mb-2">Ícone</legend>
              <div className="grid grid-cols-8 gap-1.5">
                {ICON_KEYS.map((key) => {
                  const Icon = CATEGORY_ICONS[key]!
                  return (
                    <label key={key} className="cursor-pointer" title={key}>
                      <input type="radio" name="icon" value={key} checked={icon === key} onChange={() => setIcon(key)} className="peer sr-only" />
                      <span className={cn('flex size-9 items-center justify-center rounded-[10px] text-fg-muted transition-colors peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-focus hover:bg-surface-muted')}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="sr-only">{key}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" loading={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CategoryRow({ category, groups, tone }: { category: Category; groups: CategoryGroup[]; tone: Parameters<typeof CategoryIcon>[0]['tone'] }) {
  const [pending, start] = useTransition()
  const toggle = () =>
    start(async () => {
      const result = await updateCategoryAction(category.id, { isActive: !category.isActive })
      if (result.ok) toast.success(category.isActive ? 'Categoria arquivada. O histórico continua intacto.' : 'Categoria reativada.')
      else toast.error(result.error.message)
    })
  return (
    <li className={cn('flex items-center gap-3 border-t border-divider px-3 py-2.5 first:border-t-0', !category.isActive && 'opacity-55')}>
      <CategoryIcon icon={category.icon} tone={tone} size="sm" />
      <span className="flex-1 truncate text-sm">
        {category.name}
        {!category.isActive ? <span className="ml-2 text-caption">arquivada</span> : null}
      </span>
      <CategoryDialog
        category={category}
        groups={groups}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${category.name}`}>
            <Pencil aria-hidden />
          </Button>
        }
      />
      {category.systemKey === 'other' ? null : (
        <Button variant="ghost" size="icon-sm" loading={pending} onClick={toggle} aria-label={category.isActive ? `Arquivar ${category.name}` : `Reativar ${category.name}`}>
          {category.isActive ? <Archive aria-hidden /> : <RotateCcw aria-hidden />}
        </Button>
      )}
    </li>
  )
}
