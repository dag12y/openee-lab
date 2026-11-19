# Documentation

**Status:** Current index for Phase 0, Stage 1.  
**Purpose:** Navigate the product documentation and explain how to read its decision labels.

## Recommended reading order

1. [Product vision](product/vision.md) — users, problem, principles, and long-term direction.
2. [Product scope](product/scope.md) — proposed first release and explicit boundaries.
3. [Product requirements](product/requirements.md) — testable requirements and traceability.
4. [User journeys](product/user-journeys.md) — representative paths through the proposed product.

The [repository README](../README.md) gives a short introduction and current status.

## Document status conventions

Each major document states its **Status** and **Purpose**. Within documents:

The documents distinguish the **university AM assignment** (a separate existing simulator and possible integration path), **conventional AM vertical slice** (a proposed architecture-validation exercise), **first public release** (a proposed bounded product), and **long-term ecosystem** (the five pillars). The platform foundation consists of agreed product principles; specific technical architecture has not been approved. A long-term pillar or assignment feature does not become a public-release commitment merely by appearing here.

- **Accepted:** An agreed product principle or direction; it does not approve a technical architecture, implementation, or release scope.
- **Proposed:** A product choice awaiting review and approval.
- **Assumption:** A working premise used to make the proposal concrete; it needs validation.
- **Open question:** A decision or fact still to resolve.
- **Future:** Direction outside the proposed first release.

Requirements inherit the decision status of the scope item they describe. A requirement marked Proposed is testable planning material, not an approved delivery commitment. Auditing the separate AM simulator is required before reusing its behavior or code.
