'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Bell, Menu, Search, Settings, LogOut, User, Moon, Sun, ChevronDown, Command } from 'lucide-react'
import { useTheme } from 'next-themes'

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, setTheme } = useTheme()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-md px-4 lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search with Command hint */}
      <div className="relative hidden md:flex flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers, orders, knowledge..."
          className="pl-10 pr-16 bg-muted/50 border-0 h-9 text-sm"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Command className="h-3 w-3" />K
        </kbd>
      </div>

      <div className="flex flex-1 md:flex-initial items-center justify-end gap-1.5">
        {/* Theme toggle */}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-semibold">Notifications</span>
              <Badge variant="secondary" className="text-xs">3 new</Badge>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {[
                { title: 'New lead from Voice AI', desc: 'Rahul Sharma — Product inquiry', time: '2m ago', color: 'bg-blue-500' },
                { title: 'Order #ORD-042 delivered', desc: '₹3,450 — 3 items shipped', time: '15m ago', color: 'bg-green-500' },
                { title: 'Ticket #TKT-156 created', desc: 'Refund request — High priority', time: '1h ago', color: 'bg-red-500' },
              ].map((n, i) => (
                <div key={i} className="flex gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer border-b last:border-0">
                  <div className={`mt-0.5 h-2 w-2 rounded-full ${n.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t px-4 py-2 text-center">
              <Button variant="ghost" size="sm" className="w-full text-xs">View all notifications</Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 h-9 hover:bg-muted">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-gradient-to-br from-orange-400 to-amber-500 text-white text-xs font-bold">AD</AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-sm font-medium">Admin</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Admin User</span>
                <span className="text-xs text-muted-foreground">admin@dayjoy.ai</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem><User className="mr-2 h-4 w-4" /> Profile</DropdownMenuItem>
            <DropdownMenuItem><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 dark:text-red-400"><LogOut className="mr-2 h-4 w-4" /> Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
