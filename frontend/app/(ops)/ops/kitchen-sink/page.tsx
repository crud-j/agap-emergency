'use client';

import { useState } from 'react';
import { Activity, AlertCircle, Megaphone, Zap } from 'lucide-react';
import {
  Button, Badge, PriorityBadge, StatusChip,
  Card, CardHeader, CardTitle, CardDescription,
  StatCard, DataTable, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
  Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerBody, DrawerTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Skeleton, SkeletonCard, EmptyState,
} from '@/components/ui';
import type { Column } from '@/components/ui';

// ─── Demo data ──────────────────────────────────────────────────────────────────

interface DemoRow {
  id: string;
  ref: string;
  category: string;
  priority: string;
  status: string;
  age: string;
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', ref: 'INC-2026-000001', category: 'MEDICAL',       priority: 'CRITICAL', status: 'EN_ROUTE',         age: '3m ago' },
  { id: '2', ref: 'INC-2026-000002', category: 'FIRE',          priority: 'HIGH',     status: 'DISPATCHED',       age: '8m ago' },
  { id: '3', ref: 'INC-2026-000003', category: 'FLOOD',         priority: 'MEDIUM',   status: 'ACKNOWLEDGED',     age: '15m ago' },
  { id: '4', ref: 'INC-2026-000004', category: 'ROAD_ACCIDENT', priority: 'LOW',      status: 'SUBMITTED',        age: '1h ago' },
  { id: '5', ref: 'INC-2026-000005', category: 'RESCUE',        priority: 'HIGH',     status: 'ON_SCENE',         age: '22m ago' },
];

