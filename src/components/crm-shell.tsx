'use client'

import Link from 'next/link'
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  FileSignature,
  LayoutDashboard,
  Megaphone,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

type Props = {
  companyName: string
  role: string
  activeItem: 'overview' | 'leads' | 'campaigns' | 'contracts' | 'finance' | 'reports'
  children: ReactNode
}

type NavItem = {
  key: Props['activeItem']
  label: string
  href: string
  icon: LucideIcon
  enabled: boolean
}

const navigation: NavItem[] = [
  { key: 'overview', label: 'Visão geral', href: '/dashboard', icon: LayoutDashboard, enabled: true },
  { key: 'leads', label: 'Leads', href: '/leads', icon: UsersRound, enabled: true },
  { key: 'campaigns', label: 'Campanhas', href: '/campanhas', icon: Megaphone, enabled: true },
  { key: 'finance', label: 'Financeiro', href: '/financeiro', icon: Wallet, enabled: true },
  { key: 'contracts', label: 'Contratos', href: '#', icon: FileSignature, enabled: false },
  { key: 'reports', label: 'Relatórios', href: '#', icon: BarChart3, enabled: false },
]

const roleLabels: Record<string, string> = {
  owner: 'Sócio',
  admin: 'Administrador',
  member: 'Equipe',
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function CrmShell({ companyName, role, activeItem, children }: Props) {
  const router = useRouter()

  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch('/leads')
    router.prefetch('/campanhas')
    router.prefetch('/financeiro')
  }, [router])

  return (
    <div className="min-h-screen bg-ink-1000 text-ink-100">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-ink-800/70 bg-ink-950 lg:flex">
        <div className="flex h-[72px] items-center gap-3 px-5">
          <img
            src="/logo-auron.svg"
            alt=""
            className="h-9 w-9 object-contain"
          />
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold tracking-tight text-ink-50">
              Auron
            </p>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-500">
              CRM comercial
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Menu principal">
          {navigation.map((item) => {
            const active = activeItem === item.key
            const Icon = item.icon

            if (!item.enabled) {
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-600"
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-ink-600">
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
                aria-current={active ? 'page' : undefined}
                onMouseEnter={() => router.prefetch(item.href)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-auron-500/12 font-semibold text-ink-50'
                    : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100'
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-auron-400" />
                )}
                <Icon
                  className={`h-[18px] w-[18px] ${active ? 'text-auron-300' : ''}`}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-ink-800/70 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-auron-600/25 font-display text-xs font-semibold text-auron-200">
              {initials(companyName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-100">{companyName}</p>
              <p className="text-xs text-ink-500">{roleLabels[role] ?? role}</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-ink-800/70 bg-ink-950/90 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <img src="/logo-auron.svg" alt="" className="h-8 w-8 object-contain" />
          <p className="font-display text-sm font-semibold">Auron CRM</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Menu principal">
          {navigation
            .filter((item) => item.enabled)
            .map((item) => {
              const Icon = item.icon
              const active = activeItem === item.key
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${
                    active ? 'bg-auron-500/15 text-ink-50' : 'text-ink-400'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {item.label}
                </Link>
              )
            })}
        </nav>
      </header>

      <main className="min-h-screen lg:pl-60">
        <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {children}
        </div>
      </main>
    </div>
  )
}
