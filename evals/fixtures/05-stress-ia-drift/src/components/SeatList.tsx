// Third member of the drifting trio. Uses "Remove" and "Archive" again
// without alignment — a fourth and fifth phrasing of the same intent.
export default function SeatList() {
  return (
    <Sidebar>
      <NavItem label="Remove member" href="/seats/manage" />
      <NavItem label="Archive member" href="/seats/manage" />
    </Sidebar>
  );
}

declare function Sidebar(props: { children: unknown }): unknown;
declare function NavItem(props: { label: string; href: string }): unknown;
