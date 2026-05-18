// Sibling of UserList.tsx. Uses "Archive" and "Delete" for what
// UserList calls "Delete" and "Remove". Three labels for one action.
export default function TeamList() {
  return (
    <Sidebar>
      <NavItem label="Archive team" href="/teams/manage" />
      <NavItem label="Delete the seat" href="/seats/manage" />
    </Sidebar>
  );
}

declare function Sidebar(props: { children: unknown }): unknown;
declare function NavItem(props: { label: string; href: string }): unknown;
