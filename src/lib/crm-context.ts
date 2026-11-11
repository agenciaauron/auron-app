import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isManager, type TeamMember } from '@/lib/crm'

// Usuário logado + empresa + perfil, para páginas e rotas da API.
export async function getCrmContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = (claimsData?.claims?.sub as string | undefined) ?? null

  if (!userId) {
    return { supabase, userId: null, companyId: null, role: null }
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single()

  return {
    supabase,
    userId,
    companyId: (membership?.company_id as string | undefined) ?? null,
    role: (membership?.role as string | undefined) ?? null,
  }
}

type ApiContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  companyId: string
  role: string
}

// Para rotas da API: devolve o contexto ou a resposta de erro pronta.
export async function requireApiContext(
  options: { managerOnly?: boolean } = {}
): Promise<{ context: ApiContext; error: null } | { context: null; error: NextResponse }> {
  const { supabase, userId, companyId, role } = await getCrmContext()

  if (!userId) {
    return { context: null, error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  }

  if (!companyId || !role) {
    return { context: null, error: NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 }) }
  }

  if (options.managerOnly && !isManager(role)) {
    return {
      context: null,
      error: NextResponse.json({ error: 'Seu perfil não tem acesso a essa função.' }, { status: 403 }),
    }
  }

  return { context: { supabase, userId, companyId, role }, error: null }
}

// Equipe da empresa com nome (perfil) e papel.
export async function loadTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<TeamMember[]> {
  const { data: members } = await supabase
    .from('company_members')
    .select('user_id, role')
    .eq('company_id', companyId)

  const ids = (members ?? []).map((member) => member.user_id as string)
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] }

  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]))

  return (members ?? []).map((member) => ({
    user_id: member.user_id as string,
    role: member.role as string,
    name: names.get(member.user_id as string)?.trim() || 'Sem nome',
  }))
}
