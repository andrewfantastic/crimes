import type { IaConceptAliasGroup } from "./types.js";

/**
 * Seed concept-alias catalogue for the Concept Alias Drift detector.
 *
 * Each group lists lowercase token forms that frequently get used for the
 * same underlying domain concept across different files. The catalogue is
 * intentionally small — adding speculative groups raises the false-positive
 * rate of every detector that consumes it.
 *
 * Aliases are stored singular and lowercased. The tokeniser normalises
 * incoming tokens to the same form before lookup.
 */
export const DEFAULT_ALIAS_GROUPS: IaConceptAliasGroup[] = [
  {
    id: "tenant",
    preferred: "organization",
    aliases: [
      "team",
      "workspace",
      "organization",
      "organisation",
      "account",
      "tenant",
      "company",
    ],
  },
  {
    id: "plan",
    preferred: "plan",
    aliases: ["plan", "tier", "subscription", "package"],
  },
  {
    id: "user",
    preferred: "user",
    aliases: ["user", "member", "seat"],
  },
  {
    id: "delete",
    preferred: "delete",
    aliases: ["delete", "remove", "archive", "trash", "destroy"],
  },
  {
    id: "owner",
    preferred: "owner",
    aliases: ["owner", "admin", "manager", "founder"],
  },
  {
    id: "billing",
    preferred: "billing",
    aliases: ["billing", "payments", "checkout"],
  },
];

/**
 * Reverse index: alias → group id. Built from `DEFAULT_ALIAS_GROUPS`.
 *
 * Returns `undefined` for tokens that don't belong to any catalogued group.
 */
export function aliasToGroupId(
  groups: IaConceptAliasGroup[] = DEFAULT_ALIAS_GROUPS,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const alias of group.aliases) {
      map.set(alias, group.id);
    }
  }
  return map;
}
