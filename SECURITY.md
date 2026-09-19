# Security policy

Nomad Dimension is a single-operator production tool. One person runs it, the
provider keys belong to that person, and there is no multi-tenant data. That
makes the deployment a small target but an expensive one to probe, so please
read the testing rules before you send a single request.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: go to the **Security** tab of this
repository and choose **Report a vulnerability**. That opens a private advisory
visible only to the maintainer.

Do not open a public issue for a vulnerability, and do not include exploit
details, credentials, or reproduction payloads in a public issue. If private
reporting is unavailable to you, open a public issue that asks for a private
channel and contains no technical detail.

This is a personal project with no bug bounty and no support contract. Reports
are read on a best-effort basis; there is no response or fix deadline. What you
can expect: an acknowledgement that the report arrived, an honest assessment of
whether it is in scope, and a note here or in the changelog if it is fixed.

## Testing rules

The live deployment at the Netlify site is the operator's working production
tool. It is bound to paid provider keys, and an AI, speech, or research request
costs real money per call.

- **Do** run your own local copy. `npm run dev` with your own `.env` gives you
  the entire app, every endpoint, and the sign-in flow to test against.
- **Do** read the code and report what you find by inspection.
- **Do not** attack, scan, fuzz, load-test, or brute-force the live site.
- **Do not** attempt to sign in to the live site, or run any authenticated
  request against it. Every provider endpoint is behind that sign-in, and a
  successful request spends the operator's money.
- **Do not** use the live endpoints as a proxy for your own traffic.

Testing your own copy, including deliberately breaking it, is fair game.

## Scope

In scope:

- The client app: `index.html`, `src/*.js`.
- The Netlify endpoints in `functions/` and their shared adapters in
  `functions/_shared/`, especially session and authorization handling
  (`_shared/auth.js`), the Notion operation and path allowlist
  (`notion-proxy.js`), and request-size and same-origin enforcement.
- The deploy staging whitelist in `scripts/build-deploy.mjs` and the redirect
  and header policy in `netlify.toml`, if either can publish or expose something
  it should not.
- Anything that leaks a provider key, a Notion token, the operator password, or
  private content into the browser, a log, a commit, or a deploy artifact.

Out of scope:

- The operator's Notion workspace, YouTube account, and provider accounts.
- Third-party providers: Anthropic, Google, OpenAI, Notion, YouTube, Netlify.
  Report those to the provider.
- Denial of service, rate-limit exhaustion, and social engineering.
- Missing security headers or cookie flags that a browser already enforces here,
  unless you can show a concrete impact.

## Known and accepted limitations

These are documented rather than fixed, so reports restating them are not
vulnerabilities:

- Sign-in throttling is best-effort per warm serverless instance, not a shared
  rate limiter.
- Sign-in is one shared password for one operator; there are no accounts, roles,
  or per-record ownership checks. The Notion integration's own permissions are
  the data scope.
- The Notion proxy restricts API operations and path shapes. It does not
  implement per-record authorization.

## Safe harbor

Research conducted under the testing rules above — against your own copy, or by
inspection — is welcome, and the maintainer will not pursue legal action for it.

## Credential exposure

No provider key, Notion token, or password is ever stored in this repository or
shipped to the browser; keys live in Netlify environment variables. If you
believe a credential has leaked anyway, report it privately using the process
above, and do not use the credential you found.
