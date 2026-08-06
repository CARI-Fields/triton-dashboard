import { Icon as BlueprintIcon } from "@blueprintjs/core";
import type { IconName as BlueprintIconName } from "@blueprintjs/icons";

export type IconName =
  | "board"
  | "experiment"
  | "compare"
  | "template"
  | "activity"
  | "analytics"
  | "key"
  | "sun"
  | "moon"
  | "logout"
  | "users"
  | "plus"
  | "filter"
  | "more"
  | "menu"
  | "close"
  | "search"
  | "chevron-left"
  | "chevron-right";

const BLUEPRINT_ICON: Record<IconName, BlueprintIconName> = {
  board: "grid-view",
  experiment: "lab-test",
  compare: "comparison",
  template: "grid",
  activity: "history",
  analytics: "timeline-bar-chart",
  key: "key",
  sun: "lightbulb",
  moon: "moon",
  logout: "log-out",
  users: "people",
  plus: "plus",
  filter: "filter",
  more: "more",
  menu: "menu",
  close: "cross",
  search: "search",
  "chevron-left": "chevron-left",
  "chevron-right": "chevron-right",
};

export function Icon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  return <BlueprintIcon icon={BLUEPRINT_ICON[name]} size={size} />;
}