const COLUMNS: Column<DemoRow>[] = [
  { key: 'ref',      header: 'Reference',  accessor: 'ref',      sortable: true },
  { key: 'category', header: 'Category',   accessor: (r) => <span className="capitalize text-xs">{r.category.replace(/_/g, ' ')}</span> },
  { key: 'priority', header: 'Priority',   accessor: (r) => <PriorityBadge priority={r.priority} /> },
  { key: 'status',   header: 'Status',     accessor: (r) => <StatusChip status={r.status} /> },
  { key: 'age',      header: 'Age',        accessor: 'age',      sortable: true },
];

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function KitchenSinkPage(): JSX.Element {
  const [selectedRow, setSelectedRow] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="space-y-10 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-agap-textMain">Design System — Kitchen Sink</h1>
        <p className="mt-1 text-sm text-agap-textSub">
          Pearl/green theme preview. All tokens from <code className="rounded bg-agap-surface px-1.5 py-0.5 text-xs text-agap-textMid">docs/AGAP_System_Design_UIUX.md §5.4</code>
        </p>
      </div>

      {/* Colors */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Color Tokens</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ['#F2F5F8', 'pearl'],
            ['#EDF1F4', 'surface'],
            ['#DCE3E9', 'track'],
            ['#0D6053', 'green'],
            ['#EEF7F4', 'greenSoft'],
            ['#1C2B3A', 'textMain'],
            ['#40536D', 'textMid'],
            ['#8795A3', 'textSub'],
            ['#D44858', 'danger'],
            ['#FDF0F1', 'dangerSoft'],
            ['#D97706', 'amber'],
            ['#FFFBEB', 'amberSoft'],
            ['#3B82F6', 'info'],
            ['#EFF6FF', 'infoSoft'],
          ].map(([hex, name]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <div className="h-10 w-10 rounded-xl border border-[rgba(168,181,193,0.20)] shadow-tile" style={{ background: hex }} />
              <span className="text-[10px] text-agap-textSub">{name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="lg">Large</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </section>

      {/* Badges */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">Default</Badge>
          <Badge variant="green">Green</Badge>
          <Badge variant="red">Red</Badge>
          <Badge variant="amber">Amber</Badge>
          <Badge variant="blue">Blue</Badge>
          <Badge variant="orange">Orange</Badge>
          <Badge variant="muted">Muted</Badge>
        </div>
      </section>

      {/* Priority badges */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Priority Badges</h2>
        <div className="flex flex-wrap gap-2">
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
            <PriorityBadge key={p} priority={p} />
          ))}
        </div>
      </section>

      {/* Status chips */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Status Chips</h2>
        <div className="flex flex-wrap gap-2">
          {[
            'SUBMITTED','RECEIVED','ACKNOWLEDGED','ASSESSED','DISPATCH_PENDING',
            'DISPATCHED','EN_ROUTE','ON_SCENE','TRANSPORTING','ASSISTING',
            'RESOLVED','CLOSED','CANCELLED','FALSE_ALERT','DUPLICATE',
          ].map((s) => <StatusChip key={s} status={s} />)}
        </div>
      </section>

      {/* Stat cards */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Stat Cards</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Active Incidents" value={12} trend={8}   trendLabel="vs yesterday" icon={<AlertCircle size={18} />} variant="critical" />
          <StatCard label="Units Available"  value={5}  trend={-2}  trendLabel="vs yesterday" icon={<Zap size={18} />}          variant="warning" />
          <StatCard label="Responders"       value={18} trend={0}   trendLabel="no change"    icon={<Activity size={18} />} />
          <StatCard label="Announcements"    value={3}                                          icon={<Megaphone size={18} />} />
        </div>
      </section>

      {/* Tabs */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Tabs</h2>
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Active</TabsTrigger>
            <TabsTrigger value="tab2">Resolved</TabsTrigger>
            <TabsTrigger value="tab3">Closed</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">
            <Card><p className="text-sm text-agap-textMid">Active incidents content</p></Card>
          </TabsContent>
          <TabsContent value="tab2">
            <Card><p className="text-sm text-agap-textMid">Resolved incidents content</p></Card>
          </TabsContent>
          <TabsContent value="tab3">
            <Card><p className="text-sm text-agap-textMid">Closed incidents content</p></Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* Data table */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Data Table</h2>
        <DataTable
          columns={COLUMNS}
          data={DEMO_ROWS}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setSelectedRow(r.id)}
          selectedKey={selectedRow}
        />
      </section>

      {/* Card variants */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Cards</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Incident Detail</CardTitle>
              <Badge variant="red">Critical</Badge>
            </CardHeader>
            <CardDescription>INC-2026-000001 · 3 min ago</CardDescription>
          </Card>
          <Card padding="lg">
            <CardTitle className="mb-2">Dispatch Queue</CardTitle>
            <CardDescription>5 incidents awaiting dispatch authorization.</CardDescription>
          </Card>
          <Card padding="sm">
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        </div>
      </section>

      {/* Skeleton */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Skeleton Loading</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SkeletonCard rows={4} />
          <SkeletonCard rows={2} />
          <SkeletonCard rows={3} />
        </div>
      </section>

      {/* Empty state */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Empty State</h2>
        <Card>
          <EmptyState
            title="No active incidents"
            description="All clear — no emergency incidents are currently active in Bocaue."
            action={<Button variant="secondary" size="sm">Refresh</Button>}
          />
        </Card>
      </section>

      {/* Select */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Select</h2>
        <Select>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Filter by priority…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* Dialog & Drawer */}
      <section>
        <h2 className="mb-4 text-base font-bold text-agap-textMain">Dialog & Drawer</h2>
        <div className="flex gap-3">
          {/* Dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Dispatch</DialogTitle>
                <DialogDescription>
                  Assign Unit 4 (Ambulance) to INC-2026-000001. This action will notify the responder and is audited.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>Confirm Dispatch</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Drawer */}
          <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <Button variant="outline">Open Drawer</Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>INC-2026-000001 — Detail</DrawerTitle>
              </DrawerHeader>
              <DrawerBody>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1">Status</p>
                    <StatusChip status="EN_ROUTE" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1">Priority</p>
                    <PriorityBadge priority="CRITICAL" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1">Location</p>
                    <p className="text-sm text-agap-textMain">MacArthur Highway, Bocaue, Bulacan</p>
                    <p className="text-xs text-agap-textSub">14.7969, 120.9268</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1">Reporter</p>
                    <p className="text-sm text-agap-textMain">Juan dela Cruz</p>
                    <p className="text-xs text-agap-textSub">Citizen · +639XX XXX XXXX</p>
                  </div>
                </div>
              </DrawerBody>
            </DrawerContent>
          </Drawer>
        </div>
      </section>
    </div>
  );
}
