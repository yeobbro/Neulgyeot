# Dashboard Upgrade Plan — Neulgyeot & ClariView

## Reference direction
Use the user-provided October 2026 mockups as visual direction. Treat the images as design references, not as implemented product screens or evidence of real integrations.

## Shared design system
- Warm ivory canvas, restrained borders and shadows, generous spacing, high-contrast typography.
- Product-specific navigation: deep forest green for Neulgyeot; warm blush/rose accents for ClariView.
- Responsive desktop dashboard with collapsible sidebar, top-level search, notifications, user/workspace menu, metric cards, data panels, tables and detail drawers.
- Mobile-first responsive states for key field workflows.
- Accessible keyboard focus, semantic landmarks, contrast, loading/empty/error states.
- Reusable components for metric cards, filters, status chips, timeline rows, charts, search and confirmation dialogs.

## Neulgyeot — care intelligence
### Primary navigation
1. Dashboard
2. People / case management
3. Care requests
4. Change signals
5. Service coordination
6. Local resource map
7. Reports and analytics
8. Notifications
9. Settings and audit history

### Dashboard
- Summary metrics: active care recipients, new requests, change signals needing review, service connections in progress.
- Care-request queue with status filters and assignee.
- Regional service/resource map (use synthetic/demo locations until a real map provider and approved data source are configured).
- Alert panel with severity, evidence, timestamp and review status.
- Filters by region, service, period and responsible worker.

### Person detail
- Overview, care records, change signals, service history, notes and follow-up tasks.
- Explainable signals compare recent observations with that person's baseline and show data source, time range, missing-data caveats and evidence.
- A signal is a prompt for human review, never an automatic diagnosis, emergency determination or care decision.
- Record review disposition and follow-up action with an audit trail once authentication and persistence are implemented.

### Safety and data boundaries
- Continue to use synthetic data in the prototype.
- Do not collect real personal, welfare or health data before authentication, role-based access, organization isolation, encryption, retention, audit logging and legal/regulatory review are ready.
- Clearly label mock/demo metrics and unimplemented integrations.
- Add tests for baseline calculations, missing observations, duplicate records and signal generation before connecting real data.

## ClariView — beauty and lifestyle
### Primary navigation
1. Home / personalized recommendations
2. AI beauty profile
3. Style recommendations
4. Procedure and estimate analysis
5. Clinic search and comparison
6. Reviews and community
7. Saved items / my plan
8. Profile and settings

### Key flows
- Profile intake and image upload with explicit consent, file validation, size/type limits and delete controls.
- Image comparison with clear labels and a disclaimer that simulated or generated examples are not guaranteed outcomes.
- Results pages for skin tone/undertone, face/style profile and recommendations; show confidence/limitations and avoid unsupported medical claims.
- Clinic search with region, category, price range, review and specialty filters.
- Estimate comparison that itemizes included services and flags that final prices depend on consultation.
- Review/community pages with reporting and moderation requirements before public launch.
- Saved recommendations and a personal plan.

### Safety and data boundaries
- No claims of clinically validated analysis unless independently validated and documented.
- Do not upload or retain face images without informed consent, purpose limitation, access controls and retention/deletion policies.
- Demo recommendations and clinic/review data must be visibly labeled as sample content until connected to verified sources.
- Avoid fabricating clinic ratings, prices, reviews or real AI analysis.

## Delivery phases
1. Audit current repositories, routes, components and tests; preserve existing working behavior.
2. Implement shared UI primitives and responsive dashboard shell per product.
3. Upgrade the main dashboard and detail views using realistic, clearly labeled demo data.
4. Implement functional search, filters, tabs, selection, upload validation and comparison interactions.
5. Define typed domain models and API contracts; keep demo data isolated from production integrations.
6. Add tests, accessibility checks, loading/empty/error states and security review.
7. Open pull requests, run lint/typecheck/build and review preview deployments before merging.

## Acceptance criteria
- Desktop and mobile layouts adapt without horizontal overflow.
- Navigation and interactive controls perform their stated actions.
- Demo data is visibly labeled and never presented as live data.
- No sensitive data is committed to Git or included in fixtures.
- Build, lint and tests pass for each repository before merge.
- Unimplemented APIs and AI functions are clearly disclosed rather than simulated as real.
