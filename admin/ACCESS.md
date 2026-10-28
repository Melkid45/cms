# Account access

The existing hosting-configured owner is the **Super admin**. Existing owner sessions remain valid. The owner can create client accounts in **Team → Add client**, reset their passwords, disable access and enable it again. No password is emailed automatically.

Client accounts are stored separately from the website document (PostgreSQL document `accounts`, or private local `accounts.json`). Passwords use salted scrypt hashes. Sessions expire after 12 hours; password changes and access changes increment the account version, invalidating existing sessions. Accounts and password hashes are never included in public site data or project exports.

Clients can change their own password under Website settings → Your password by supplying their current password. The server verifies it inside the account lock, rotates the account version, and renews only the requesting session. Attempts are rate-limited. Owner credentials remain managed through hosting. Signed super-admin provisioning can list/create client accounts through the bot accounts resource; the temporary agent proxy does not expose this resource and signed client requests cannot use it.

| Capability | Super admin | Client |
| --- | --- | --- |
| Read and mark enquiries | Yes | Yes |
| Edit existing section text, links and images | Yes | Yes |
| Reorder existing sections | Yes | Yes |
| Save drafts and publish existing pages | Yes | Yes |
| Upload/select images and replace logos | Yes | Yes |
| Update enquiry settings | Yes | Yes |
| Update website name, contacts, logos and email delivery | Yes | Yes |
| Create/delete pages; change URLs, SEO or locale | Yes | No |
| Add/remove/hide sections; change variants | Yes | No |
| Add/remove/reorder repeated cards | Yes | No |
| Change colours, shared layout or menus | Yes | No |
| Manage accounts and hosting configuration | Yes | No |

Client navigation contains Overview, Pages and Settings. Overview shows enquiries. Website settings offers the website name, public URL, email, phone, address, enquiry time zone, logos, form availability, recipient and confirmation message. Shared header/footer email and phone links use the contact settings when present. The website URL supplies page canonical URLs. The business address is included in enquiry emails.

Email delivery can use hosting configuration, custom SMTP or remain disabled while saving enquiries to Inbox. Custom SMTP uses TLS on port 465 or STARTTLS on port 587. Passwords are AES-256-GCM encrypted with a purpose-specific key derived from `CMS_AUTH_SECRET`, stored in a separate `smtp` document and never returned by the API or serialized into page data. Rotating that hosting secret requires re-entering SMTP passwords. Blank passwords preserve the saved secret; changing the host or username requires re-entry. Public IPv4 SMTP hosts are resolved and validated before connection, with the chosen address pinned for the connection and the original host retained for TLS verification. Private and reserved addresses are rejected. Connection checks are rate-limited and use SMTP verification without sending email.

Project permissions are checked inside the locked save transaction against the stored revision, rather than trusting browser state. Media uploads use the existing image validation pipeline. Account management and hosting APIs require the owner role. Restricted dashboard routes also check access on the server.

Signed Telegram CMS requests default to client permissions. The trusted bridge fixes the actor before signing: the configured Telegram owner has super-admin CMS access; other allowed senders have client CMS access. A child agent cannot request a different actor through its temporary proxy. This does not change the separate, previously authorised Telegram source-code editing workflow.

## Verification

Run `npm run build` followed by `npm run test:roles`. The test starts its own production server on port 3101 with temporary local storage, generated credentials, no database, no Blob and no SMTP. It checks both roles, API and route restrictions, repeatable content, uploads, publication, signed bot actors, stale revisions and session revocation. It does not touch the hosted website. `CMS_ROLE_TEST_PORT` overrides the test port. `CMS_KEEP_ROLE_TEST_SERVER=1` keeps the isolated demo running for browser verification and writes temporary login details to ignored `.data/role-check-login.json`.
