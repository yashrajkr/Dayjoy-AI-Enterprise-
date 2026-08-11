'use client'

import { useState } from 'react'
import {
  Bot, Activity, Phone, Users, DollarSign,
  MessageSquare, ArrowUpRight, ArrowDownRight, Sparkles, Download,
  CalendarDays, Brain, Package, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { GlassCard, CardHead } from '@/components/kit/glass-card'
import { PageHeader, Pill, Meter } from '@/components/kit/page-header'
import { RevenueAreaChart, OutcomesDonut, ChannelUsageBars } from '@/components/kit/charts'
import { cn } from '@/lib/utils'

const kpis = [
  { label: 'Total Revenue', value: '₹3,74,000', change: '+12.5%', trend: 'up' as const, icon: DollarSign, tone: 'brand' as const, spark: [42, 48, 45, 58, 52, 68, 74] },
  { label: 'Total Customers', value: '8,452', change: '+3.2%', trend: 'up' as const, icon: Users, tone: 'info' as const, spark: [30, 34, 36, 39, 44, 46, 52] },
  { label: 'Active Calls', value: '23', change: '+5', trend: 'up' as const, icon: Phone, tone: 'success' as const, live: true, spark: [12, 18, 15, 22, 19, 26, 23] },
  { label: 'AI Conversations', value: '1,200', change: '-2.1%', trend: 'down' as const, icon: MessageSquare, tone: 'violet' as const, spark: [64, 58, 61, 55, 50, 48, 45] },
]

const revenueData = [
  { day: 'Mon', revenue: 42000, target: 50000 },
  { day: 'Tue', revenue: 48000, target: 50000 },
  { day: 'Wed', revenue: 45000, target: 50000 },
  { day: 'Thu', revenue: 61000, target: 55000 },
  { day: 'Fri', revenue: 53000, target: 55000 },
  { day: 'Sat', revenue: 68000, target: 60000 },
  { day: 'Sun', revenue: 74000, target: 60000 },
]

const callOutcomes = [
  { name: 'Completed', value: 145, tone: 'success' as const },
  { name: 'Transferred', value: 23, tone: 'brand' as const },
  { name: 'Abandoned', value: 12, tone: 'danger' as const },
  { name: 'Failed', value: 5, tone: 'muted' as const },
]

const channelUsage = [
  { channel: 'Voice', value: 320, tone: 'info' as const },
  { channel: 'WhatsApp', value: 450, tone: 'success' as const },
  { channel: 'Website', value: 280, tone: 'violet' as const },
  { channel: 'API', value: 150, tone: 'brand' as const },
]

const activities = [
  { title: 'Voice call — Rahul Sharma', desc: 'Product inquiry resolved by Sarah', time: '2m', icon: Phone, tone: 'info' as const },
  { title: 'New order #ORD-042', desc: '₹18,400 · Wellness bundle', time: '9m', icon: Package, tone: 'success' as const },
  { title: 'New lead from WhatsApp', desc: 'Meera Iyer · Score 82', time: '24m', icon: MessageSquare, tone: 'brand' as const },
  { title: 'Ticket #TKT-156 escalated', desc: 'Delivery delay → human agent', time: '41m', icon: Activity, tone: 'danger' as const },
  { title: 'AI conversation completed', desc: 'Website chat · 14 turns · CSAT 5.0', time: '1h', icon: Bot, tone: 'violet' as const },
]

const services = [
  { name: 'Backend API', status: 'healthy' as const, latency: '45ms', uptime: '99.9%' },
  { name: 'Database', status: 'healthy' as const, latency: '12ms', uptime: '99.9%' },
  { name: 'Redis', status: 'healthy' as const, latency: '2ms', uptime: '100%' },
  { name: 'Voice AI', status: 'healthy' as const, latency: '180ms', uptime: '99.5%' },
  { name: 'WhatsApp', status: 'degraded' as const, latency: '520ms', uptime: '97.2%' },
  { name: 'OpenAI', status: 'healthy' as const, latency: '850ms', uptime: '99.8%' },
]

const toneText: Record<string, string> = {
  brand: 'text-brand', info: 'text-info', success: 'text-success', violet: 'text-violet', danger: 'text-danger', muted: 'text-muted-foreground',
}
const toneBg: Record<string, string> = {
  brand: 'bg-brand/12 text-brand border-brand/25', info: 'bg-info/12 text-info border-info/25', success: 'bg-success/12 text-success border-success/25', violet: 'bg-violet/12 text-violet border-violet/25', danger: 'bg-danger/12 text-danger border-danger/25', muted: 'bg-glass-strong text-muted-foreground border-border',
}
const toneDotColor: Record<string, string> = {
  brand: 'bg-brand', info: 'bg-info', success: 'bg-success', violet: 'bg-violet', danger: 'bg-danger', muted: 'bg-subtle',
}
const toneGradient: Record<string, string> = {
  brand: 'bg-[linear-gradient(135deg,var(--brand),var(--gold))]',
  info: 'bg-[linear-gradient(135deg,var(--info),var(--violet))]',
  success: 'bg-[linear-gradient(135deg,var(--success),var(--teal))]',
  violet: 'bg-[linear-gradient(135deg,var(--violet),var(--info))]',
  danger: 'bg-[linear-gradient(135deg,var(--danger),var(--brand))]',
  muted: 'bg-glass-strong',
}

export function DashboardView({ onViewChange }: { onViewChange?: (v: string) => void }) {
  const totalCalls = callOutcomes.reduce((s, c) => s + c.value, 0)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)

  const quickActions = [
    { label: 'New Assistant', view: 'ai', desc: 'Create an AI assistant' },
    { label: 'Upload Document', view: 'knowledge', desc: 'Add to knowledge base' },
    { label: 'New Call', view: 'voice', desc: 'Start a voice call' },
    { label: 'Configure WhatsApp', view: 'whatsapp', desc: 'Set up WhatsApp AI' },
    { label: 'View Audit Log', view: 'audit', desc: 'See recent actions' },
    { label: 'Add Admin', view: 'users', desc: 'Invite a team member' },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back, Admin — here's your platform at a glance."
        actions={
          <>
            <button
              onClick={() => toast.info('Date range', { description: 'Opened date-range picker (last 7 days).' })}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-glass px-3 py-2 text-[13px] font-medium text-subtle transition-colors hover:text-foreground"
            >
              <CalendarDays className="size-4" /> Last 7 days
            </button>
            <button
              onClick={() => toast.success('Export started', { description: 'Preparing dashboard CSV for download…' })}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-glass px-3 py-2 text-[13px] font-medium text-subtle transition-colors hover:text-foreground"
            >
              <Download className="size-4" /> Export
            </button>
            <div className="relative">
              <button
                onClick={() => setQuickMenuOpen((o) => !o)}
                className="bg-gradient-brand inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
              >
                <Sparkles className="size-4" /> Quick Actions
                <ChevronDown className={cn('size-3 transition-transform', quickMenuOpen && 'rotate-180')} />
              </button>
              {quickMenuOpen ? (
                <>
                  <button
                    aria-label="Close menu"
                    onClick={() => setQuickMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="glass absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-border shadow-lg">
                    {quickActions.map((a) => (
                      <button
                        key={a.label}
                        onClick={() => {
                          setQuickMenuOpen(false)
                          if (onViewChange) {
                            onViewChange(a.view)
                          } else {
                            toast.info(a.label, { description: a.desc })
                          }
                        }}
                        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-glass"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{a.label}</p>
                          <p className="truncate text-[11px] text-subtle">{a.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </>
        }
      />

      {/* KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => {
          const Icon = k.icon
          const up = k.trend === 'up'
          return (
            <GlassCard key={k.label} delay={i * 0.05} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-primary-foreground', toneGradient[k.tone])}>
                  <Icon className="size-5" />
                </div>
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', up ? 'border-success/25 bg-success/12 text-success' : 'border-danger/25 bg-danger/12 text-danger')}>
                  {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {k.change}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <p className="text-2xl font-bold tracking-tight num">{k.value}</p>
                {k.live && <span className="live-dot size-2 rounded-full bg-success text-success/40" />}
              </div>
              <p className="mt-0.5 text-[13px] text-subtle">{k.label}</p>
            </GlassCard>
          )
        })}
      </section>

      {/* Revenue + Call Outcomes */}
      <section className="grid gap-4 xl:grid-cols-3">
        <GlassCard delay={0.1} className="p-5 xl:col-span-2">
          <CardHead
            title="Revenue Overview"
            subtitle="Last 7 days"
            action={
              <div className="flex items-center gap-3 text-[11px] text-subtle">
                <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-brand" /> Revenue</span>
                <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-subtle" /> Target</span>
                <Pill tone="success">+18%</Pill>
              </div>
            }
          />
          <div className="mt-4">
            <RevenueAreaChart data={revenueData} />
          </div>
        </GlassCard>

        <GlassCard delay={0.15} className="p-5">
          <CardHead title="Call Outcomes" subtitle="Today" icon={<Phone className="size-4" />} />
          <div className="mt-2">
            <OutcomesDonut data={callOutcomes} total={totalCalls} />
          </div>
          <ul className="mt-3 space-y-2">
            {callOutcomes.map((o) => (
              <li key={o.name} className="flex items-center gap-2 text-[13px]">
                <span className={cn('size-2 rounded-full', toneDotColor[o.tone])} />
                <span className="min-w-0 flex-1 truncate text-subtle">{o.name}</span>
                <span className="num font-semibold">{o.value}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {/* AI Usage + Activity */}
      <section className="grid gap-4 xl:grid-cols-3">
        <GlassCard delay={0.2} className="p-5">
          <CardHead title="AI Usage" subtitle="By channel this week" icon={<Bot className="size-4" />} />
          <div className="mt-4">
            <ChannelUsageBars data={channelUsage} />
          </div>
        </GlassCard>

        <GlassCard delay={0.25} className="p-5 xl:col-span-2">
          <CardHead
            title="Recent Activity"
            subtitle="Across all channels"
            action={
              <button
                onClick={() => toast.info('Activity log', { description: 'Loading full activity stream…' })}
                className="text-xs font-medium text-brand hover:opacity-80"
              >View all</button>
            }
          />
          <ul className="mt-3 max-h-[340px] space-y-1 overflow-y-auto pr-1">
            {activities.map((a) => {
              const Icon = a.icon
              return (
                <li key={a.title} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-glass">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-full border', toneBg[a.tone])}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{a.title}</span>
                    <span className="block truncate text-xs text-subtle">{a.desc}</span>
                  </span>
                  <span className="num shrink-0 text-[11px] text-muted-foreground">{a.time}</span>
                </li>
              )
            })}
          </ul>
        </GlassCard>
      </section>

      {/* System Health + AI Performance */}
      <section className="grid gap-4 lg:grid-cols-2">
        <GlassCard delay={0.3} className="p-5">
          <CardHead
            title="System Health"
            subtitle="Real-time status"
            action={<Pill tone="success" dot pulse>Operational</Pill>}
          />
          <ul className="mt-4 divide-y divide-border">
            {services.map((s) => (
              <li key={s.name} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className={cn('size-2 shrink-0 rounded-full', s.status === 'healthy' ? 'bg-success' : 'bg-warning')} />
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="num w-16 text-right text-xs text-subtle">{s.latency}</span>
                <span className="num w-16 text-right text-xs text-muted-foreground hidden sm:inline">{s.uptime}</span>
                <Pill tone={s.status === 'healthy' ? 'success' : 'warning'}>
                  {s.status === 'healthy' ? 'Healthy' : 'Degraded'}
                </Pill>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard delay={0.35} premium className="bg-brand/[0.06] p-5">
          <CardHead title="AI Performance" subtitle="Last 24 hours" icon={<Brain className="size-4" />} />
          <div className="mt-5 grid grid-cols-3 gap-4">
            {[
              { value: '92%', label: 'Accuracy', tone: 'brand' as const, meter: 92 },
              { value: '1.2s', label: 'Avg Response', tone: 'success' as const, meter: 78 },
              { value: '4.5', label: 'CSAT', tone: 'info' as const, meter: 90 },
            ].map((m) => (
              <div key={m.label}>
                <p className={cn('num text-xl font-bold', toneText[m.tone])}>{m.value}</p>
                <p className="mt-0.5 truncate text-[11px] text-subtle">{m.label}</p>
                <Meter value={m.meter} tone={m.tone} className="mt-2" />
              </div>
            ))}
          </div>
          <ul className="mt-5 space-y-2 text-[13px]">
            {[
              ['Total Conversations', '1,200'],
              ['Tools Executed', '3,240'],
              ['Human Transfers', '67 (5.6%)'],
              ['Hallucination Rate', '2.1%'],
            ].map(([label, value]) => (
              <li key={label} className="flex items-center justify-between border-b border-border/70 pb-2">
                <span className="text-subtle">{label}</span>
                <span className="num font-semibold">{value}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => toast.success('AI Assistant', { description: 'Opening Dayjoy AI console in a new pane…' })}
            className="bg-gradient-brand mt-5 w-full rounded-xl py-2.5 text-[13px] font-semibold text-primary-foreground transition-transform hover:scale-[1.01]"
          >
            Open AI Assistant
          </button>
        </GlassCard>
      </section>
    </>
  )
}
