import { LeadDetails } from '@/components/lead-details'
import { LeadStageSelect } from '@/components/lead-stage-select'
import { NewLeadForm } from '@/components/new-lead-form'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!membership) {
    return (
      <main className="min-h-screen bg-zinc-950 p-10 text-white">
        Nenhuma empresa vinculada.
      </main>
    )
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', membership.company_id)
    .single()

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, position')
    .eq('company_id', membership.company_id)
    .order('position')

  const { data: leads } = await supabase
    .from('leads')
    .select(
      'id, name, phone, email, source, campaign, notes, stage_id, estimated_value, sale_value'
    )
    .eq('company_id', membership.company_id)

  return (
    <main className="min-h-screen bg-zinc-950 p-8 text-white">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-sm text-purple-400">
            Auron App
          </p>

          <h1 className="mt-1 text-3xl font-semibold">
            {company?.name}
          </h1>

          <p className="mt-2 text-zinc-400">
            Funil comercial
          </p>
        </div>

        <NewLeadForm />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-6">
        {stages?.map((stage) => {
          const stageLeads =
            leads?.filter((lead) => lead.stage_id === stage.id) ?? []

          return (
            <section
              key={stage.id}
              className="min-w-[290px] rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">
                  {stage.name}
                </h2>

                <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                  {stageLeads.length}
                </span>
              </div>

              <div className="space-y-3">
                {stageLeads.length === 0 && (
                  <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
                    Nenhum lead
                  </div>
                )}

                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"
                  >
                    <p className="font-medium">
                      {lead.name}
                    </p>

                    {lead.phone && (
                      <p className="mt-1 text-sm text-zinc-400">
                        {lead.phone}
                      </p>
                    )}

                    {lead.source && (
                      <p className="mt-2 text-xs text-zinc-500">
                        Origem: {lead.source}
                      </p>
                    )}

                    {lead.estimated_value && (
                      <p className="mt-2 text-sm text-zinc-300">
                        R$ {Number(lead.estimated_value).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    )}

                    <LeadStageSelect
                      leadId={lead.id}
                      currentStageId={lead.stage_id}
                      stages={stages ?? []}
                    />

                    <LeadDetails
                      lead={lead}
                      stages={stages ?? []}
                    />
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
