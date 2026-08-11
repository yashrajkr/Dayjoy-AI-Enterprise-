# Dayjoy AI Dashboard — UI/UX Audit Report

Audit performed via `z-ai vision` (glm-5v-turbo) against all 17 screenshots in `/home/z/my-project/screenshots/`. Each screenshot was inspected for overlap, overflow, alignment, contrast, z-index, and broken-section defects.

A clear systemic theme emerges across views: **the top-right "Switched to …" toast notification** is mispositioned on nearly every page (overlapping the header/search bar, bleeding off the viewport, or floating awkwardly). The sidebar's **active-state highlight bleeds outside its rounded corners**, and sidebar **notification badges ("12", "NEW", "3") crowd the right edge** of the sidebar on multiple views. These three patterns account for the majority of findings and should be fixed once at the layout component level.

---

## Critical Issues (high severity, must fix)

- **01-dashboard** Recent Activity list — last item ("AI conversation completed") is vertically truncated/cut off by the container's bottom edge.
- **02-analytics** Top-right toast notification — overlaps the main header and search bar (z-index / positioning bug).
- **02-analytics** Revenue Trend chart Y-axis — currency labels ("₹380k", "₹285k", …) are truncated and bleed into the chart area.
- **03-ai** Priya agent card — "Model" value truncated as `gemini-3-…`.
- **03-ai** Top-right notification toast — bleeds outside the main container boundary.
- **04-knowledge** Top-right toast notification — overlaps and bleeds off the top edge of the viewport.
- **04-knowledge** "Upload Document" button — bleeds outside its container on the right side.
- **05-voice** Notification toast — overlaps the top-right corner of the main content area and header, obscuring UI behind it.
- **06-crm** Top Distributors table, SALES column — values such as `₹24,80,000` are cut off at the right edge.
- **07-automation** "New Workflow" button — bleeds outside its container and overlaps the top-right card border.
- **07-automation** Toast notification ("Switched to Automation") — poorly positioned, floating over the header/search area.
- **08-system** Toast notification — overlaps the top-right corner of the main content area (z-index / positioning issue).
- **08-system** Search bar — placeholder text "Search customers, orders, AI…" is vertically misaligned (shifted down) inside the input.
- **15-analytics-channels** Stat cards (Revenue / Orders / Calls / Accuracy) — chart lines bleed outside the bottom border of their containers.
- **17-analytics-tools** Tool Usage Trends chart — empty data area, no visible lines or bars; primary content is unrendered.

## Major Issues (medium severity, should fix)

- **01-dashboard** Revenue Overview chart — rightmost data point (Sunday) is clipped by the chart area's right boundary.
- **02-analytics** Revenue Trend chart X-axis — "Mar" label is truncated at the bottom-left edge of the container.
- **03-ai** Raj agent card "Model" field — value sits extremely close to the container edge (insufficient padding).
- **04-knowledge** Knowledge Base cards (bottom row) — sparkline charts touch the bottom border of the cards (missing bottom padding).
- **05-voice** Active Call Banner — "End Call" button is cramped against the right edge with insufficient padding/margin.
- **06-crm** Notification toast ("Switched to CRM") — rendered awkwardly at top-right, partially overlapping the header and disconnected from the standard UI flow.
- **08-system** Sidebar — "System Config" active-state background bleeds outside its container's rounded corners on the left edge.
- **09-mobile-dashboard** System Resources — progress bars (CPU, Memory, Disk, Network) lack consistent internal padding/alignment relative to their percentage labels.
- **11-ai-tools** Tool cards "Test" buttons — very low contrast against the dark card background, hard to read.
- **14-analytics-revenue** "Revenue Trend" area fill — bleeds past the bottom and right edges of the chart container.
- **15-analytics-channels** Sidebar — Voice AI notification badge "12" overlaps the right edge of the sidebar container.
- **17-analytics-tools** Sidebar "Analytics" active-state — orange background bleeds awkwardly into the sidebar's rounded corners.

## Minor Issues (low severity, nice to fix)

