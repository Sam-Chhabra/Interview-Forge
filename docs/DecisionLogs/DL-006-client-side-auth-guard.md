# DL-006: Client-side auth guard for v1; httpOnly cookies deferred to v1.1

**Date:** 2026-05-19
**Status:** Accepted (with explicit migration path)

## Context

Authentication for the Next.js frontend currently uses:
- JWT access token stored in localStorage
- Auth context reads token on mount, hydrates state
- Authenticated layout (`app/(authenticated)/layout.tsx`) redirects to `/login` 
  if no token after hydration
- Authorization: Bearer header sent on every API call from the client

This is a **client-side guard only**. The HTML for protected routes is still 
served by Next.js; the JavaScript decides whether to render or redirect. 
A determined user can:
- View the page source via curl with no token
- Disable JavaScript and inspect the bundled component code  
- Read the JWT from localStorage (XSS attack surface)

## Decision

Accept this for v1. The threat model for a portfolio/MVP project is low — 
no sensitive data being protected, no payment surface, no user-generated 
content other than the user's own resume. The tradeoff that buys the 
security gap:

- localStorage + Authorization header is the simplest auth pattern in 
  Next.js. ~50 lines of code total across the API client and AuthContext.
- httpOnly cookie auth requires Next.js middleware + a BFF (backend-for-
  frontend) layer where Next.js route handlers proxy to FastAPI. ~3-5x 
  more code and adds a deployment dependency.

The 16-day sprint timeline doesn't have buffer for the BFF migration; the 
remaining 8 days are committed to resume upload, interview UI, evaluation 
UI, dashboard, deployment, and demo content.

## v1.1 migration path

When time permits post-launch, migrate to:

1. Next.js middleware (`middleware.ts`) checks `Cookie: access_token` on 
   protected routes, redirects to `/login` server-side before HTML renders
2. Login/register form submits to Next.js route handlers (`/app/api/auth/...`), 
   which proxy to FastAPI and set the access_token as httpOnly cookie in 
   the response
3. AuthContext reads user state from `/api/auth/me` (also proxied), not 
   from token decoding
4. localStorage usage removed entirely

This eliminates the XSS attack surface (httpOnly cookies can't be read 
from JavaScript) and provides true server-side route protection.

## References

- Next.js middleware docs: https://nextjs.org/docs/app/building-your-application/routing/middleware
- Auth.js documentation as a possible drop-in: https://authjs.dev/