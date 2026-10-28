# Account access

The existing hosting-configured owner is the **Super admin**. Existing owner sessions remain valid. The owner can create client accounts in **Team → Add client**, reset their passwords, disable access and enable it again. No password is emailed automatically.

Client accounts are stored separately from the website document (PostgreSQL document `accounts`, or private local `accounts.json`). Passwords use salted scrypt hashes. Sessions expire after 12 hours; password changes and access changes increment the account version, invalidating existing sessions. Accounts and password hashes are never included in public site data or project exports.

| Capability | Super admin | Client |
| --- | --- | --- |
| Read and mark enquiries | Yes | Yes |
| Edit existing section text, links and images | Yes | Yes |
| Reorder existing sections | Yes | Yes |
| Save drafts and publish existing pages | Yes | Yes |
| Upload/select images and replace logos | Yes | Yes |
| Update enquiry settings | Yes | Yes |
| Create/delete pages; change URLs, SEO or locale | Yes | No |
| Add/remove/hide sections; change variants | Yes | No |
| Add/remove/reorder repeated cards | Yes | No |
| Change colours, shared layout or menus | Yes | No |
| Manage accounts and hosting configuration | Yes | No |

Client navigation contains Overview, Pages and Settings. Overview shows enquiries. Settings currently offers logos and the enquiry recipient. Editable SMTP credentials are a separate next step; delivery still uses server environment variables.

Project permissions are checked inside the locked save transaction against the stored revision, rather than trusting browser state. Media uploads use the existing image validation pipeline. Account management and hosting APIs require the owner role. Restricted dashboard routes also check access on the server.

Signed Telegram CMS requests default to client permissions. The trusted bridge fixes the actor before signing: the configured Telegram owner has super-admin CMS access; other allowed senders have client CMS access. A child agent cannot request a different actor through its temporary proxy. This does not change the separate, previously authorised Telegram source-code editing workflow.

## Verification

Run `npm run build` followed by `npm run test:roles`. The test starts its own production server on port 3101 with temporary local storage, generated credentials, no database, no Blob and no SMTP. It checks both roles, API and route restrictions, repeatable content, uploads, publication, signed bot actors, stale revisions and session revocation. It does not touch the hosted website. `CMS_ROLE_TEST_PORT` overrides the test port. `CMS_KEEP_ROLE_TEST_SERVER=1` keeps the isolated demo running for browser verification and writes temporary login details to ignored `.data/role-check-login.json`.
