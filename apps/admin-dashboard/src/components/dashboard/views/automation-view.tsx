'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Workflow, Play, Pause, Clock, CheckCircle2, AlertCircle, Plus, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const workflows = [
  { name: 'Lead Capture & Assignment', category: 'CRM', trigger: 'lead.created', status: 'active', runs: 284, success: 98 },
  { name: 'Welcome Email', category: 'Email', trigger: 'customer.created', status: 'active', runs: 452, success: 100 },
  { name: 'Order Confirmation', category: 'Orders', trigger: 'order.created', status: 'active', runs: 1420, success: 99 },
  { name: 'Shipping Notification', category: 'Orders', trigger: 'order.shipped', status: 'active', runs: 1180, success: 99 },
  { name: 'Appointment Reminder', category: 'Calendar', trigger: 'schedule', status: 'active', runs: 320, success: 100 },
  { name: 'Ticket Auto-Close', category: 'Support', trigger: 'schedule', status: 'paused', runs: 85, success: 95 },
  { name: 'Memory Cleanup', category: 'AI', trigger: 'schedule', status: 'active', runs: 30, success: 100 },
  { name: 'Conversation Summarization', category: 'AI', trigger: 'conversation.ended', status: 'active', runs: 1240, success: 97 },
]

export function AutomationView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automation</h1>
          <p className="text-muted-foreground text-sm mt-1">n8n workflows and automation rules</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600"><Plus className="mr-2 h-4 w-4" /> New Workflow</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Workflows" value="38" icon={Workflow} color="green" />
        <StatCard label="Total Runs (30d)" value="5,011" icon={Zap} color="orange" />
        <StatCard label="Success Rate" value="98.5%" icon={CheckCircle2} color="blue" />
        <StatCard label="Failed Runs" value="12" icon={AlertCircle} color="red" />
      </div>

      <Card>
        <CardHeader><CardTitle>Workflows</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead>Success</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((wf) => (
                <TableRow key={wf.name}>
                  <TableCell className="font-medium">{wf.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{wf.category}</Badge></TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{wf.trigger}</code></TableCell>
                  <TableCell className="text-right">{wf.runs.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={cn('text-sm font-medium', wf.success >= 98 ? 'text-green-600' : 'text-orange-600')}>{wf.success}%</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={wf.status === 'active' ? 'default' : 'secondary'} className={cn('text-xs', wf.status === 'active' && 'bg-green-100 text-green-700', wf.status === 'paused' && 'bg-gray-200 text-gray-700')}>
                      {wf.status === 'active' ? <Play className="mr-1 h-3 w-3" /> : <Pause className="mr-1 h-3 w-3" />}
                      {wf.status}
                    </Badge>
                  </TableCell>
                  <TableCell><Button variant="ghost" size="sm"><Workflow className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Workflow; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-500 bg-green-100 dark:bg-green-950/30',
    orange: 'text-orange-500 bg-orange-100 dark:bg-orange-950/30',
    blue: 'text-blue-500 bg-blue-100 dark:bg-blue-950/30',
    red: 'text-red-500 bg-red-100 dark:bg-red-950/30',
  }
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colors[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}
