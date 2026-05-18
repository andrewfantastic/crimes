// One of three thin user-listing components. Action verbs across these
// three files disagree about whether a user is "deleted", "removed", or
// "archived" — copy_ia_drift / action_label_drift territory.
export default function UserList() {
  return (
    <Sidebar>
      <NavItem label="Delete user" href="/users/manage" />
      <NavItem label="Remove member" href="/users/manage" />
    </Sidebar>
  );
}

declare function Sidebar(props: { children: unknown }): unknown;
declare function NavItem(props: { label: string; href: string }): unknown;
