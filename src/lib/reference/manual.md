## manual.ts

**Purpose:** Typed user-guide content driving the Manual dialog's scrollspy nav + body.
**File:** `src/lib/reference/manual.ts`

---

### MANUAL_SECTIONS: ManualSection[]
Ordered list of guide sections. Each `ManualSection` is `{ id, title, body }` where `id` is the anchor used by `ManualDialog`'s `scrollIntoView` + IntersectionObserver, `title` is the nav label and section heading, and `body` is an array of paragraph strings.

Authored prose (not ported legacy HTML). Sections: getting-started, systems, signatures, connections, tracking, reference. Edit here to change the manual — `ManualDialog` renders whatever is in this constant.
