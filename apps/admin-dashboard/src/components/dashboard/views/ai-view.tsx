'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Bot, Brain, Wrench, MessageSquare, Phone, Plus, Settings2, Zap, Activity, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const agents = [
  { name: 'Sarah — Voice Assistant', type: 'Voice AI', status: 'active', conversations: 145, accuracy: 92, model: 'GPT-4o', color: 'bg-blue-500' },
  { name: 'Priya — WhatsApp Bot', type: 'WhatsApp AI', status: 'active', conversations: 320, accuracy: 88, model: 'GPT-4o', color: 'bg-green-500' },
  { name: 'Raj — Website Chat', type: 'Website AI', status: 'active', conversations: 210, accuracy: 95, model: 'GPT-4o', color: 'bg-purple-500' },
]

const tools = [
  { name: 'search_knowledge', desc: 'Search RAG knowledge base', calls: 1240, success: 98 },
  { name: 'search_products', desc: 'Search product catalog', calls: 856, success: 99 },
  { name: 'customer_lookup', desc: 'Find customer by phone/email', calls: 432, success: 97 },
  { name: 'distributor_lookup', desc: 'Find distributor by code', calls: 123, success: 100 },
  { name: 'create_lead', desc: 'Capture new lead', calls: 289, success: 96 },
  { name: 'book_appointment', desc: 'Schedule appointment', calls: 145, success: 94 },
  { name: 'create_support_ticket', desc: 'Create support ticket', calls: 98, success: 99 },
  { name: 'human_transfer', desc: 'Escalate to human agent', calls: 67, success: 100 },
]

export function AIView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage AI agents, tools, memory, and prompts</p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600"><Plus className="mr-2 h-4 w-4" /> New Agent</Button>
      </div>

      <Tabs defaultValue="agents">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 max-w-2xl">
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            {agents.map((agent) => (
              <Card key={agent.name}>
                <CardHeader className="flex flex-row items-center gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg text-white', agent.color)}>
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm">{agent.name}</CardTitle>
                    <Badge variant="secondary" className="mt-1 text-xs">{agent.type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{agent.conversations}</p>
                      <p className="text-xs text-muted-foreground">Conversations</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-600">{agent.accuracy}%</p>
                      <p className="text-xs text-muted-foreground">Accuracy</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium">{agent.model}</p>
                      <p className="text-xs text-muted-foreground">Model</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="flex-1"><Settings2 className="mr-1 h-3 w-3" /> Configure</Button>
                    <Button variant="outline" size="sm" className="flex-1"><MessageSquare className="mr-1 h-3 w-3" /> Test</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {tools.map((tool) => (
              <Card key={tool.name}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-orange-500" />
                      <span className="font-mono text-sm font-medium">{tool.name}</span>
                    </div>
                    <Badge variant={tool.success > 95 ? 'default' : 'secondary'} className="text-xs">{tool.success}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{tool.desc}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{tool.calls} calls</span>
                    <Button variant="ghost" size="sm" className="text-xs">Test →</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="memory" className="mt-4">
          <Card>
            <CardHeader><CardTitle>AI Memory Stats</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <StatCard label="Total Memories" value="12,450" icon={Brain} color="purple" />
                <StatCard label="Preferences" value="3,200" icon={Brain} color="blue" />
                <StatCard label="Facts" value="5,800" icon={Brain} color="green" />
                <StatCard label="Summaries" value="3,450" icon={Brain} color="orange" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {['Master System Prompt', 'Dayjoy Knowledge Prompt', 'RAG Integration Prompt', 'Escalation Protocols'].map((p) => (
              <Card key={p}>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-orange-500" /> {p}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">System prompt defining AI behavior and rules</p>
                  <Button variant="outline" size="sm" className="w-full">Edit Prompt</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Brain; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-100 dark:bg-blue-950/30',
    green: 'text-green-500 bg-green-100 dark:bg-green-950/30',
    purple: 'text-purple-500 bg-purple-100 dark:bg-purple-950/30',
    orange: 'text-orange-500 bg-orange-100 dark:bg-orange-950/30',
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colors[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
