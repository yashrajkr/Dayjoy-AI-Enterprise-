'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Server, Database, Cpu, HardDrive, Activity, Shield, Key, Globe, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const services = [
  { name: 'Backend API', status: 'healthy', latency: '45ms', icon: Server },
  { name: 'PostgreSQL', status: 'healthy', latency: '12ms', icon: Database },
  { name: 'Redis', status: 'healthy', latency: '2ms', icon: Cpu },
  { name: 'Voice AI (Vapi)', status: 'healthy', latency: '180ms', icon: Activity },
  { name: 'WhatsApp API', status: 'degraded', latency: '520ms', icon: Globe },
  { name: 'OpenAI API', status: 'healthy', latency: '850ms', icon: Cpu },
]

const systemInfo = [
  { label: 'CPU Usage', value: '34%', max: '8 cores', icon: Cpu, color: 'bg-green-500', percent: 34 },
  { label: 'Memory Usage', value: '4.2 GB', max: '16 GB', icon: HardDrive, color: 'bg-blue-500', percent: 26 },
  { label: 'Disk Usage', value: '42 GB', max: '100 GB', icon: HardDrive, color: 'bg-orange-500', percent: 42 },
  { label: 'Network I/O', value: '125 Mbps', max: '1 Gbps', icon: Activity, color: 'bg-purple-500', percent: 13 },
]

const configItems = [
  { name: 'JWT Authentication', enabled: true },
  { name: 'Rate Limiting', enabled: true },
  { name: 'CORS Protection', enabled: true },
  { name: 'CSRF Protection', enabled: true },
  { name: 'XSS Sanitization', enabled: true },
  { name: 'Audit Logging', enabled: true },
  { name: 'PII Redaction', enabled: true },
  { name: 'Webhook HMAC Verification', enabled: true },
]

export function SystemView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitor health, manage security, and configure platform</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-green-500" /> Service Health</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {services.map((s) => {
              const Icon = s.icon
              return (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('h-2 w-2 rounded-full', s.status === 'healthy' ? 'bg-green-500' : s.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500')} />
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{s.latency}</span>
                    <Badge variant="secondary" className={cn('text-xs', s.status === 'healthy' && 'bg-green-100 text-green-700', s.status === 'degraded' && 'bg-yellow-100 text-yellow-700', s.status === 'down' && 'bg-red-100 text-red-700')}>{s.status}</Badge>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5 text-blue-500" /> System Resources</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {systemInfo.map((info) => {
              const Icon = info.icon
              return (
                <div key={info.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{info.label}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{info.value} / {info.max}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full rounded-full', info.color)} style={{ width: `${info.percent}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-orange-500" /> Security Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {configItems.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <span className="text-sm font-medium">{item.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{item.enabled ? 'Enabled' : 'Disabled'}</span>
                <Switch checked={item.enabled} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
          <CardContent className="p-4 flex items-center gap-3">
            <Key className="h-5 w-5 text-orange-500" />
            <div>
              <p className="text-sm font-medium">API Keys</p>
              <p className="text-xs text-muted-foreground">5 configured, 1 expired</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
          <CardContent className="p-4 flex items-center gap-3">
            <Database className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium">Database Backup</p>
              <p className="text-xs text-muted-foreground">Last: 2 hours ago</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium">Security Scan</p>
              <p className="text-xs text-muted-foreground">Passed — 0 issues</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
