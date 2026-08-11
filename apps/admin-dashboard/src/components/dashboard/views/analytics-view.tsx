'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart3, TrendingUp, Phone, MessageSquare, Bot, Package } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'

const monthlyData = [
  { month: 'Jan', revenue: 245000, orders: 180, calls: 320, messages: 450 },
  { month: 'Feb', revenue: 312000, orders: 220, calls: 380, messages: 520 },
  { month: 'Mar', revenue: 289000, orders: 195, calls: 340, messages: 480 },
  { month: 'Apr', revenue: 358000, orders: 260, calls: 420, messages: 610 },
  { month: 'May', revenue: 402000, orders: 295, calls: 480, messages: 720 },
  { month: 'Jun', revenue: 374000, orders: 270, calls: 450, messages: 680 },
]

const aiMetrics = [
  { metric: 'Response Accuracy', value: 92, target: 90, unit: '%' },
  { metric: 'Tool Selection', value: 88, target: 85, unit: '%' },
  { metric: 'RAG Precision', value: 86, target: 80, unit: '%' },
  { metric: 'Customer Satisfaction', value: 4.5, target: 4.0, unit: '/5' },
]

export function AnalyticsView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform performance and insights</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Revenue" value="₹19.8L" change="+18%" icon={TrendingUp} color="orange" />
        <MetricCard title="Total Orders" value="1,420" change="+12%" icon={Package} color="blue" />
        <MetricCard title="Total Calls" value="2,390" change="+8%" icon={Phone} color="green" />
        <MetricCard title="AI Accuracy" value="92%" change="+3%" icon={Bot} color="purple" />
      </div>

      <Tabs defaultValue="revenue">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 max-w-2xl">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="ai">AI Performance</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Revenue & Orders (6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(v) => `₹${v / 1000}k`} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Channel Usage (6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="calls" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Voice Calls" />
                  <Bar dataKey="messages" fill="#22c55e" radius={[4, 4, 0, 0]} name="WhatsApp" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {aiMetrics.map((m) => (
              <Card key={m.metric}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">{m.metric}</p>
                    <Badge variant={m.value >= m.target ? 'default' : 'secondary'} className={cn('text-xs', m.value >= m.target && 'bg-green-100 text-green-700')}>
                      {m.value >= m.target ? 'On Target' : 'Below Target'}
                    </Badge>
                  </div>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold">{m.value}{m.unit}</p>
                    <p className="text-sm text-muted-foreground mb-1">/ Target: {m.target}{m.unit}</p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min((m.value / m.target) * 50, 100)}%` }} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Tool Usage Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="calls" stroke="#3b82f6" strokeWidth={2} name="Voice" />
                  <Line type="monotone" dataKey="messages" stroke="#22c55e" strokeWidth={2} name="WhatsApp" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricCard({ title, value, change, icon: Icon, color }: { title: string; value: string; change: string; icon: typeof BarChart3; color: string }) {
  const colors: Record<string, string> = {
    orange: 'text-orange-500 bg-orange-100 dark:bg-orange-950/30',
    blue: 'text-blue-500 bg-blue-100 dark:bg-blue-950/30',
    green: 'text-green-500 bg-green-100 dark:bg-green-950/30',
    purple: 'text-purple-500 bg-purple-100 dark:bg-purple-950/30',
  }
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xs text-green-600 mt-1">{change} vs last period</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colors[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}
