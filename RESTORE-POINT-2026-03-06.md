# TicketMail Restore Point — March 6, 2026

This restore point captures a known-good state after mobile overflow fixes (Tickets + Analytics) and before starting the Dark Mode enhancement.

- **Date:** 2026-03-06
- **Branch:** `main`
- **Commit:** `a0d83b7a94de2feaaca4972d64ba182789455d2e`
- **Production URL (expected):** https://ticketmail.netlify.app/

## Included in this restore point

- Tickets page iPhone overflow fixes (toolbar wraps; ticket cards wrap).
- Analytics page iPhone overflow fixes (controls stack; cards stack).
- Analytics breakdown cards stacked vertically (Priority below Category).

## Quick restore options

### Option A — Reset local repo back to this point

```bash
git fetch origin
git checkout main
git reset --hard a0d83b7a94de2feaaca4972d64ba182789455d2e
```

### Option B — Create a branch at this point

```bash
git fetch origin
git checkout -b restore/2026-03-06 a0d83b7a94de2feaaca4972d64ba182789455d2e
```
