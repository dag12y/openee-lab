# Proposed design system

**Status:** Proposed Stage 2 visual and interaction guidance; no accessibility compliance has been tested.  
**Purpose:** Define reusable design tokens and engineering presentation rules for a professional multi-domain product.  
**Scope:** First-release shell, guided simulation, graph, plots, and local project flows; token system should extend to future editors without implying they exist.

## Principles and tokens

Prioritize legible numerical work, visible provenance, consistent actions, and calm density. Visual emphasis follows task hierarchy: current model and run status before decorative branding. Light and dark themes use the same semantic token names, with distinct values chosen and checked during implementation. Do not encode engineering meaning in color alone.

| Token family | Proposed roles | Rule |
| --- | --- | --- |
| Surface | `surface.page`, `surface.panel`, `surface.raised`, `surface.overlay` | Maintain distinguishable panel boundaries in both themes |
| Text | `text.primary`, `text.secondary`, `text.muted`, `text.inverse` | Units, errors, and model metadata remain readable |
| Border/focus | `border.default`, `border.strong`, `focus.ring` | Focus must be visible on every interactive region |
| Action | `action.primary`, `action.hover`, `action.disabled` | Primary action is consistent across lab and workspace |
| Status | `status.info`, `status.success`, `status.warning`, `status.error`, `status.stale` | Pair color with icon/text; stale result is distinct from failure |
| Plot series | `series.1` onward plus dash/marker tokens | Distinguish overlapping traces in light/dark and non-color viewing |
| Layout | `space.*`, `radius.*`, `elevation.*`, `size.control.*` | Use a small documented scale rather than component-specific values |

Exact palette, contrast values, font sizes, and breakpoints remain implementation decisions subject to accessibility review. Theme selection follows user choice where available, otherwise system preference; switching theme does not change model data or plot values.

## Typography, spacing, and layout

Use a readable UI text face, a tabular-numeral style for values and axes, and a math-capable presentation for equations. Keep symbols, subscripts, and units distinct. Define type roles for page title, section heading, body, label, helper text, data value, and diagnostic. Spacing tokens should express compact control groups, panel padding, and larger section gaps consistently. Avoid hiding scientific precision through truncation; allow inspection of the full value and its unit.

Panels and cards use the same surface and border roles. Tabs have visible selected and focus states and retain meaningful labels. Dialogs state the consequence of destructive choices, keep focus inside while open, and return focus to the trigger. Controls show label, unit, valid range/constraint, helper or error text, and disabled reason where relevant. Avoid disabled actions with no explanation. A toolbar button has text or an accessible name; icons alone are insufficient for unfamiliar engineering actions.

## Engineering-specific components

- **Numeric field:** display value and unit separately where possible; accept only documented formats; distinguish parsing failure, out-of-domain value, and warning. Do not silently round or clamp. Show full stored precision on inspection; display precision policy is an open decision.
- **Quantity/metadata row:** symbol, name, value, unit, model identity/version, sampling configuration, and assumption can be copied or inspected without altering the model.
- **Plot:** axes with quantities and units, readable ticks, legend, optional cursor values tied to data, text summary, and clear current/stale status. Zoom or pan cannot alter the underlying simulation. Exported plot behavior is a later decision.
- **Graph node:** title, type, status, typed input/output ports, and selected/focus states. Port compatibility appears in text and shape or label as well as color. Connection errors point to both endpoints; a keyboard list provides the same relationships as wires.
- **Diagnostic:** severity, affected model element, concise reason, and corrective action where known. Numerical/engineering warnings are separate from blocking input errors.
- **Run status:** idle, validating, running, complete, stale, failed, and cancelled are text-readable states with model revision context.

## Responsive and accessible behavior

At desktop width, panels may sit beside an editor. At tablet width, secondary panels become tabs/drawers. At mobile width, guided simulation and inspection remain single-column; graph editing requires feasibility validation before claiming support. Breakpoints should be chosen from content pressure rather than assumed device brands. All first-release flows need keyboard paths, logical focus order, visible focus, labels for icon controls, text alternatives to plots, and accessible error announcements. A screen reader should be able to discover a plot's quantities, units, series, and summary without decoding the image. These are design requirements; compliance has not been tested.

Respect reduced-motion preference: suppress decorative transitions, animate no essential engineering meaning, and communicate run state in text. Do not flash plots on recompute. Keep the same component vocabulary across future engineering domains while allowing domain-specific symbols, port types, and editors.

## Key design decisions and alternatives

**Proposed:** semantic tokens and engineering-specific components form the shared visual language. **Alternative:** domain-specific themes would fragment navigation and status meaning; domain identity can instead be carried by labels and restrained accents. Exact colors and metrics are deliberately unspecified until contrast and usability evaluation.

## Open questions

- Which typefaces and math rendering approach can meet engineering notation needs in self-hosted use?
- What display-precision and input-format policies preserve clarity without misrepresenting numerical values?
- What accessibility standard and supported viewport policy will be approved?

## Related documents and traceability

[Stage 1 requirements](../product/requirements.md), [workspace](workspace.md), [guided labs](guided-labs.md), [information architecture](information-architecture.md), [feasibility](workspace-feasibility.md). Relevant IDs: FR-002–FR-003, FR-005–FR-006, FR-009, NFR-001–NFR-005, NFR-008.
