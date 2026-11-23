# FEAT-2026-001 — decision log

## F0 intake — 2026-11-23
- Request: app web per organizzare e tracciare tutto il matrimonio di Tony e Jessica: guida passo passo (giorno, location, invitati, RSVP, abiti, testimoni, lista nozze…), budget iniziale modificabile nel tempo, UI cool, hosting free su Vercel, condivisione con gli invitati il giorno del matrimonio (foto/video).
- Product split into a roadmap: R1 (this feature) foundations + guided onboarding + timeline/checklist + budget; R2 suppliers/date/location; R3 guests/RSVP/public site; R4 dresses/witnesses/documents/registry; R5 seating; R6 wedding-day live (media, guestbook, slideshow).
- Size: L — greenfield infra, authentication, data model, personal data.
- Team: product-owner, architect (+ADR), designer, developer(s), qa, reviewer (+security round), technical-writer, release-manager.
- Developer answers (2026-11-23):
  1. Language: Italian for chat, docs and app UI.
  2. Stack OK; frontend in React.
  3. Access: Tony and Jessica now; design for future "family" and "wedding planner" roles (planner may never exist).
  4. Public repo on personal account tonybartiloro (unlimited CI minutes) → created github.com/tonybartiloro/roadmap2yes.
  5. Vercel preview per PR; merge to main = production, which for now is also the staging.
  6. Docs as Markdown in the repo; no external tracker.
  7. Desired date 3 Sep 2027 (not earlier), depends on location availability; fallback May–June or September 2028.
  8. Start with R1.
  - Nothing is decided yet: the app must guide every choice, track everything and allow revisiting choices over time.
  - Everything must be hosted for free, storage included.
- Storage research (coordinator, 2026-11-23): Supabase free = 0.5 GB DB, 1 GB storage, pauses after ~7 days inactivity; Backblaze B2 = 10 GB free, no credit card, free egress up to 3x stored; Cloudflare R2 = 10 GB free but may ask a payment method; Cloudinary free = 25 credits/month (1 credit = 1 GB storage or bandwidth), video bandwidth 1 GB on free.
