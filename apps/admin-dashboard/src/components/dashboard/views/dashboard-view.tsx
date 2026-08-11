'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'
import {
  Users, DollarSign, Phone, MessageSquare, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Bot, Activity, CheckCircle2,
  Package, Zap, Brain, Clock, Star, MoreHorizontal, Calendar
} from 'lucide-react'
import { cn } from '@/lib/utils'

const revenueData = [
  { day: 'Mon', revenue: 42000, orders: 32, target: 45000 },
  { day: 'Tue', revenue: 38000, orders: 28, target: 45000 },
  { day: 'Wed', revenue: 55000, orders: 41, target: 45000 },
  { day: 'Thu', revenue: 48000, orders: 35, target: 45000 },
  { day: 'Fri', revenue: 62000, orders: 45, target: 45000 },
  { day: 'Sat', revenue: 71000, orders: 52, target: 45000 },
  { day: 'Sun', revenue: 58000, orders: 38, target: 45000 },
]

const sparklineData = [
  [20, 35, 28, 42, 38, 55, 48],
  [30, 25, 40, 35, 50, 45, 60],
  [10, 15, 12, 18, 22, 19, 25],
  [40, 35, 30, 45, 38, 42, 35],
]

const callData = [
  { name: 'Completed', value: 145, color: '#22c55e' },
  { name: 'Transferred', value: 23, color: '#f97316' },
  { name: 'Abandoned', value: 12, color: '#ef4444' },
  { name: 'Failed', value: 5, color: '#94a3b8' },
]

const aiUsageData = [
  { channel: 'Voice', queries: 320, color: '#3b82f6' },
  { channel: 'WhatsApp', queries: 450, color: '#22c55e' },
  { channel: 'Website', queries: 280, color: '#8b5cf6' },
  { channel: 'API', queries: 150, color: '#f97316' },
]

