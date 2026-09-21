# Security Policy

## Reporting a Vulnerability

Please do NOT report security vulnerabilities as public GitHub issues.

Contact the maintainers directly or use the appropriate responsible disclosure channel.

## Security Principles

- Secrets are never committed to source control
- JWT secrets must be strong randomly generated values in production
- Medical data access is restricted by role (least privilege)
- All sensitive operations are audited
- Input validation is applied at all API boundaries
- CORS is configured to restrict origins
- Rate limiting is applied to all public endpoints