- **01-dashboard** Top-right notification toast ("Switched to System Config") — overlaps the top navigation bar, may obscure interactive elements.
- **01-dashboard** AI Usage section — progress bars for "Website" and "API" are significantly shorter than "Voice" and "WhatsApp", creating visual imbalance.
- **01-dashboard** Call Outcomes donut chart — "Failed" legend text is very close to the bottom edge of its container (insufficient bottom padding).
- **02-analytics** Search bar — `#K` shortcut hint is slightly misaligned vertically within the input.
- **02-analytics** Sidebar — inconsistent spacing/padding between the "AI PLATFORM" section header and the first menu item.
- **03-ai** Agent cards — inconsistent text alignment between "Model" labels and their values across cards.
- **04-knowledge** Sidebar — active-state highlight for "Knowledge Base" slightly overflows the text container on the left.
- **05-voice** Metric cards — large numbers and small sparklines are vertically too close, slightly cramped.
- **05-voice** Sidebar — "Voice AI" active indicator (orange bar) and badge "12" slightly overlap the text boundary.
- **06-crm** Lead Pipeline table, SCORE column — numerical scores (88, 72, …) slightly misaligned with their progress bars.
- **06-crm** CRM header subtext "Relationships, distributors and pipeline health." — very low contrast against the dark background.
- **07-automation** Top-right profile/notification icons — partially cut off by the top edge of the viewport.
- **07-automation** Sidebar "Automation" item — active-state background appears misaligned/overflowing the sidebar width vs. other items.
- **07-automation** Card sparklines — line charts at the bottom of each metric card are very close to the text labels (insufficient bottom padding).
- **08-system** Service Health list — inconsistent horizontal alignment between status labels ("Healthy"/"Degraded") and their latency/percentage values.
- **08-system** System Resources — progress-bar labels (CPU, Memory, …) lack consistent vertical padding; layout feels cramped.
- **09-mobile-dashboard** Search bar — "Search cus…" text truncated (insufficient width/padding).
- **09-mobile-dashboard** Bottom navigation bar — icons and labels ("AI", "Voice") are partially cut off at the bottom edge of the screen.
- **09-mobile-dashboard** Service Health list — "Live checks every 30s" subtext has very tight vertical spacing from the section title.
- **09-mobile-dashboard** Service Health items — latency values (e.g., "45ms") and uptime % (e.g., "99.9%") slightly misaligned across rows.
- **10-mobile-menu-open** Sidebar — "System Config" active-state background has slight visual bleed / uneven padding vs. other list items.
- **11-ai-tools** Sidebar — "Voice AI" (12) and "Website Chat" (NEW) badges slightly misaligned vertically with their menu items.
- **11-ai-tools** Sidebar — "AI Management" (3) badge tightly packed against the right edge of the sidebar container.
- **11-ai-tools** Tool cards — percentage badges (98%, 99%, …) lack consistent internal padding; text feels cramped within the pill.
- **11-ai-tools** Footer note "Changes deploy to all channels within 30 seconds." — minimal left margin relative to the grid above it.
- **12-ai-memory** Search bar — placeholder text truncated by the right-side shortcut indicator.
- **12-ai-memory** Sidebar — "NEW" badge (Website Chat) and count (Voice AI) slightly cramped against the sidebar's right edge.
- **12-ai-memory** Stats cards — labels ("Total Memories", …) have very tight vertical padding relative to the large numbers above; bottom of cards feels empty.
- **13-ai-prompts** Sidebar — "NEW" badge for "Website Chat" slightly overlaps the menu text (cramped).
- **13-ai-prompts** Top-bar search — `#K` shortcut indicator has very low contrast against the dark background.
- **13-ai-prompts** Progress bars — orange bars in all four cards appear cut off / abruptly end without a rounded right edge (overflow/styling issue).
- **14-analytics-revenue** Notification toast — clipped by the viewport edge, cutting off the top border and shadow.
- **14-analytics-revenue** Search bar — input lacks internal padding; placeholder text sits too close to the left edge.
- **14-analytics-revenue** Sidebar — active-state indicator for "Analytics" is misaligned with the text baseline.
- **14-analytics-revenue** KPI cards — bottom sparklines have insufficient bottom padding, cramped against card borders.
- **15-analytics-channels** Bar chart "Calls vs Messages" — top of the green "Messages" bar for August is clipped by the chart's upper boundary.
- **17-analytics-tools** Top search bar — `#K` shortcut hint has very low contrast against the dark input background.
- **17-analytics-tools** Metric cards — bottom sparklines/gradient fills bleed slightly outside the bottom border-radius of their cards.
- **17-analytics-tools** Chart X-axis — month labels ("Mar", "Apr", …) are extremely faint; poor readability against the dark chart background.

---

## Per-view breakdown

### 01-dashboard
- [high] Recent Activity list: last item ("AI conversation completed") is vertically truncated/cut off by the container's bottom edge.
- [med] Revenue Overview chart: rightmost data point (Sunday) is clipped by the chart area's right boundary; the line appears to end abruptly.
- [low] Top-right notification toast ("Switched to System Config"): overlaps the top navigation bar; may obscure interactive elements or the scrollbar.
- [low] AI Usage section: progress bars for "Website" and "API" are significantly shorter than "Voice" and "WhatsApp" bars — visually unbalanced.
- [low] Call Outcomes donut chart: "Failed" legend text sits very close to the bottom edge of its container (insufficient bottom padding).

