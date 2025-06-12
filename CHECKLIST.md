# Commercialization Checklist

This repository currently implements only basic MVP features. To prepare for production, the following items are needed. Items with a check mark have been started in this branch.

- [x] Firebase based user authentication
- [x] Persistent database for maps and users
- [ ] Cloud file storage (e.g. S3 or Firebase Storage)
- [x] Rate limiting
- [x] Usage quota per user
- [x] Caching of LLM/OCR results
- [x] Virus scanning for uploaded files
- [x] Role based access control
- [ ] Structured logging and monitoring (basic request logs only)
- [ ] CI/CD automation
- [ ] Billing and subscription management

## Mindmap Engine & UX Enhancements
These tasks are derived from the detailed technical proposal and will guide further development.

- [ ] Virtualized rendering for large trees (SVG/Canvas hybrid)
- [ ] Incremental layout calculation and partial updates
- [ ] Lazy loading APIs and client-side data fetching
- [ ] Queue based OCR/LLM processing with BullMQ workers
- [ ] Presigned URL uploads with file type and virus scanning
- [ ] Node.js clustering and horizontal scaling
- [ ] FSRS spaced repetition integration for nodes
- [ ] Responsive UI themes and smooth animations
- [ ] Radial and hierarchical layout modes (Reingold-Tilford)
- [ ] Web Worker/offscreen canvas for heavy layout work
- [ ] Pan/zoom controls with minimap and GPU transforms
- [ ] Theme customization via CSS variables (dark/light)
- [ ] Accessibility (ARIA labels, keyboard nav) and i18n
- [ ] PWA build with offline support

## Backend & Infrastructure
Expanded tasks for a scalable architecture.

- [ ] Migrate database to PostgreSQL with adjacency list schema
- [ ] Stateless JWT sessions and API gateway readiness
- [ ] Redis caching layer and BullMQ job monitoring
- [ ] Load balancing setup and health checks
- [ ] Real-time streaming of LLM output via SSE/WebSockets
- [ ] Application performance monitoring and RUM metrics
