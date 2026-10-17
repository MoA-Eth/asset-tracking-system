# API and system integration

The MoA Asset Tracking System exposes an enterprise REST API designed for interoperability with Ministry systems and the national IFMIS platform.

## Interactive API Documentation (Swagger)

An interactive OpenAPI 3.0 portal is built directly into the server:

- **Swagger UI**: Accessible at `http://<server-address>:3000/api/docs`
- **Raw OpenAPI JSON specification**: `http://<server-address>:3000/api/docs/json`

The documentation interface lets authorized IT staff inspect available endpoints, review request/response schemas, and execute test requests in real time using Bearer authentication.

## Authentication & Security

All API endpoints except `/api/health` and `/api/docs` require a JSON Web Token (JWT) provided in the HTTP `Authorization` header:

```http
Authorization: Bearer <your-jwt-token>
```

1. **Obtaining a Token**: Submit a `POST` request to `/api/auth/login` with your employee email or Payroll ID and password.
2. **Session Verification**: Call `GET /api/auth/me` to inspect the active session and granted RBAC permission keys.

## Rate Limiting Policies

To protect against denial-of-service and brute-force credential stuffing, two automated rate limiters are active:

- **Global API Limiter**: 300 requests per minute per IP address across all `/api/*` routes. When exceeded, the server returns HTTP 429 (`Too Many Requests`) with a standard retry window.
- **Authentication Limiter**: 30 requests per 15 minutes per IP address on `/api/auth/*` routes.
- **Standard IETF Headers**: Every response includes `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers.

## Health and Monitoring Probes

For container orchestrators (Kubernetes, Docker Swarm) and external uptime monitors, three diagnostic endpoints are available:

- `GET /api/health/live`: Fast liveness probe returning `{ status: "alive", uptime: <seconds> }`.
- `GET /api/health/ready`: Database readiness check ensuring the PostgreSQL cluster is connected.
- `GET /api/health`: Full health report with system environment, version, and Git revision.

## Key Endpoint Groups

- **Inventory & Assets (`/api/items`)**: Query asset register, item details, and submit Model 19 receiving vouchers.
- **Store Operations (`/api/items/...`)**: Endpoints for Model 20 store issues, Model 21 transfers, and asset disposals.
- **Approvals (`/api/items/approvals/...`)**: Multi-stage statutory approval workflows.
- **Reference Data (`/api/reference/...`)**: Stores, storage locations, departments, and staff directory.
- **Roles & Permissions (`/api/roles`)**: Granular role-based access control matrix.