### 02-analytics
- [high] Top-right toast notification: overlaps the main header and search bar (z-index / positioning issue).
- [high] Revenue Trend chart Y-axis: currency labels ("₹380k", "₹285k", …) truncated/bleeding into the chart area.
- [med] Revenue Trend chart X-axis: "Mar" label truncated at the bottom-left edge of the container.
- [low] Search bar: `#K` shortcut hint slightly misaligned vertically within the input field.
- [low] Sidebar: inconsistent spacing/padding between the "AI PLATFORM" section header and the first menu item.

### 03-ai
- [high] Priya agent card "Model" field: text overflow/truncation (`gemini-3-…`).
- [high] Top-right notification toast: element bleeding outside the main container boundary.
- [med] Raj agent card "Model" field: text extremely close to the container edge (insufficient padding).
- [low] Agent cards: inconsistent text alignment between "Model" labels and their values across cards.

### 04-knowledge
- [high] Top-right toast notification: overlapping and bleeding off the top edge of the viewport.
- [high] "Upload Document" button: bleeding outside its container on the right side.
- [med] Knowledge Base cards (bottom row): sparkline charts touch the bottom border of the cards (missing bottom padding).
- [low] Sidebar: active-state highlight for "Knowledge Base" slightly overflows the text container on the left.

### 05-voice
- [high] Notification toast: overlaps the top-right corner of the main content area and header, obscuring UI elements behind it.
- [med] Active Call Banner: "End Call" button tightly cramped against the right edge with insufficient padding/margin.
- [low] Metric cards (1, 42): large numerical text and small sparkline charts are vertically very close — slightly cramped feel.
- [low] Sidebar: "Voice AI" active-state indicator (orange bar) and notification badge "12" slightly overlap the text boundary.

### 06-crm
- [high] Top Distributors table, SALES column: text overflow/truncation; values such as `₹24,80,000` are cut off at the right edge.
- [med] Notification toast ("Switched to CRM"): z-index / positioning issue; rendered awkwardly at top-right, partially overlapping the header and disconnected from standard UI flow.
- [low] Lead Pipeline table, SCORE column: numerical scores (88, 72, …) slightly misaligned with their progress bars.
- [low] CRM header subtext "Relationships, distributors and pipeline health.": very low contrast against the dark background.

### 07-automation
- [high] "New Workflow" button: bleeding outside its container and overlapping the top-right card border.
- [high] Toast notification ("Switched to Automation"): poorly positioned, floating over the header/search area without proper alignment.
- [med] Top-right profile/notification icons: partially cut off by the top edge of the viewport.
- [low] Sidebar "Automation" item: active-state background appears misaligned/overflowing the sidebar width compared to other items.
- [low] Card sparklines: line charts at the bottom of each metric card are very close to the text labels (insufficient bottom padding).

### 08-system
- [high] Toast notification: overlaps the top-right corner of the main content area and header (z-index / positioning issue).
- [high] Search bar: placeholder text "Search customers, orders, AI…" is vertically misaligned (shifted down) within the input field.
- [med] Sidebar: "System Config" active-state background color bleeds outside its container's rounded corners on the left edge.
- [low] Service Health list: inconsistent horizontal alignment between status labels ("Healthy" / "Degraded") and their latency/percentage values.
- [low] System Resources: progress-bar labels (CPU, Memory, …) lack consistent vertical padding; layout feels cramped.

### 09-mobile-dashboard
- [med] System Resources section: progress bars for CPU, Memory, Disk, Network lack consistent internal padding/alignment relative to their percentage labels.
- [low] Search bar: "Search cus…" text truncated (insufficient width or padding).
- [low] Bottom navigation bar: icons and labels (e.g., "AI", "Voice") are partially cut off at the bottom edge of the screen.
- [low] Service Health list: "Live checks every 30s" subtext has very tight vertical spacing from the section title.
- [low] Service Health items: latency values ("45ms") and uptime % ("99.9%") slightly misaligned across rows.

### 10-mobile-menu-open
- [low] Sidebar: "System Config" active-state background has a slight visual bleed / uneven padding compared to other list items, making it look slightly misaligned with the container edges.

### 11-ai-tools
- [med] Tool cards "Test" buttons: very low contrast against the dark card background, difficult to read.
- [low] Sidebar: "Voice AI" (12) and "Website Chat" (NEW) badges slightly misaligned vertically with their menu items.
- [low] Sidebar: "AI Management" (3) badge tightly packed against the right edge of the sidebar container.
- [low] Tool cards: percentage badges (98%, 99%, …) lack consistent internal padding; text feels cramped within the pill.
- [low] Footer note "Changes deploy to all channels within 30 seconds.": minimal left margin relative to the grid above it.

