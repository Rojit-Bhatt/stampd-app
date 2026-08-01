import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";

interface SettingsTab {
  value: string;
  label: string;
  content: ReactNode;
}

interface SettingsTabsProps {
  tabs: SettingsTab[];
  defaultValue?: string;
}

/**
 * Generic tab shell for a settings page with more than one section. Takes
 * its tabs as data rather than hardcoding them, so a later settings surface
 * (PIN, sub-admin roles) can add a tab without touching this file.
 */
export function SettingsTabs({ tabs, defaultValue }: SettingsTabsProps) {
  return (
    <Tabs defaultValue={defaultValue ?? tabs[0]?.value}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
