'use client'

import {
  Activity, BarChart3, Bot, ChevronRight, ClipboardList, Cpu, Database,
  LayoutDashboard, MessageCircle, MessagesSquare, Phone,
  Sparkles, Users, Workflow, KeyRound, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavItem = {
  label: string
  view: string
  icon: typeof LayoutDashboard
  badge?: string
  pulse?: boolean
}

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', view: 'dashboard', icon: LayoutDashboard },
      { label: 'Analytics', view: 'analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'AI Control Center',
    items: [
      { label: 'AI Management', view: 'ai', icon: Bot },
      { label: 'Knowledge Base', view: 'knowledge', icon: Database },
    ],
  },
  {
    label: 'AI Channels',
    items: [
      { label: 'Voice AI', view: 'voice', icon: Phone },
      { label: 'Website AI', view: 'website', icon: MessageCircle },
      { label: 'WhatsApp AI', view: 'whatsapp', icon: MessagesSquare },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'CRM', view: 'crm', icon: Users },
      { label: 'Automation', view: 'automation', icon: Workflow },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users & Roles', view: 'users', icon: Users },
      { label: 'Provider Config', view: 'providers', icon: KeyRound },
      { label: 'System Config', view: 'system', icon: Cpu },
      { label: 'Audit Logs', view: 'audit', icon: ClipboardList },
    ],
  },
]

export const mobileNav: NavItem[] = [
  { label: 'Home', view: 'dashboard', icon: LayoutDashboard },
  { label: 'AI', view: 'ai', icon: Bot },
  { label: 'Voice', view: 'voice', icon: Phone },
  { label: 'Users', view: 'users', icon: Users },
  { label: 'Audit', view: 'audit', icon: BarChart3 },
]

export function SidebarContentPanel({
  activeView,
  onViewChange,
  onNavigate,
}: {
  activeView: string
  onViewChange: (v: string) => void
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="bg-gradient-brand grid size-10 shrink-0 place-items-center rounded-xl shadow-lg">
          <Sparkles className="size-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight">Dayjoy AI</p>
          <p className="truncate text-[11px] text-subtle">Control Center</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label} className="min-w-0">
            <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = activeView === item.view
                const Icon = item.icon
                return (
                  <button
                    key={item.view}
                    onClick={() => {
                      onViewChange(item.view)
                      onNavigate?.()
                    }}
                    className={cn(
                      'relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
                      active
                        ? 'bg-brand/12 text-foreground'
                        : 'text-sidebar-foreground hover:bg-glass hover:text-foreground',
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 left-1 w-[3px] rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" />
                    )}
                    <Icon className={cn('size-4 shrink-0 transition-colors', active && 'text-brand')} />
                    <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          'num shrink-0 rounded-md border border-brand/25 bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand',
                          item.pulse && 'live-dot',
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile */}
      <div className="border-t border-border p-3">
        <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-glass">
          <span className="bg-gradient-brand grid size-9 shrink-0 place-items-center rounded-full p-[2px]">
            <span className="grid size-full place-items-center rounded-full bg-background text-xs font-bold">AU</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">Admin User</span>
            <span className="block truncate text-[11px] text-subtle">admin@dayjoy.ai</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle" />
        </button>
      </div>
    </div>
  )
}
