import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()

  const userId = claimsData?.claims?.sub

  if (!userId) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, platform_role')
    .eq('id', userId)
    .single()

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .single()

  let company = null

  if (membership) {
    const { data } = await supabase
      .from('companies')
      .select('id, name, slug, status')
      .eq('id', membership.company_id)
      .single()

    company = data
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <h1 className="text-3xl font-bold">
        Auron App
      </h1>

      <div className="mt-8 space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <p>
          <strong>Usuário:</strong>{' '}
          {profile?.full_name ?? 'Não identificado'}
        </p>

        <p>
          <strong>Nível:</strong>{' '}
          {profile?.platform_role ?? 'Não identificado'}
        </p>

        <p>
          <strong>Empresa:</strong>{' '}
          {company?.name ?? 'Nenhuma empresa vinculada'}
        </p>

        <p>
          <strong>Função na empresa:</strong>{' '}
          {membership?.role ?? 'Não identificada'}
        </p>

        <p>
          <strong>Status:</strong>{' '}
          {company?.status ?? 'Não identificado'}
        </p>
      </div>
    </main>
  )
}