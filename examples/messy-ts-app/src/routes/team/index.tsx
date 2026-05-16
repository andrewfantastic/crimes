// Intentional fixture: a `/team` route whose breadcrumb says "Organisation".
// Helps Concept Alias Drift see `team` and `organisation` as siblings in
// the tenant alias group.

export default function TeamPage() {
  return (
    <main>
      <Breadcrumb label="Organisation overview" />
      <h1>Team</h1>
    </main>
  );
}
