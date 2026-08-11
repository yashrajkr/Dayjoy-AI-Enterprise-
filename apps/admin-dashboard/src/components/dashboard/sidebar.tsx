'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  LayoutDashboard, Bot, BookOpen, Users, BarChart3,
  Phone, Workflow, Settings, Sparkles, ChevronRight
} from 'lucide-react'
import type { ViewKey } from '@/app/page'

const navGroups: { label: string; items: { key: ViewKey; label: string; icon: typeof LayoutDashboard; badge?: string }[] }[] = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    ]
  },
  {
    label: 'AI Platform',
    items: [
      { key: 'ai', label: 'AI Management', icon: Bot, badge: '3' },
      { key: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
      { key: 'voice', label: 'Voice AI', icon: Phone, badge: '12' },
    ]
  },
  {
    label: 'Business',
    items: [
      { key: 'crm', label: 'CRM', icon: Users },
      { key: 'automation', label: 'Automation', icon: Workflow },
    ]
  },
  {
    label: 'Administration',
    items: [
      { key: 'system', label: 'System', icon: Settings },
    ]
  },
]

export function Sidebar({
  activeView,
  onViewChange,
  open,
  onClose,
}: {
  activeView: ViewKey
  onViewChange: (v: ViewKey) => void
  open: boolean
  onClose: () => void
}) {
  return (
    <>
      <aside className="hidden lg:flex w-[260px] flex-col border-r border-border bg-sidebar fixed inset-y-0 left-0 z-40">
        <SidebarContent activeView={activeView} onViewChange={onViewChange} />
      </aside>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="left" className="w-[260px] p-0">
          <SidebarContent activeView={activeView} onViewChange={(v) => { onViewChange(v); onClose() }} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function SidebarContent({ activeView, onViewChange }: { activeView: ViewKey; onViewChange: (v: ViewKey) => void }) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-sm">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-[15px] font-bold leading-none tracking-tight">Dayjoy AI</p>
          <p className="text-[11px] text-muted-foreground mt-1">Enterprise Platform</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = activeView === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => onViewChange(item.key)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {isActive && <div className="absolute left-0 h-5 w-1 rounded-r-full bg-primary" style={{ marginLeft: '-12px' }} />}
                    <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && (
                      <span className={cn(
                        'flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}>
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

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 hover:bg-muted transition-colors cursor-pointer">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-sm font-bold shrink-0">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate">Admin User</p>
            <p className="text-[11px] text-muted-foreground truncate">admin@dayjoy.ai</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}