const recentActivity = [
  { type: 'call', title: 'Voice call from Rahul Sharma', desc: 'Product inquiry — Health Supplement', time: '2 min ago', icon: Phone, color: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' },
  { type: 'order', title: 'New order #ORD-2026-0042', desc: '₹3,450 — 3 items', time: '15 min ago', icon: Package, color: 'bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400' },
  { type: 'lead', title: 'New lead from WhatsApp AI', desc: 'Priya Patel — Interested in business', time: '32 min ago', icon: Users, color: 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' },
  { type: 'ticket', title: 'Support ticket #TKT-0156', desc: 'Refund request — Order #ORD-0038', time: '1 hr ago', icon: Activity, color: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' },
  { type: 'ai', title: 'AI conversation completed', desc: '12 messages — Customer support flow', time: '2 hrs ago', icon: Bot, color: 'bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400' },
]

const systemHealth = [
  { name: 'Backend API', status: 'healthy', latency: '45ms', uptime: '99.9%' },
  { name: 'Database', status: 'healthy', latency: '12ms', uptime: '99.9%' },
  { name: 'Redis', status: 'healthy', latency: '2ms', uptime: '100%' },
  { name: 'Voice AI', status: 'healthy', latency: '180ms', uptime: '99.5%' },
  { name: 'WhatsApp', status: 'degraded', latency: '520ms', uptime: '97.2%' },
  { name: 'OpenAI', status: 'healthy', latency: '850ms', uptime: '99.8%' },
]

const kpiCards = [
  { title: 'Total Revenue', value: '₹3,74,000', change: '+12.5%', trend: 'up' as const, icon: DollarSign, color: 'from-orange-500 to-amber-500', sparkline: sparklineData[0] },
  { title: 'Total Customers', value: '8,452', change: '+3.2%', trend: 'up' as const, icon: Users, color: 'from-blue-500 to-cyan-500', sparkline: sparklineData[1] },
  { title: 'Active Calls', value: '23', change: '+5', trend: 'up' as const, icon: Phone, color: 'from-green-500 to-emerald-500', sparkline: sparklineData[2] },
  { title: 'AI Conversations', value: '1,200', change: '-2.1%', trend: 'down' as const, icon: MessageSquare, color: 'from-purple-500 to-violet-500', sparkline: sparklineData[3] },
]

export function DashboardView() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Welcome back, Admin! Here's what's happening today.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 h-9">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Last 7 days</span>
            <ChevronDownSmall />
          </Button>
          <Button variant="outline" size="sm" className="h-9">Export</Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90 h-9 gap-2">
            <Zap className="h-4 w-4" />
            Quick Actions
          </Button>
        </div>
      </div>

      {/* KPI Cards with Sparklines */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <Card key={i} className="shadow-card hover:shadow-card-hover transition-shadow group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', kpi.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className={cn(
                    'flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full',
                    kpi.trend === 'up' ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950/40' : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950/40'
                  )}>
                    {kpi.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {kpi.change}
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight tabular-nums">{kpi.value}</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">{kpi.title}</p>
                {/* Sparkline */}
                <div className="mt-3 h-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={kpi.sparkline.map((v, idx) => ({ idx, value: v }))}>
                      <defs>
                        <linearGradient id={`spark-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={kpi.trend === 'up' ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={kpi.trend === 'up' ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={kpi.trend === 'up' ? '#22c55e' : '#ef4444'}
                        strokeWidth={1.5}
                        fill={`url(#spark-${i})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue Chart - takes 2 columns */}
        <Card className="lg:col-span-2 shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold">Revenue Overview</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Last 7 days performance</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Revenue</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-muted-foreground">Target</span>
                </div>
                <Badge variant="secondary" className="text-green-600 bg-green-100 dark:bg-green-950/40 dark:text-green-400 gap-1">
                  <TrendingUp className="h-3 w-3" /> +18%
                </Badge>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                  }}
                  formatter={(v: number) => [`₹${v.toLocaleString()}`, 'Revenue']}
                />
                <Area type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={1.5} fill="none" />
                <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Call Outcomes Pie */}
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold">Call Outcomes</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Today's distribution</p>
            </div>
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={callData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                    {callData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-2xl font-bold tabular-nums">185</p>
                <p className="text-xs text-muted-foreground">Total Calls</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {callData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-muted-foreground flex-1">{item.name}</span>
                  <span className="text-xs font-semibold tabular-nums">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Usage + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* AI Usage Bar Chart */}
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950/40">
                <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">AI Usage by Channel</h3>
                <p className="text-xs text-muted-foreground">Queries today</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={aiUsageData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="channel" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} width={65} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="queries" radius={[0, 6, 6, 0]} barSize={20}>
                  {aiUsageData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2 shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Recent Activity</h3>
                <p className="text-xs text-muted-foreground">Latest platform events</p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-8">View all</Button>
            </div>
            <ScrollArea className="h-[260px] pr-4">
              <div className="space-y-1">
                {recentActivity.map((activity, i) => {
                  const Icon = activity.icon
                  return (
                    <div key={i} className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', activity.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-sm font-medium leading-tight">{activity.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{activity.desc}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap pt-0.5">{activity.time}</span>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* System Health + AI Performance */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* System Health */}
        <Card className="shadow-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 dark:bg-green-950/40">
                  <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">System Health</h3>
                  <p className="text-xs text-muted-foreground">Real-time service status</p>
                </div>
              </div>
              <Badge variant="secondary" className="gap-1.5 bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                <span className="flex h-2 w-2"><span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" /></span>
                Operational
              </Badge>
            </div>
            <div className="space-y-1">
              {systemHealth.map((sys) => (
                <div key={sys.name} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'h-2 w-2 rounded-full',
                      sys.status === 'healthy' ? 'bg-green-500' : sys.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                    )} />
                    <span className="text-sm font-medium">{sys.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground tabular-nums">{sys.latency}</span>
                    <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">{sys.uptime}</span>
                    <Badge variant="ghost" className={cn(
                      'text-[10px] px-1.5 py-0',
                      sys.status === 'healthy' && 'text-green-600 bg-green-50 dark:bg-green-950/30',
                      sys.status === 'degraded' && 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30',
                      sys.status === 'down' && 'text-red-600 bg-red-50 dark:bg-red-950/30',
                    )}>
                      {sys.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Performance Summary */}
        <Card className="shadow-card bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/10 border-orange-200/50 dark:border-orange-900/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950/40">
                  <Brain className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">AI Performance</h3>
                  <p className="text-xs text-muted-foreground">Today's AI metrics</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 text-xs">Details</Button>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">92%</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Accuracy</p>
                <div className="mt-1.5 h-1 rounded-full bg-orange-100 dark:bg-orange-950/40 overflow-hidden">
                  <div className="h-full rounded-full bg-orange-500" style={{ width: '92%' }} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">1.2s</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Avg Response</p>
                <div className="mt-1.5 h-1 rounded-full bg-green-100 dark:bg-green-950/40 overflow-hidden">
                  <div className="h-full rounded-full bg-green-500" style={{ width: '85%' }} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">4.5</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">CSAT Score</p>
                <div className="mt-1.5 h-1 rounded-full bg-blue-100 dark:bg-blue-950/40 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: '90%' }} />
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-3 border-t border-orange-200/30 dark:border-orange-900/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total Conversations</span>
                <span className="font-semibold tabular-nums">1,200</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tools Executed</span>
                <span className="font-semibold tabular-nums">3,240</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Human Transfers</span>
                <span className="font-semibold tabular-nums">67 (5.6%)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Hallucination Rate</span>
                <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">2.1%</span>
              </div>
            </div>
            <Button className="w-full mt-4 bg-primary hover:bg-primary/90" size="sm">
              <Bot className="mr-2 h-4 w-4" /> Open AI Assistant
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ChevronDownSmall() {
  return (
    <svg className="h-3 w-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
