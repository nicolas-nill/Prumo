import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_CATEGORIES, defaultCategoryKeys } from '@/domain/catalog'
import { PLAN_ENTITLEMENTS } from '@/domain/entitlements'
import { DEMO_SPACE, DEMO_USERS } from '@/server/data/demo/dataset'
import { asUser, createTestDatabase, createUser, type TestDb } from './harness'

let db: TestDb
const LUCAS = DEMO_USERS.lucas.id
const MARINA = DEMO_USERS.marina.id
const SPACE = DEMO_SPACE.id
let outsider: string

beforeAll(async () => {
  db = await createTestDatabase('prumo_test_rls', { seed: true })
  outsider = await createUser(db.client, 'rafael@prumo.dev', 'Rafael Lima')
})

afterAll(async () => {
  await db?.close()
})

describe('space isolation', () => {
  it('members see their space; outsiders see nothing', async () => {
    const mine = await asUser(db.client, LUCAS, (q) => q('select count(*)::int as n from transactions'))
    expect(mine.rows[0].n).toBeGreaterThan(100)

    const theirs = await asUser(db.client, outsider, async (q) => ({
      tx: (await q('select count(*)::int as n from transactions')).rows[0].n,
      spaces: (await q('select count(*)::int as n from financial_spaces')).rows[0].n,
      categories: (await q('select count(*)::int as n from categories')).rows[0].n,
      totals: (await q(`select count(*)::int as n from space_category_totals($1, '2000-01-01', '2100-01-01')`, [SPACE])).rows[0].n,
    }))
    expect(theirs).toEqual({ tx: 0, spaces: 0, categories: 0, totals: 0 })
  })

  it('outsiders cannot write into a space', async () => {
    await expect(
      asUser(db.client, outsider, (q) =>
        q(
          `insert into transactions (space_id, type, amount_cents, occurred_on, description, member_id, created_by)
           values ($1, 'expense', 1000, current_date, 'Invasão', $2, $2)`,
          [SPACE, outsider],
        ),
      ),
    ).rejects.toThrow()
  })

  it('anonymous visitors cannot read application tables', async () => {
    await expect(asUser(db.client, null, (q) => q('select * from transactions limit 1'))).rejects.toThrow(/permission denied/)
  })
})

describe('couple privacy', () => {
  it('hides a partner private personal transaction, including from totals', async () => {
    const lucasView = await asUser(db.client, LUCAS, (q) =>
      q(`select count(*)::int as n from transactions where description = 'Salão'`),
    )
    const marinaView = await asUser(db.client, MARINA, (q) =>
      q(`select count(*)::int as n from transactions where description = 'Salão'`),
    )
    expect(lucasView.rows[0].n).toBe(0)
    expect(marinaView.rows[0].n).toBeGreaterThan(0)

    const sum = (userId: string) =>
      asUser(db.client, userId, (q) =>
        q(`select coalesce(sum(total_cents),0)::bigint as s from space_category_totals($1, '2000-01-01', '2100-01-01') where type = 'expense'`, [SPACE]),
      )
    const lucasTotal = await sum(LUCAS)
    const marinaTotal = await sum(MARINA)
    expect(Number(marinaTotal.rows[0].s)).toBeGreaterThan(Number(lucasTotal.rows[0].s))
  })

  it('lets any member edit shared rows but not a partner personal row', async () => {
    const shared = await asUser(db.client, LUCAS, (q) =>
      q(`update transactions set notes = 'ok' where scope = 'shared' and member_id = $1 returning id`, [MARINA]),
    )
    expect(shared.rowCount).toBeGreaterThan(0)

    const personal = await asUser(db.client, LUCAS, (q) =>
      q(`update transactions set notes = 'x' where scope = 'personal' and member_id = $1 returning id`, [MARINA]),
    )
    expect(personal.rowCount).toBe(0)
  })

  it('blocks hard deletes and immutable column changes', async () => {
    await expect(asUser(db.client, LUCAS, (q) => q('delete from transactions'))).rejects.toThrow(/permission denied/)
    await expect(
      asUser(db.client, LUCAS, (q) => q(`update transactions set created_by = $1 where member_id = $2`, [MARINA, LUCAS])),
    ).rejects.toThrow(/immutable/)
  })
})

