'use client'

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { SidebarContentPanel, mobileNav } from './sidebar-nav'
import { AppHeader } from './app-header'
import { cn } from '@/lib/utils'

function MeshBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <span className="orb top-[-10%] left-[-5%] size-[420px] bg-brand/12" />
      <span className="orb top-[35%] right-[-10%] size-[380px] bg-info/8 [animation-duration:28s]" />
      <span className="orb bottom-[-15%] left-[30%] size-[420px] bg-violet/8 [animation-duration:34s]" />
    </div>
  )
}

export function AppShell({
  children,
  activeView,
  onViewChange,
}: {
  children: ReactNode
  activeView: string
  onViewChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  return (
    <div className="min-h-screen">
      <MeshBackground />

      {/* Desktop sidebar */}
      <aside className="glass fixed inset-y-0 left-0 z-40 hidden w-[260px] overflow-hidden rounded-none border-y-0 border-l-0 lg:block">
        <SidebarContentPanel activeView={activeView} onViewChange={onViewChange} />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="glass fixed inset-y-0 left-0 z-50 w-[268px] overflow-hidden rounded-none border-y-0 border-l-0 lg:hidden"
            >
              <button
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
                className="absolute top-5 right-3 grid size-8 place-items-center rounded-lg text-subtle hover:text-foreground"
              >
                <X className="size-4" />
              </button>
              <SidebarContentPanel
                activeView={activeView}
                onViewChange={onViewChange}
                onNavigate={() => setOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="lg:pl-[260px]">
        <AppHeader onMenu={() => setOpen(true)} onViewChange={onViewChange} />
        <main className="space-y-6 p-4 pb-28 md:p-6 md:pb-8">
          {/* Instant view switch - no exit animation delay */}
          <motion.div
            key={activeView}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 px-2 py-2 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {mobileNav.map((item) => {
          const active = activeView === item.view
          const Icon = item.icon
          return (
            <button
              key={item.label}
              onClick={() => onViewChange(item.view)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-medium transition-colors',
                active ? 'text-brand' : 'text-subtle',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
