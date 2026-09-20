# Use an existing Chrome session for an approved browser step

Prefer the service's MCP connector for supported operations. An empty result is not a reason
to open its website. A connector permission failure is not permission to use another route.
Follow the shared Computer Use policy: identify the specific website and read, explain why a
browser is needed, and get the person's approval unless that exact step is already authorized.
An explicit request such as "test Attio through my Chrome login" supplies that approval.

When the approved task needs an existing signed-in session, use the host's Chrome extension
connection (`@Chrome`) in the person's intended profile. Use the browser tools exposed by the
host, with their current documentation. Do not choose the embedded browser for login reuse:
it has its own profile. If Chrome is unavailable, explain the missing connection and guide
setup here; never silently switch browsers or request another login in the embedded browser.
A working Chrome session does not repair or authenticate an MCP connector.

## Setup and a minimal read test

If Chrome is already connected, reuse it without installing anything or asking again. Otherwise,
explain the setup plainly: Settings > Computer Use > Google Chrome, install
and connect the official browser extension in the profile they use for this service. The user
handles native permission and account prompts. Ask them to select Chrome from the task's
`@` mention menu; typing a plain @Chrome string into a prepared link is not proof of selection.
GTM OS cannot grant browser permissions or attach the browser to a task by itself.

Example task after selecting @Chrome: "Open Attio using my existing login and confirm that
my workspace loads. Do not change any records." Use the equivalent for the named service.
Inspect only the relevant page. Verify the intended workspace is visible before reporting
success. Stop at that result; a login test does not authorize CRM changes, mailbox browsing,
a company-data import or future scheduled browser reads. If sign-in is needed, hand that
step to the person, preserving any already submitted onboarding choices.

Report the two connection states separately: for example, "Chrome session verified; Attio MCP
still unavailable." Never call mark_tool with status ok based on a browser read; that status
is the connector read test. Do not copy cookies, tokens or Chrome profile files into the brain,
the embedded browser or another process. Never store read-test page contents as company memories.

## If browser control fails

A detected extension/profile is not a verified site session. For a transient host error,
retry once through the same supported browser tool. If it persists, report the exact error
and that login reuse remains unverified. For example, "Unable to load browser request-header
policy" blocks the browser test before page access; it is not evidence of an Attio login failure.
Do not disable policies or switch to native app controls, cookie extraction or shell browser
automation to bypass the failed control path.

Offer a fresh task with Chrome selected in the mention menu as a troubleshooting step, not
a guaranteed fix. Preserve onboarding continuation before a necessary new task. If it still
fails, direct the person to the official browser troubleshooting steps or /feedback with the
task ID. Never repeat restarts indefinitely or claim a repository change fixed the host error.

Official setup and troubleshooting (checked 2026-09-14):
https://learn.chatgpt.com/docs/chrome-extension