describe('integrity', () => {
  it('rejects a category from another space (composite FK)', async () => {
    const otherSpace = await asUser(
      db.client,
      outsider,
      (q) => q(`select complete_onboarding('Rafael', 'Rafael', 'personal', 500000, 'preset', null, null) as id`),
      { commit: true },
    )
    const foreignCategory = await asUser(db.client, outsider, (q) =>
      q(`select id from categories where space_id = $1 and system_key = 'groceries'`, [otherSpace.rows[0].id]),
    )
    await expect(
      asUser(db.client, LUCAS, (q) =>
        q(
          `insert into transactions (space_id, type, amount_cents, occurred_on, description, member_id, created_by, category_id)
           values ($1, 'expense', 1000, current_date, 'Teste', $2, $2, $3)`,
          [SPACE, LUCAS, foreignCategory.rows[0].id],
        ),
      ),
    ).rejects.toThrow(/foreign key/)
  })

  it('never creates the same WhatsApp transaction twice (source_ref idempotency)', async () => {
    await expect(
      asUser(db.client, LUCAS, (q) =>
        q(
          `insert into transactions (space_id, type, amount_cents, occurred_on, description, member_id, created_by, source, source_ref)
           values ($1, 'expense', 3500, current_date, 'Almoço', $2, $2, 'whatsapp_text', 'wamid.X1'),
                  ($1, 'expense', 3500, current_date, 'Almoço', $2, $2, 'whatsapp_text', 'wamid.X1')`,
          [SPACE, LUCAS],
        ),
      ),
    ).rejects.toThrow(/duplicate key/)
  })

  it('stores money as integer cents only', async () => {
    await expect(
      asUser(db.client, LUCAS, (q) =>
        q(
          `insert into transactions (space_id, type, amount_cents, occurred_on, description, member_id, created_by)
           values ($1, 'expense', 0, current_date, 'Zero', $2, $2)`,
          [SPACE, LUCAS],
        ),
      ),
    ).rejects.toThrow(/check constraint/)
  })
})

describe('onboarding RPC', () => {
  it('creates profile, space, owner membership, catalog categories and the preset plan atomically', async () => {
    const userId = await createUser(db.client, 'ana@prumo.dev', 'Ana')
    const result = await asUser(db.client, userId, async (q) => {
      const spaceId = (await q(`select complete_onboarding('Ana Souza', 'Ana', 'personal', 800000, 'preset', null, null) as id`)).rows[0].id
      const again = (await q(`select complete_onboarding('Ana Souza', 'Ana', 'personal', 800000, 'preset', null, null) as id`)).rows[0].id
      const categories = (await q(`select system_key from categories where space_id = $1 order by system_key`, [spaceId])).rows.map((r) => r.system_key)
      const budgets = (await q(
        `select g.key, b.percent_bp from plan_group_budgets b join category_groups g on g.id = b.group_id where b.space_id = $1 order by g.sort_order`,
        [spaceId],
      )).rows
      const role = (await q(`select role from financial_space_members where space_id = $1 and user_id = $2`, [spaceId, userId])).rows[0].role
      return { spaceId, again, categories, budgets, role }
    })
    expect(result.again).toBe(result.spaceId)
    expect(result.role).toBe('owner')
    expect(result.categories).toEqual([...defaultCategoryKeys()].sort())
    expect(result.budgets).toEqual([
      { key: 'essentials', percent_bp: 5000 },
      { key: 'lifestyle', percent_bp: 4000 },
      { key: 'savings', percent_bp: 1000 },
    ])
  })

  it('mirrors the TypeScript catalog exactly', async () => {
    const userId = await createUser(db.client, 'bia@prumo.dev', 'Bia')
    const rows = await asUser(db.client, userId, async (q) => {
      const allKeys = CATALOG_CATEGORIES.map((c) => c.key)
      const id = (await q(`select complete_onboarding('Bia', 'Bia', 'personal', 0, 'skip', null, $1) as id`, [allKeys])).rows[0].id
      return (
        await q(
          `select c.system_key, c.name, c.kind, g.key as grp, c.icon, c.sort_order from categories c
           left join category_groups g on g.id = c.group_id where c.space_id = $1`,
          [id],
        )
      ).rows
    })
    for (const entry of CATALOG_CATEGORIES) {
      expect(rows.find((r) => r.system_key === entry.key)).toEqual({
        system_key: entry.key,
        name: entry.name,
        kind: entry.kind,
        grp: entry.group,
        icon: entry.icon,
        sort_order: entry.sortOrder,
      })
    }
  })
})

