# Routes

The admin portal exposes:

- `/team` — manage your team
- `/workspace` — workspace settings
- `/organisation` — organisation membership
- `/billing-plan` — plan + invoices

(All singular here, even though the code uses plural everywhere.)

## Manager-only screens

The [admin console](/admin) is reachable only by a manager. (The code at
`src/routes/admin.ts` actually requires owner; the nav entry says admin;
docs say manager — three role labels for one route.)

## CLI

The `iaq` CLI ships with the package:

```bash
iaq teams
```

```bash
iaq workspace
```

```bash
iaq refresh
```