### 12-ai-memory
- [low] Search bar: placeholder text "Search customers, orders, AI…" truncated by the right-side shortcut indicator.
- [low] Sidebar: "NEW" badge for "Website Chat" and the notification count for "Voice AI" are slightly cramped against the right edge of the sidebar container.
- [low] Stats cards: labels ("Total Memories", …) have very tight vertical padding relative to the large numbers above; bottom of the cards feels empty.

### 13-ai-prompts
- [low] Sidebar: "NEW" badge for "Website Chat" slightly overlaps the menu text, causing a cramped appearance.
- [low] Top-bar search: `#K` shortcut indicator has very low contrast against the dark background.
- [low] Progress bars: orange bars in all four cards appear cut off / abruptly end without a rounded right edge — potential overflow or styling issue.

### 14-analytics-revenue
- [med] Chart Area Fill: area fill under the "Revenue Trend" line chart bleeds past the bottom and right edges of the chart container.
- [low] Notification toast: clipped by the viewport edge, cutting off the top border and shadow.
- [low] Search bar: input lacks internal padding; placeholder text sits too close to the left edge.
- [low] Sidebar: active-state indicator for "Analytics" is misaligned with the text baseline.
- [low] KPI cards: bottom sparklines have insufficient bottom padding; cramped against card borders.

### 15-analytics-channels
- [high] Stat cards (Revenue / Orders / Calls / Accuracy): chart lines bleed outside the bottom border of their respective containers.
- [med] Sidebar (Voice AI): notification badge "12" overlaps the right edge of the sidebar container.
- [low] Bar chart "Calls vs Messages": top of the green "Messages" bar for August is clipped by the chart's upper boundary.

### 16-analytics-ai-perf
- OK — no significant issues detected by the auditor.

### 17-analytics-tools
- [high] Tool Usage Trends chart: empty data area with no visible lines or bars — primary content is unrendered/broken.
- [med] Sidebar "Analytics" item: active-state background (orange) bleeds awkwardly into the rounded corners of the sidebar container.
- [low] Top search bar: `#K` shortcut hint has very low contrast against the dark input background.
- [low] Metric cards: bottom sparklines/gradient fills appear to bleed slightly outside the bottom border-radius of their cards.
- [low] Chart X-axis labels: month labels ("Mar", "Apr", …) are extremely faint — poor readability against the dark chart background.

---

## Cross-cutting recommendations (fix once, affects many views)

1. **Toast/notification component** — Recurring defect on 01, 02, 03, 04, 05, 06, 07, 08, 14. The toast currently floats over the header/search area and is clipped by the viewport. Anchor it to a proper portal container with safe insets from the top and right edges, raise its z-index above the header, and ensure it doesn't overlap the global search input.
2. **Sidebar active-state styling** — Recurring on 04, 05, 07, 08, 10, 15, 17. The active item's background bleeds outside the rounded sidebar container. Constrain the highlight inside the sidebar's padding box (or apply matching `border-radius` + `overflow:hidden` on the parent).
3. **Sidebar notification badges** — Recurring on 05, 11, 12, 13, 15. Badges ("12", "NEW", "3") crowd the right edge of the sidebar and overlap menu text. Reserve fixed right-side gutter space for badges and align them on the menu-item baseline.
4. **Search bar** — Recurring on 02, 08, 12, 13, 14, 17. Placeholder text is vertically misaligned, truncated by the `#K` shortcut indicator, and `#K` itself has poor contrast. Vertically center placeholder text, add right-padding to leave room for the shortcut, and raise the shortcut's contrast (e.g., `text-zinc-400` instead of `text-zinc-600`).
5. **Chart axis labels & area fills** — Recurring on 01, 02, 14, 15, 17. Y-axis labels truncated, X-axis labels truncated/clipped, area fills bleeding past container bounds. Add left/bottom chart padding and clip the SVG/canvas to its container.
6. **Card sparkline padding** — Recurring on 01, 04, 07, 11, 14, 17. Sparklines sit too close to the card's bottom border. Add consistent bottom padding (e.g., `pb-3`) inside metric cards.
7. **Table column widths (06-crm, lead pipeline)** — Currency values in the SALES column overflow. Use `min-w-0` + `truncate` on table cells or widen the column.
8. **17-analytics-tools empty chart** — Likely a data-fetch or render guard issue; the "Tool Usage Trends" chart shows no data. Verify the data hook returns values and that the chart series is mounted before paint.
