// Dev-only harness for the redesign's UI kit. Not linked from anywhere and
// not part of any user-facing flow — mounted at /dev/primitives so each
// primitive can be seen and driven in a real browser rather than only proven
// to compile. Delete before the redesign merges.

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, LayoutGrid, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 border-b border-[var(--line)] pb-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

export default function Primitives() {
  const [inherit, setInherit] = useState("inherit");
  const [tab, setTab] = useState("companies");
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-1 font-display text-3xl font-bold text-[var(--ink)]">UI kit</h1>
      <p className="mb-10 text-sm text-[var(--muted)]">
        Every primitive the redesign adds, on the new tokens.
      </p>

      <Section title="Button">
        <Button>Generate earn code</Button>
        <Button variant="outline">Cancel</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Text action</Button>
        <Button variant="destructive">Delete</Button>
        <Button variant="brand">Tenant identity</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </Section>

      <Section title="Input">
        <div className="w-64 space-y-3">
          <Input placeholder="Bill amount" />
          <Input placeholder="Invalid" aria-invalid />
          <Input placeholder="Disabled" disabled />
        </div>
      </Section>

      <Section title="Badge">
        <Badge variant="live">2× live</Badge>
        <Badge variant="active">Active</Badge>
        <Badge variant="pending">Pending</Badge>
        <Badge variant="expired">Expired</Badge>
        <Badge variant="neutral">Neutral</Badge>
        <Badge variant="outline">Outline</Badge>
      </Section>

      <Section title="Progress">
        <div className="w-72 space-y-4">
          <div>
            <div className="mb-1.5 text-xs text-[var(--muted)]">Toward next reward — 70%</div>
            <Progress value={70} />
          </div>
          <div>
            <div className="mb-1.5 text-xs text-[var(--muted)]">Subscription — 35% left</div>
            <Progress value={35} tone="time" />
          </div>
          <div>
            <div className="mb-1.5 text-xs text-[var(--muted)]">Subscription — 8% left</div>
            <Progress value={8} tone="time" />
          </div>
        </div>
      </Section>

      <Section title="Segmented control — inherit vs override">
        <div>
          <SegmentedControl value={inherit} onValueChange={setInherit}>
            <SegmentedControlItem value="inherit">Inherit</SegmentedControlItem>
            <SegmentedControlItem value="override">Override</SegmentedControlItem>
          </SegmentedControl>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Selected: <span className="font-mono">{inherit}</span>
          </p>
        </div>
      </Section>

      <Section title="Tabs">
        <div className="w-full">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="companies">All companies</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
              <TabsTrigger value="outlets">Outlets</TabsTrigger>
            </TabsList>
            <TabsContent value="companies">
              <p className="text-sm text-[var(--muted)]">Companies panel.</p>
            </TabsContent>
            <TabsContent value="register">
              <p className="text-sm text-[var(--muted)]">Register panel.</p>
            </TabsContent>
            <TabsContent value="outlets">
              <p className="text-sm text-[var(--muted)]">Outlets panel.</p>
            </TabsContent>
          </Tabs>
        </div>
      </Section>

      <Section title="Select">
        <div className="w-64">
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cafe">Cafe</SelectItem>
              <SelectItem value="restaurant">Restaurant</SelectItem>
              <SelectItem value="bakery">Bakery</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Dropdown menu">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Row actions</DropdownMenuLabel>
            <DropdownMenuItem>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      <Section title="Table — hairline rules, tabular numerals">
        <div className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead numeric>Outlets</TableHead>
                <TableHead numeric>Points issued</TableHead>
                <TableHead>Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Coffesarowar Group</TableCell>
                <TableCell numeric>3</TableCell>
                <TableCell numeric>12,480.5</TableCell>
                <TableCell>
                  <Badge variant="active">Growth</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Himalayan Bites</TableCell>
                <TableCell numeric>2</TableCell>
                <TableCell numeric>8,120.0</TableCell>
                <TableCell>
                  <Badge variant="neutral">Starter</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Sweet Corner</TableCell>
                <TableCell numeric>1</TableCell>
                <TableCell numeric>911.25</TableCell>
                <TableCell>
                  <Badge variant="expired">Expired</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Command palette">
        <Button variant="outline" onClick={() => setPaletteOpen(true)}>
          Open palette <CommandShortcut>⌘K</CommandShortcut>
        </Button>
        <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
          <CommandInput placeholder="Jump to a company, outlet or screen…" />
          <CommandList>
            <CommandEmpty>Nothing matches that.</CommandEmpty>
            <CommandGroup heading="Companies">
              <CommandItem>
                <Building2 /> Coffesarowar Group
              </CommandItem>
              <CommandItem>
                <Building2 /> Himalayan Bites
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Screens">
              <CommandItem>
                <LayoutGrid /> Analytics
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </Section>

      <Section title="Numerals — the hero of every metric">
        <div className="flex items-end gap-8">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
              Balance
            </div>
            <div className="font-numeral text-5xl text-[var(--primary)]">128.5</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
              Points issued
            </div>
            <div className="font-numeral text-5xl text-[var(--ink)]">1,284</div>
          </div>
        </div>
      </Section>
    </div>
  );
}
