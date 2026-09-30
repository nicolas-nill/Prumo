import { expect, test, type Page } from '@playwright/test'

async function signInAs(page: Page, name: 'Lucas Andrade' | 'Marina Costa') {
  await page.goto('/entrar')
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(/\/visao-geral/)
}

test('login demo abre a visão geral com os números do mês', async ({ page }) => {
  await signInAs(page, 'Lucas Andrade')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Receitas', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Quanto ainda posso gastar' })).toBeVisible()
})

test('registra uma movimentação pelo painel e encontra na lista', async ({ page }, testInfo) => {
  const description = `Café E2E ${testInfo.project.name} ${Date.now()}`
  await signInAs(page, 'Lucas Andrade')
  await page.goto('/movimentacoes?nova=1')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Valor').fill('12,34')
  await dialog.getByLabel('Descrição').fill(description)
  await dialog.getByLabel('Categoria').selectOption({ label: 'Restaurantes' })
  await dialog.getByRole('button', { name: 'Registrar' }).click()
  await expect(dialog).toBeHidden()

  await page.goto(`/movimentacoes?busca=${encodeURIComponent(description)}`)
  await expect(page.getByRole('button', { name: `Editar ${description}, R$ 12,34` })).toBeVisible()
})

test('simulador do WhatsApp registra um gasto pelo mesmo pipeline do webhook', async ({ page }) => {
  await signInAs(page, 'Lucas Andrade')
  await page.goto('/dev/whatsapp')
  await page.getByLabel('Mensagem').fill('gastei 23,50 no almoço')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.getByText(/Registrei R\$\s?23,50/)).toBeVisible()
})

test('privacidade: gasto pessoal e privado só aparece para quem registrou', async ({ page, context }) => {
  // The seed has a private personal expense of Marina ("Salão") every month.
  await signInAs(page, 'Marina Costa')
  await page.goto('/movimentacoes?busca=Sal%C3%A3o')
  await expect(page.getByRole('button', { name: /^Editar Salão/ }).first()).toBeVisible()

  await context.clearCookies()
  await signInAs(page, 'Lucas Andrade')
  await page.goto('/movimentacoes?busca=Sal%C3%A3o')
  await expect(page.getByText('Nenhuma movimentação com esses filtros')).toBeVisible()
})
