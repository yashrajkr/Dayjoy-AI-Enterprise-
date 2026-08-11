'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { BookOpen, FileText, Search, Upload, Database, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const documents = [
  { title: 'Product Catalog 2026', category: 'Products', chunks: 145, status: 'Ready', words: 12500 },
  { title: 'Return Policy', category: 'Policies', chunks: 12, status: 'Ready', words: 850 },
  { title: 'Distributor Compensation Plan', category: 'Compensation', chunks: 38, status: 'Ready', words: 4200 },
  { title: 'FAQ — Common Questions', category: 'FAQs', chunks: 56, status: 'Ready', words: 3200 },
  { title: 'Customer Onboarding Guide', category: 'Training', chunks: 24, status: 'Processing', words: 2800 },
  { title: 'GST & Tax Information', category: 'Compliance', chunks: 8, status: 'Ready', words: 620 },
]

const categories = [
  { name: 'Products', count: 45, color: 'bg-blue-500' },
  { name: 'Policies', count: 12, color: 'bg-green-500' },
  { name: 'FAQs', count: 56, color: 'bg-orange-500' },
  { name: 'Compensation', count: 8, color: 'bg-purple-500' },
  { name: 'Training', count: 24, color: 'bg-pink-500' },
  { name: 'Compliance', count: 15, color: 'bg-red-500' },
]

export function KnowledgeView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage RAG documents, embeddings, and search</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600"><Upload className="mr-2 h-4 w-4" /> Upload Document</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Documents" value="160" icon={FileText} color="blue" />
        <StatCard label="Total Chunks" value="2,840" icon={Database} color="purple" />
        <StatCard label="Total Queries" value="8,452" icon={Search} color="orange" />
        <StatCard label="Avg Latency" value="1.2s" icon={Clock} color="green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.title}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{doc.category}</Badge></TableCell>
                    <TableCell className="text-right">{doc.chunks}</TableCell>
                    <TableCell>
                      <Badge variant={doc.status === 'Ready' ? 'default' : 'secondary'} className={cn('text-xs', doc.status === 'Ready' && 'bg-green-100 text-green-700')}>
                        {doc.status === 'Ready' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {doc.status === 'Processing' && <Clock className="mr-1 h-3 w-3" />}
                        {doc.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3">
                <div className={cn('h-3 w-3 rounded-full', cat.color)} />
                <span className="text-sm font-medium flex-1">{cat.name}</span>
                <Badge variant="secondary">{cat.count}</Badge>
              </div>
            ))}
            <div className="pt-3 border-t">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Storage Used</span>
                <span>2.4 GB / 10 GB</span>
              </div>
              <Progress value={24} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Search Knowledge Base</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-10 py-2 text-sm"
                placeholder="Ask a question or search documents..."
              />
            </div>
            <Button className="bg-orange-500 hover:bg-orange-600">Search</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof FileText; color: string }) {
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
