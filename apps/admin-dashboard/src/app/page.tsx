'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { DashboardView } from '@/components/views/dashboard-view'
import { AIView } from '@/components/views/ai-view'
import { KnowledgeView } from '@/components/views/knowledge-view'
import { CRMView } from '@/components/views/crm-view'
import { AnalyticsView } from '@/components/views/analytics-view'
import { VoiceView } from '@/components/views/voice-view'
import { AutomationView } from '@/components/views/automation-view'
import { SystemView } from '@/components/views/system-view'
import { WebsiteAIView } from '@/components/views/website-view'
import { WhatsAppAIView } from '@/components/views/whatsapp-view'
import { UsersView } from '@/components/views/users-view'
import { AuditView } from '@/components/views/audit-view'
import { ProviderConfigView } from '@/components/views/provider-config-view'

export default function Home() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('dayjoy_auth')
      if (!raw) {
        router.replace('/login')
        return
      }
    } catch {
      // ignore
    }
    setReady(true)
  }, [router])

  const handleViewChange = (v: string) => {
    setActiveView(v)
    const labels: Record<string, string> = {
      dashboard: 'Dashboard',
      analytics: 'Analytics',
      ai: 'AI Management',
      knowledge: 'Knowledge Base',
      voice: 'Voice AI',
      website: 'Website AI',
      whatsapp: 'WhatsApp AI',
      crm: 'CRM',
      automation: 'Automation',
      users: 'Users & Roles',
      system: 'System Config',
      providers: 'Provider Config',
      audit: 'Audit Logs',
    }
    if (v !== 'dashboard') {
      toast.success(`Switched to ${labels[v] ?? v}`, {
        description: 'Navigation updated',
      })
    }
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView onViewChange={handleViewChange} />
      case 'ai': return <AIView />
      case 'knowledge': return <KnowledgeView />
      case 'crm': return <CRMView />
      case 'analytics': return <AnalyticsView />
      case 'voice': return <VoiceView onViewChange={handleViewChange} />
      case 'automation': return <AutomationView />
      case 'system': return <SystemView />
      case 'website': return <WebsiteAIView onViewChange={handleViewChange} />
      case 'whatsapp': return <WhatsAppAIView onViewChange={handleViewChange} />
      case 'users': return <UsersView />
      case 'audit': return <AuditView />
      case 'providers': return <ProviderConfigView />
      default: return <DashboardView />
    }
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 text-subtle">
          <span className="live-dot size-2 rounded-full bg-brand" />
          <span className="text-sm">Loading Dayjoy AI…</span>
        </div>
      </div>
    )
  }

  return (
    <AppShell activeView={activeView} onViewChange={handleViewChange}>
      {renderView()}
    </AppShell>
  )
}
