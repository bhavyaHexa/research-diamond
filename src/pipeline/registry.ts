// All control groups in one list, and lookup by control id.
import { effectGroups } from "./effects";
import { lightingGroups } from "./lighting";
import { materialGroups } from "./materials";
import { qualityGroups } from "./quality";
import type { Control, ControlGroup, GroupSection } from "./types";

export const SECTION_ORDER: GroupSection[] = [
  "Scene & light",
  "Materials",
  "Screen-space",
  "Post-processing",
  "Ground & shadows",
  "Other plugins",
];

/** Every group that has at least one adjustable value on the current engine. */
export function allGroups(): ControlGroup[] {
  const groups = [...lightingGroups(), ...materialGroups(), ...effectGroups(), ...qualityGroups()];
  return groups.filter((g) => {
    try {
      return g.controls().length > 0;
    } catch {
      return false;
    }
  });
}

export function groupsBySection(groups: ControlGroup[] = allGroups()): { section: GroupSection; groups: ControlGroup[] }[] {
  return SECTION_ORDER.map((section) => ({ section, groups: groups.filter((g) => g.section === section) })).filter(
    (s) => s.groups.length > 0,
  );
}

export function allControls(groups: ControlGroup[] = allGroups()): Control[] {
  return groups.flatMap((g) => g.controls());
}

export function findControl(id: string, controls: Control[] = allControls()): Control | undefined {
  return controls.find((c) => c.id === id);
}
