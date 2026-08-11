'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Users, UserCheck, Network, Target, Plus, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const customers = [
  { name: 'Rahul Sharma', email: 'rahul@email.com', phone: '+91 98765 43210', type: 'Individual', ltv: '₹45,200', orders: 12, status: 'Active' },
  { name: 'Priya Patel', email: 'priya@email.com', phone: '+91 98765 12345', type: 'Business', ltv: '₹1,25,000', orders: 38, status: 'Active' },
  { name: 'Amit Kumar', email: 'amit@email.com', phone: '+91 98765 67890', type: 'Individual', ltv: '₹12,500', orders: 3, status: 'Active' },
  { name: 'Sneha Gupta', email: 'sneha@email.com', phone: '+91 98765 54321', type: 'Business', ltv: '₹78,400', orders: 22, status: 'Inactive' },
]

const distributors = [
  { code: 'DJ001', name: 'Vikram Singh', tier: 'Gold', team: 45, sales: '₹4,52,000', commission: '₹36,160', status: 'Active' },
  { code: 'DJ002', name: 'Anita Desai', tier: 'Platinum', team: 128, sales: '₹12,85,000', commission: '₹1,54,200', status: 'Active' },
  { code: 'DJ003', name: 'Rajesh Kumar', tier: 'Silver', team: 18, sales: '₹1,85,000', commission: '₹9,250', status: 'Active' },
]

const leads = [
  { name: 'Kavya Reddy', source: 'Voice AI', score: 85, status: 'Hot', assigned: 'Vikram Singh' },
  { name: 'Mohit Agarwal', source: 'WhatsApp', score: 72, status: 'Warm', assigned: 'Anita Desai' },
  { name: 'Deepika Nair', source: 'Website', score: 91, status: 'Hot', assigned: 'Vikram Singh' },
  { name: 'Arjun Mehta', source: 'Voice AI', score: 45, status: 'Cold', assigned: 'Rajesh Kumar' },
]

export function CRMView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage customers, distributors, and leads</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600"><Plus className="mr-2 h-4 w-4" /> Add Customer</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Customers" value="8,452" icon={Users} color="blue" />
        <StatCard label="Active Distributors" value="342" icon={Network} color="purple" />
        <StatCard label="Open Leads" value="128" icon={Target} color="orange" />
        <StatCard label="Conversion Rate" value="24.5%" icon={UserCheck} color="green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Recent Customers</span>
              <Button variant="ghost" size="sm">View All</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>LTV</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.email}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{c.name.split(' ').map(n => n[0]).join('')}</AvatarFallback></Avatar>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.type}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{c.ltv}</TableCell>
                    <TableCell><Badge variant={c.status === 'Active' ? 'default' : 'secondary'} className={cn('text-xs', c.status === 'Active' && 'bg-green-100 text-green-700')}>{c.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Top Distributors</span>
              <Button variant="ghost" size="sm">View All</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distributor</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributors.map((d) => (
                  <TableRow key={d.code}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.code} • {d.team} team</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn('text-xs', d.tier === 'Platinum' && 'bg-purple-100 text-purple-700', d.tier === 'Gold' && 'bg-amber-100 text-amber-700', d.tier === 'Silver' && 'bg-gray-200 text-gray-700')}>{d.tier}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{d.sales}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Lead Pipeline</span>
            <Button variant="ghost" size="sm">View All</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.name}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{l.source}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{l.score}</span>
                      <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                        <div className={cn('h-full rounded-full', l.score > 80 ? 'bg-red-500' : l.score > 60 ? 'bg-orange-500' : 'bg-blue-500')} style={{ width: `${l.score}%` }} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-xs', l.status === 'Hot' && 'bg-red-100 text-red-700', l.status === 'Warm' && 'bg-orange-100 text-orange-700', l.status === 'Cold' && 'bg-blue-100 text-blue-700')}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.assigned}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Users; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-100 dark:bg-blue-950/30',
    green: 'text-green-500 bg-green-100 dark:bg-green-950/30',
    purple: 'text-purple-500 bg-purple-100 dark:bg-purple-950/30',
    orange: 'text-orange-500 bg-orange-100 dark:bg-orange-950/30',
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
