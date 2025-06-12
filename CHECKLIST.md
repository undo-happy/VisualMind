# Commercialization Checklist

This repository currently implements only basic MVP features. To prepare for production, the following items are needed. Items with a check mark have been started in this branch.

- [x] Firebase based user authentication
- [x] Persistent database for maps and users
- [x] Cloud file storage (e.g. S3 or Firebase Storage)
- [x] Rate limiting
- [x] Usage quota per user
- [x] Caching of LLM/OCR results
- [x] Virus scanning for uploaded files
- [x] Role based access control
- [x] Structured logging and monitoring (basic request logs only)
- [x] CI/CD automation
- [x] Billing and subscription management

## Mindmap Engine & UX Enhancements
These tasks are derived from the detailed technical proposal and will guide further development.

- [x] Virtualized rendering for large trees (SVG/Canvas hybrid)
 - [x] Incremental layout calculation and partial updates
- [x] Lazy loading APIs and client-side data fetching
 - [x] Queue based OCR/LLM processing with BullMQ workers
- [ ] Presigned URL uploads with file type and virus scanning
- [x] Node.js clustering and horizontal scaling
- [x] FSRS spaced repetition integration for nodes
- [x] Responsive UI themes and smooth animations
- [x] Radial and hierarchical layout modes (Reingold-Tilford)
- [x] Web Worker/offscreen canvas for heavy layout work
- [x] Pan/zoom controls with minimap and GPU transforms
- [x] Theme customization via CSS variables (dark/light)
- [x] Accessibility (ARIA labels, keyboard nav) and i18n
- [x] PWA build with offline support

## Backend & Infrastructure
Expanded tasks for a scalable architecture.

- [ ] Migrate database to PostgreSQL with adjacency list schema
- [ ] Stateless JWT sessions and API gateway readiness
 - [x] Redis caching layer and BullMQ job monitoring
- [x] Load balancing setup and health checks
- [x] Real-time streaming of LLM output via SSE/WebSockets
- [x] Application performance monitoring and RUM metrics
