// Yet another shape: SINGULAR in the file name AND the function names,
// even though nav uses "Organisations" (plural). Same tenant concept,
// fifth naming variant in this fixture.
export function listOrganisation(): unknown[] {
  return [];
}

export function getOrganisation(id: string): unknown {
  return { id };
}