describe('invitations', () => {
  it('runs the full invite flow with hashed tokens, email check and member limit', async () => {
    const owner = await createUser(db.client, 'carla@prumo.dev', 'Carla')
    const partner = await createUser(db.client, 'diego@prumo.dev', 'Diego')
    const stranger = await createUser(db.client, 'eva@prumo.dev', 'Eva')

    const spaceId = (
      await asUser(db.client, owner, (q) => q(`select complete_onboarding('Carla', 'Carla & Diego', 'shared', 0, 'skip', null, null) as id`), {
        commit: true,
      })
    ).rows[0].id

    const invite = (
      await asUser(db.client, owner, (q) => q(`select * from create_invitation($1, 'Diego@Prumo.dev', 'member')`, [spaceId]), { commit: true })
    ).rows[0]
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{32}$/)

    const stored = await db.client.query(`select token_hash, email from space_invitations where id = $1`, [invite.invitation_id])
    expect(stored.rows[0].token_hash).toBe(createHash('sha256').update(invite.token).digest('hex'))
    expect(stored.rows[0].email).toBe('diego@prumo.dev')

    const preview = await asUser(db.client, null, (q) => q(`select * from get_invitation_preview($1)`, [invite.token]))
    expect(preview.rows[0]).toMatchObject({ space_name: 'Carla & Diego', inviter_name: 'Carla', email_hint: 'di•••@prumo.dev', status: 'pending' })

    await expect(asUser(db.client, stranger, (q) => q(`select accept_invitation($1)`, [invite.token]))).rejects.toThrow(/PRUMO_EMAIL_MISMATCH/)

    const accepted = await asUser(db.client, partner, (q) => q(`select accept_invitation($1) as id`, [invite.token]), { commit: true })
    expect(accepted.rows[0].id).toBe(spaceId)

    // Idempotent for the same user.
    const again = await asUser(db.client, partner, (q) => q(`select accept_invitation($1) as id`, [invite.token]))
    expect(again.rows[0].id).toBe(spaceId)

    // Plan limit: 2 members.
    await expect(
      asUser(db.client, owner, (q) => q(`select * from create_invitation($1, 'eva@prumo.dev', 'member')`, [spaceId])),
    ).rejects.toThrow(/PRUMO_LIMIT_REACHED/)

    // Plain members cannot invite.
    await expect(
      asUser(db.client, partner, (q) => q(`select * from create_invitation($1, 'eva@prumo.dev', 'member')`, [spaceId])),
    ).rejects.toThrow(/PRUMO_FORBIDDEN/)
  })
})

