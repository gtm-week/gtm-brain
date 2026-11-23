# Up2Data: first-use onboarding

Read when live LinkedIn research is requested and access is missing, or when the person asks
to connect Up2Data. Both research skills use this procedure. Supplied files remain a complete
research route: never require an account for mock data, interviews, exports or pasted threads.
Reuse an existing working provider and saved authorization rather than making the person reconnect.

## 1. Explain the choice

Say what is missing for this request (for example, original posts and replies). Explain that
Up2Data supplies LinkedIn research data through a paid API; connecting it does not authorize
spending or LinkedIn actions. Offer a concrete choice through the host's question flow:
“Connect Up2Data for research, or continue with supplied files?” Reuse an explicit choice
already made. Do not open a signup or install anything merely because evidence is missing.

## 2. Let the person connect securely

Send the person to [Up2Data's account app](https://app.up2data.ai) to sign in or create an
account and generate an API key. The person handles account creation, plan selection and
payment. Do not choose a subscription, buy credits or request a key in chat.

Reuse a supported connector's secure credential configuration if it exists. Otherwise the
included Node helper accepts `UP2DATA_API_KEY` supplied by the host's secret manager or a
user-controlled local process. It does not install a connector or persist credentials.
Do not write keys into Brain documents, source files, shell arguments, command history or
`.env` files. On systems without a secure injection facility, offer this one-session terminal
step (bash or zsh; substitute the helper's actual absolute path before presenting it):

```sh
node -e 'process.stdout.write("Up2Data API key (hidden): ")'
stty -echo
IFS= read -r UP2DATA_API_KEY
stty echo
export UP2DATA_API_KEY
node "/absolute/path/to/topic-analyzer/scripts/up2data-account.mjs" check
unset UP2DATA_API_KEY
```

The user types the key into the hidden prompt, never into a command. This checks that terminal
session only; it does not connect another app process. If interrupted before echo is restored,
run `stty echo`. Prefer the host's secure secret-input UI when available. Persistent credential
storage requires the person's choice of store; do not create global configuration silently.
In LinkedIn Agent, the existing project helper and Keychain instructions may be reused; those
local account settings and budgets are not defaults for other users.

## 3. Verify access without paid research

Resolve the helper beside this reference: `../scripts/up2data-account.mjs`. `status` only checks
whether the environment credential is present. `check` sends one free `GET /v1/account` to the
fixed Up2Data endpoint, with redirects disabled, a timeout and no automatic retries. Prefer a
supported connector's equivalent sanitized account check when available. Never dump the raw
account response: it contains a webhook signing secret, which the provider may initialize on
its first read. The helper emits only status and selected numeric credit fields.

Report connected, missing/invalid credential, rate-limited, or connection/response error
accurately. A sandbox access failure is not proof that a stored key is invalid. Do not replace
credentials or disable TLS to fix it. A zero balance means authenticated access with no paid
research capacity. Account connectivity does not prove post/comment access or collector readiness.

## 4. Agree the first bounded research request

Reuse saved scope and explicit authorization. Otherwise propose the smallest useful request:
its target(s), operation, fields, maximum results/pages, maximum total credits (including flags,
batch items and minimum charges), and the uncertainty it resolves. Verify the current endpoint
schema and [credit rules](https://docs.up2data.ai/v1/guides/credits/) before quoting that bound.
Do not infer a spending allowance from account balance. Do not inherit another company's
credit caps or currency conversion; label any currency estimate with its source/rate.

Obtain permission for that exact paid scope unless existing authorization already covers it.
Only then use a supported collector that records intent, budget reservation and request IDs,
and reconciles uncertain launches before retries. This package supplies the free check, not
a paid collector. If none is available, say “Account connected; collection is not configured”
and continue from user-supplied exports instead of improvising an untracked paid call.

## 5. Save enough to resume

Keep only provider name, credential location identifier (never the credential), last successful
check date, tested capability, agreed scope/budget, collector/ledger reference and next step.
In Brain mode use the existing fitting context and supported memory/configuration tools; in
standalone mode use the project's established configuration. Record access and spending
approval separately. Do not record “ready for research” until both access and a suitable
collector are verified. Setup does not start a schedule, send outreach or qualify a person.

Official references, checked 2026-11-23: [authentication](https://docs.up2data.ai/v1/guides/authentication/),
[free account check](https://docs.up2data.ai/v1/api/account-get/),
[API schema](https://docs.up2data.ai/v1/openapi.yaml). Recheck current provider documentation
when executing; limits and prices are not frozen by this skill.
