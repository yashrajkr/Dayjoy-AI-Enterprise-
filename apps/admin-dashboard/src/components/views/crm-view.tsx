import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, Meter, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { KpiCard } from "@/components/kit/kpi-card";
import { crmCustomers, distributors, leads, type Kpi } from "@/data/mock";


const kpis: Kpi[] = [
  { label: "Total Customers", value: 8452, trend: "up", change: "+3.2%", icon: "users", tone: "brand", spark: [7100, 7400, 7700, 7900, 8100, 8300, 8452] },
  { label: "Active Distributors", value: 342, trend: "up", change: "+12", icon: "users", tone: "info", spark: [290, 300, 308, 318, 326, 334, 342] },
  { label: "Open Leads", value: 128, trend: "up", change: "+9", icon: "chat", tone: "violet", spark: [92, 100, 104, 112, 118, 124, 128] },
  { label: "Conversion Rate", value: 24.5, suffix: "%", decimals: 1, trend: "up", change: "+1.8%", icon: "revenue", tone: "success", spark: [18, 19.4, 20.8, 21.6, 22.9, 23.8, 24.5] },
];

const statusTone = { Active: "success", Dormant: "muted", "Churn risk": "danger" } as const;
const tierTone = { Platinum: "violet", Gold: "gold", Silver: "muted" } as const;
const leadTone = { Hot: "danger", Warm: "brand", Cold: "info" } as const;

export function CRMView() {
  return (
    <>
      <PageHeader title="CRM" subtitle="Relationships, distributors and pipeline health." />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <GlassCard delay={0.15} tilt={false} className="p-5">
          <CardHead title="Recent Customers" subtitle="Latest activity" />
          <DataTable head={["Customer", "Type", "LTV", "Status"]}>
            {crmCustomers.map((c) => (
              <Row key={c.name}>
                <Cell>
                  <span className="flex items-center gap-2.5">
                    <span className="bg-gradient-brand grid size-8 shrink-0 place-items-center rounded-full p-[2px]">
                      <span className="grid size-full place-items-center rounded-full bg-background text-[10px] font-bold">
                        {c.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                    </span>
                    <span className="font-medium">{c.name}</span>
                  </span>
                </Cell>
                <Cell className="text-subtle">{c.type}</Cell>
                <Cell className="num font-semibold">{c.ltv}</Cell>
                <Cell>
                  <Pill tone={statusTone[c.status]}>{c.status}</Pill>
                </Cell>
              </Row>
            ))}
          </DataTable>
        </GlassCard>

        <GlassCard delay={0.2} tilt={false} className="p-5">
          <CardHead title="Top Distributors" subtitle="By sales this quarter" />
          <DataTable head={["Name", "Code", "Team", "Tier", "Sales"]}>
            {distributors.map((d) => (
              <Row key={d.code}>
                <Cell className="min-w-0 truncate font-medium">{d.name}</Cell>
                <Cell className="num shrink-0 font-mono text-xs text-subtle">{d.code}</Cell>
                <Cell className="num shrink-0">{d.team}</Cell>
                <Cell>
                  <Pill tone={tierTone[d.tier]}>{d.tier}</Pill>
                </Cell>
                <Cell className="num shrink-0 whitespace-nowrap font-semibold">{d.sales}</Cell>
              </Row>
            ))}
          </DataTable>
        </GlassCard>
      </section>

      <GlassCard delay={0.25} tilt={false} className="p-5">
        <CardHead title="Lead Pipeline" subtitle="AI-scored and assigned" />
        <DataTable head={["Lead", "Source", "Score", "Status", "Assigned to"]}>
          {leads.map((l) => (
            <Row key={l.name}>
              <Cell className="font-medium">{l.name}</Cell>
              <Cell>
                <Pill tone="info">{l.source}</Pill>
              </Cell>
              <Cell>
                <span className="flex w-32 items-center gap-2">
                  <Meter value={l.score} tone={l.score >= 80 ? "success" : l.score >= 60 ? "brand" : "info"} />
                  <span className="num text-xs font-semibold">{l.score}</span>
                </span>
              </Cell>
              <Cell>
                <Pill tone={leadTone[l.status]}>{l.status}</Pill>
              </Cell>
              <Cell className="text-subtle">{l.owner}</Cell>
            </Row>
          ))}
        </DataTable>
      </GlassCard>
    </>
  );
}
