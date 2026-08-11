'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, Menu, Moon, Search, Sun, LogOut, User, Settings, KeyRound,
  LayoutDashboard, BarChart3, Bot, Database, Phone, MessageCircle,
  MessagesSquare, Users, Workflow, Cpu, ClipboardList, FileText,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Pill } from '@/components/kit/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useAdminStore, useCurrentUser } from '@/store/admin-store'
import { ROLE_LABELS } from '@/lib/rbac'
import { useAuditStore } from '@/store/audit-store'

interface SearchableAction {
  id: string
  label: string
  description: string
  icon: LucideIcon
  view?: string
  action?: () => void
  keywords?: string[]
}

interface AppHeaderProps {
  onMenu: () => void
  onViewChange?: (v: string) => void
}

export function AppHeader({ onMenu, onViewChange }: AppHeaderProps) {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const updateAdmin = useAdminStore((s) => s.update)
  const [isDark, setIsDark] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  // Theme init
  useEffect(() => {
    const stored = localStorage.getItem('dayjoy-theme')
    if (stored === 'light') {
      setIsDark(false)
      document.documentElement.classList.remove('dark')
    } else {
      setIsDark(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  // ⌘K / Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggleTheme = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    if (newIsDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('dayjoy-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('dayjoy-theme', 'light')
    }
  }

  const navigate = (view: string) => {
    onViewChange?.(view)
    setSearchOpen(false)
  }

  const searchableActions: SearchableAction[] = useMemo(() => [
    { id: 'dashboard', label: 'Dashboard', description: 'Platform overview', icon: LayoutDashboard, view: 'dashboard', keywords: ['home', 'overview'] },
    { id: 'analytics', label: 'Analytics', description: 'Revenue, channels, AI performance', icon: BarChart3, view: 'analytics', keywords: ['charts', 'metrics', 'reports'] },
    { id: 'ai', label: 'AI Management', description: 'Assistants, tools, memory, prompts', icon: Bot, view: 'ai', keywords: ['assistant', 'agent', 'llm'] },
    { id: 'knowledge', label: 'Knowledge Base', description: 'Documents, RAG, embeddings', icon: Database, view: 'knowledge', keywords: ['document', 'rag', 'upload'] },
    { id: 'voice', label: 'Voice AI', description: 'Vapi voice assistant', icon: Phone, view: 'voice', keywords: ['call', 'telephony', 'vapi'] },
    { id: 'website', label: 'Website AI', description: 'Chat widget configuration', icon: MessageCircle, view: 'website', keywords: ['chat', 'widget', 'embed'] },
    { id: 'whatsapp', label: 'WhatsApp AI', description: 'WhatsApp Business API', icon: MessagesSquare, view: 'whatsapp', keywords: ['meta', 'message', 'business'] },
    { id: 'crm', label: 'CRM', description: 'Customers, distributors, leads', icon: Users, view: 'crm', keywords: ['customer', 'lead', 'distributor'] },
    { id: 'automation', label: 'Automation', description: 'Workflows and triggers', icon: Workflow, view: 'automation', keywords: ['workflow', 'n8n', 'trigger'] },
    { id: 'users', label: 'Users & Roles', description: 'Admin management and RBAC', icon: KeyRound, view: 'users', keywords: ['admin', 'role', 'permission', 'rbac'] },
    { id: 'providers', label: 'Provider Config', description: 'Vapi, WhatsApp, OpenAI credentials', icon: Settings, view: 'providers', keywords: ['api', 'key', 'secret', 'credential'] },
    { id: 'system', label: 'System Config', description: 'Infrastructure and security', icon: Cpu, view: 'system', keywords: ['security', 'health', 'resource'] },
    { id: 'audit', label: 'Audit Logs', description: 'Action history and compliance', icon: ClipboardList, view: 'audit', keywords: ['log', 'history', 'compliance'] },
    { id: 'profile', label: 'My Profile', description: 'View and edit your account', icon: User, action: () => { setProfileOpen(true); setSearchOpen(false) }, keywords: ['account', 'settings'] },
    { id: 'signout', label: 'Sign Out', description: 'End your session', icon: LogOut, action: () => { signOut(); setSearchOpen(false) }, keywords: ['logout', 'exit'] },
  ], [])

  const openNotifications = () => {
    const auditEntries = useAuditStore.getState().entries
    const recent = auditEntries.length
    toast.info(`${recent} audit entries`, {
      description: recent > 0 ? 'See Audit Logs for full history.' : 'No recent activity.',
    })
  }

  const openAccount = () => setMenuOpen((o) => !o)

  const signOut = () => {
    setMenuOpen(false)
    try {
      window.localStorage.removeItem('dayjoy_auth')
    } catch {
      // ignore
    }
    toast.success('Signed out', { description: 'Redirecting to login…' })
    setTimeout(() => router.push('/login'), 600)
  }

  return (
    <>
      <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 backdrop-blur-xl md:px-6">
        <button
          onClick={onMenu}
          aria-label="Open navigation"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-glass text-subtle transition-colors hover:text-foreground lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <button
          onClick={() => setSearchOpen(true)}
          className="relative flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-glass px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:border-brand/30 md:max-w-md"
          aria-label="Open search"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">Search or jump to…</span>
          <span className="num shrink-0 rounded-md border border-border bg-glass-strong px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Pill tone="success" dot pulse className="hidden xl:inline-flex">
            All Systems Operational
          </Pill>

          <button
            aria-label="Notifications"
            onClick={openNotifications}
            className="relative grid size-9 place-items-center rounded-xl border border-border bg-glass text-subtle transition-colors hover:text-foreground"
          >
            <Bell className="size-4" />
            <span className="live-dot absolute top-2 right-2 size-2 rounded-full bg-brand text-brand/40" />
          </button>

          <button
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="grid size-9 place-items-center rounded-xl border border-border bg-glass text-subtle transition-colors hover:text-foreground"
          >
            {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>

          <div className="relative">
            <button
              aria-label="Account"
              onClick={openAccount}
              className="bg-gradient-brand grid size-9 shrink-0 place-items-center rounded-full p-[2px] transition-transform hover:scale-[1.04]"
            >
              <span className="grid size-full place-items-center rounded-full bg-background text-[11px] font-bold">
                {currentUser?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) ?? 'AU'}
              </span>
            </button>
            {menuOpen ? (
              <>
                <button
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="glass absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-border shadow-lg">
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-[13px] font-semibold">{currentUser?.name ?? 'Admin User'}</p>
                    <p className="truncate text-[11px] text-subtle">{currentUser?.email ?? 'admin@dayjoy.ai'}</p>
                    {currentUser ? (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-md border border-brand/25 bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        {ROLE_LABELS[currentUser.role]}
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); setProfileOpen(true) }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-subtle transition-colors hover:bg-glass hover:text-foreground"
                  >
                    <User className="size-4" /> Profile
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onViewChange?.('providers') }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-subtle transition-colors hover:bg-glass hover:text-foreground"
                  >
                    <Settings className="size-4" /> Provider Config
                  </button>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-danger transition-colors hover:bg-danger/8"
                  >
                    <LogOut className="size-4" /> Sign out
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* Command palette */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>Jump to any page or action</DialogDescription>
          </DialogHeader>
          <Command className="bg-popover">
            <CommandInput placeholder="Search pages, actions, or jump to…" />
            <CommandList className="max-h-[400px]">
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Navigation">
                {searchableActions.filter((a) => a.view).map((action) => {
                  const Icon = action.icon
                  return (
                    <CommandItem
                      key={action.id}
                      value={`${action.label} ${action.description} ${action.keywords?.join(' ') ?? ''}`}
                      onSelect={() => navigate(action.view!)}
                      className="cursor-pointer"
                    >
                      <Icon className="mr-2 size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{action.label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{action.description}</p>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              <CommandGroup heading="Actions">
                {searchableActions.filter((a) => a.action && !a.view).map((action) => {
                  const Icon = action.icon
                  return (
                    <CommandItem
                      key={action.id}
                      value={`${action.label} ${action.description} ${action.keywords?.join(' ') ?? ''}`}
                      onSelect={() => action.action!()}
                      className="cursor-pointer"
                    >
                      <Icon className="mr-2 size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{action.label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{action.description}</p>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Profile editor */}
      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        onSave={(name, email) => {
          if (!currentUser) return
          updateAdmin(currentUser.id, { name, email })
          toast.success('Profile updated', { description: 'Your changes have been saved.' })
        }}
      />
    </>
  )
}

function ProfileDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (name: string, email: string) => void
}) {
  const currentUser = useCurrentUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && currentUser) {
      setName(currentUser.name)
      setEmail(currentUser.email)
    }
  }, [open, currentUser])

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Valid email is required'); return
    }
    setSaving(true)
    setTimeout(() => {
      onSave(name.trim(), email.trim())
      setSaving(false)
      onOpenChange(false)
    }, 300)
  }

  if (!currentUser) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
          <DialogDescription>Update your account details. Role changes require a Super Admin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 py-2">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-brand grid size-16 shrink-0 place-items-center rounded-2xl p-[2px]">
              <span className="grid size-full place-items-center rounded-2xl bg-background text-xl font-bold">
                {name.split(' ').map((n) => n[0]).join('').slice(0, 2) || 'AU'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{currentUser.name}</p>
              <p className="truncate text-[12px] text-subtle">{ROLE_LABELS[currentUser.role]}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Member since {new Date(currentUser.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-[12px] font-semibold">Full Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 border-border bg-glass"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email" className="text-[12px] font-semibold">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 border-border bg-glass"
            />
          </div>
          <div className="rounded-lg border border-border bg-glass p-3 text-[11px] text-subtle">
            <p><strong className="text-foreground">Role:</strong> {ROLE_LABELS[currentUser.role]}</p>
            <p><strong className="text-foreground">Status:</strong> <span className="capitalize">{currentUser.status}</span></p>
            <p><strong className="text-foreground">Last active:</strong> {currentUser.lastActiveAt ? new Date(currentUser.lastActiveAt).toLocaleString('en-IN') : 'Now'}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
