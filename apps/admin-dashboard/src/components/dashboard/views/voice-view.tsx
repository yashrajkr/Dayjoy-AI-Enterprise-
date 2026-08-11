'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneForwarded, Plus, Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

const calls = [
  { id: 'call_001', customer: 'Rahul Sharma', phone: '+91 98765 43210', direction: 'inbound', duration: '4:32', status: 'completed', outcome: 'Product Inquiry', intent: 'product_inquiry' },
  { id: 'call_002', customer: 'Priya Patel', phone: '+91 98765 12345', direction: 'outbound', duration: '2:15', status: 'completed', outcome: 'Lead Captured', intent: 'lead_collection' },
  { id: 'call_003', customer: 'Unknown', phone: '+91 98765 67890', direction: 'inbound', duration: '0:45', status: 'abandoned', outcome: 'Abandoned', intent: 'unknown' },
  { id: 'call_004', customer: 'Amit Kumar', phone: '+91 98765 54321', direction: 'inbound', duration: '6:12', status: 'transferred', outcome: 'Human Transfer', intent: 'human_escalation' },
  { id: 'call_005', customer: 'Sneha Gupta', phone: '+91 98765 98765', direction: 'outbound', duration: '3:48', status: 'completed', outcome: 'Appointment Booked', intent: 'appointment_booking' },
]

const activeCalls = [
  { customer: 'Vikram Singh', phone: '+91 98765 11111', duration: '1:23', agent: 'Sarah' },
]

export function VoiceView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Voice AI</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor voice calls, transcripts, and AI performance</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600"><Plus className="mr-2 h-4 w-4" /> Initiate Call</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Calls" value="1" icon={Phone} color="green" pulse />
        <StatCard label="Calls Today" value="42" icon={PhoneIncoming} color="blue" />
        <StatCard label="Avg Duration" value="3:24" icon={PhoneOutgoing} color="purple" />
        <StatCard label="Transfer Rate" value="8%" icon={PhoneForwarded} color="orange" />
      </div>

      {activeCalls.length > 0 && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <span className="flex h-3 w-3"><span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" /></span>
              Active Call
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeCalls.map((call) => (
              <div key={call.customer} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white"><Phone className="h-5 w-5" /></div>
                  <div>
                    <p className="font-medium">{call.customer}</p>
                    <p className="text-xs text-muted-foreground">{call.phone} • Agent: {call.agent}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">{call.duration}</span>
                  <Button variant="destructive" size="sm"><Pause className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Recent Calls</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{call.customer}</p>
                      <p className="text-xs text-muted-foreground">{call.phone}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {call.direction === 'inbound' ? <PhoneIncoming className="h-4 w-4 text-green-500" /> : <PhoneOutgoing className="h-4 w-4 text-blue-500" />}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{call.duration}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{call.outcome}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-xs', call.status === 'completed' && 'bg-green-100 text-green-700', call.status === 'transferred' && 'bg-orange-100 text-orange-700', call.status === 'abandoned' && 'bg-red-100 text-red-700')}>
                      {call.status}
                    </Badge>
                  </TableCell>
                  <TableCell><Button variant="ghost" size="sm"><Play className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color, pulse }: { label: string; value: string; icon: typeof Phone; color: string; pulse?: boolean }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-100 dark:bg-blue-950/30',
    green: 'text-green-500 bg-green-100 dark:bg-green-950/30',
    purple: 'text-purple-500 bg-purple-100 dark:bg-purple-950/30',
    orange: 'text-orange-500 bg-orange-100 dark:bg-orange-950/30',
  }
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colors[color], pulse && 'animate-pulse')}>
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
