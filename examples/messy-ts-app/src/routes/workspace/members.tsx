// Intentional fixture: a `/workspace/members` route. Contributes `workspace`
// and `member` tokens to the IA index via the route path and breadcrumb.

export default function WorkspaceMembersPage() {
  return (
    <main>
      <Breadcrumb label="Workspace settings" />
      <h1>Members</h1>
    </main>
  );
}
