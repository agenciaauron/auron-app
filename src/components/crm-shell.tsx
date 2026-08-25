'use client'

import Link from 'next/link'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  companyName: string
  role: string
  activeItem: 'overview' | 'leads' | 'contracts' | 'finance' | 'reports'
  children: ReactNode
}

const navigation = [
  { key: 'overview', label: 'Visão geral', href: '/dashboard', enabled: true },
  { key: 'leads', label: 'Leads', href: '/leads', enabled: true },
  { key: 'contracts', label: 'Contratos', href: '#', enabled: false },
  { key: 'finance', label: 'Financeiro', href: '#', enabled: false },
  { key: 'reports', label: 'Relatórios', href: '#', enabled: false },
] as const

export function CrmShell({ companyName, role, activeItem, children }: Props) {
  const router = useRouter()

  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch('/leads')
  }, [router])

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-800/80 bg-zinc-950 lg:flex">
        <div className="flex h-20 items-center border-b border-zinc-800/80 px-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center">
            <img
              src="/logo-auron.svg"
              alt="Auron Marketing"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="ml-3">
            <p className="font-semibold tracking-tight">Auron CRM</p>
            <p className="text-xs text-zinc-500">Gestão comercial</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6">
          {navigation.map((item) => {
            const active = activeItem === item.key

            if (!item.enabled) {
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-zinc-500"
                >
                  <span>{item.label}</span>
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                    Em breve
                  </span>
                </div>
              )
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                prefetch={true}
                onMouseEnter={() => router.prefetch(item.href)}
                className={`block rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-purple-600/15 font-medium text-purple-300'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-zinc-800/80 p-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="truncate text-sm font-medium">{companyName}</p>
            <p className="mt-1 text-xs capitalize text-zinc-500">{role}</p>
          </div>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-64">
        <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex items-center lg:hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <img
                src="/logo-auron.svg"
                alt="Auron Marketing"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="ml-3">
              <p className="font-semibold">Auron CRM</p>
              <p className="text-xs text-zinc-500">{companyName}</p>
            </div>
          </div>

          {children}
        </div>
      </main>
    </div>
  )
}