describe('plans and whatsapp linking', () => {
  it('keeps DB plan limits in sync with the app entitlements', async () => {
    const rows = (await db.client.query('select code, max_members, ai_actions_per_month, history_months, max_recurring_rules from plans')).rows
    for (const row of rows) {
      const e = PLAN_ENTITLEMENTS[row.code as 'free' | 'premium']
      expect([row.max_members, row.ai_actions_per_month, row.history_months, row.max_recurring_rules]).toEqual([
        e.maxMembers,
        e.aiActionsPerMonth,
        e.historyMonths,
        e.maxRecurringRules,
      ])
    }
  })

  it('issues a single-use link code stored only as a hash', async () => {
    const userId = await createUser(db.client, 'felipe@prumo.dev', 'Felipe')
    const spaceId = (
      await asUser(db.client, userId, (q) => q(`select complete_onboarding('Felipe', 'Felipe', 'personal', 0, 'skip', null, null) as id`), { commit: true })
    ).rows[0].id
    const link = (await asUser(db.client, userId, (q) => q(`select * from start_whatsapp_link('+5511912345678', $1)`, [spaceId]), { commit: true })).rows[0]
    expect(link.code).toMatch(/^\d{6}$/)
    const stored = await db.client.query('select verification_code_hash, status from whatsapp_identities where id = $1', [link.identity_id])
    expect(stored.rows[0]).toEqual({
      verification_code_hash: createHash('sha256').update(`${link.identity_id}:${link.code}`).digest('hex'),
      status: 'pending',
    })
    // Another user cannot hijack a verified number.
    await expect(
      asUser(db.client, LUCAS, (q) => q(`select * from start_whatsapp_link($1, $2)`, [DEMO_USERS.marina.phone, SPACE])),
    ).rejects.toThrow(/PRUMO_CONFLICT/)
  })

  it('service-role functions apply membership + privacy and are closed to users', async () => {
    await expect(
      asUser(db.client, LUCAS, (q) => q(`select * from space_category_totals_as($1, $2, '2000-01-01', '2100-01-01')`, [LUCAS, SPACE])),
    ).rejects.toThrow(/permission denied/)

    const total = async (viewer: string) =>
      Number(
        (
          await asUser(
            db.client,
            null,
            (q) => q(`select coalesce(sum(total_cents),0) as s from space_category_totals_as($1, $2, '2000-01-01', '2100-01-01') where type = 'expense'`, [viewer, SPACE]),
            { role: 'service_role' },
          )
        ).rows[0].s,
      )
    expect(await total(MARINA)).toBeGreaterThan(await total(LUCAS))
    expect(await total(outsider)).toBe(0)
  })

  it('verifies a WhatsApp link code only once, from the service role', async () => {
    const userId = await createUser(db.client, 'gabi@prumo.dev', 'Gabi')
    const spaceId = (
      await asUser(db.client, userId, (q) => q(`select complete_onboarding('Gabi', 'Gabi', 'personal', 0, 'skip', null, null) as id`), { commit: true })
    ).rows[0].id
    const link = (await asUser(db.client, userId, (q) => q(`select * from start_whatsapp_link('+5531912345678', $1)`, [spaceId]), { commit: true })).rows[0]
    const verify = (code: string) =>
      asUser(db.client, null, (q) => q(`select * from verify_whatsapp_link($1, $2)`, [['+5531912345678', '+553112345678'], code]), { role: 'service_role', commit: true })

    await expect(asUser(db.client, userId, (q) => q(`select * from verify_whatsapp_link($1, $2)`, [['+5531912345678'], link.code]))).rejects.toThrow(/permission denied/)
    expect((await verify('000000')).rows[0].status).toBe('invalid')
    expect((await verify(link.code)).rows[0]).toMatchObject({ status: 'verified', user_id: userId })
    expect((await verify(link.code)).rows[0].status).toBe('not_found')
  })

  it('does not let users verify their own identity or read others', async () => {
    await expect(
      asUser(db.client, LUCAS, (q) => q(`update whatsapp_identities set status = 'verified'`)),
    ).rejects.toThrow(/permission denied/)
    const visible = await asUser(db.client, LUCAS, (q) => q('select user_id from whatsapp_identities'))
    expect(visible.rows.every((r) => r.user_id === LUCAS)).toBe(true)
  })
})
