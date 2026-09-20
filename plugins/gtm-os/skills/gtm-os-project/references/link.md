# Connect the selected working folder

Used by Link Project for existing folders. New Project has its own creation flow and shares
only the opening step. Keep the selected folder and the brain's storage separate.
Read [question handling](../../gtm-os-start/references/questions.md) before asking.

1. **Which brain.** Reuse the brain already verified for this request. Otherwise call
   `query` (brains): propose the only known brain or let the person choose among several.
   If none are known, ask for its folder path. Verify the selected brain with
   `check_environment`; do not create a brain or treat the plugin checkout as one.
2. **Capture consent.** Ask through `configuration_question`: "Should GTM OS capture work done
   in this folder into the <company> brain?" Yes / No. Name the selected project so the
   question is unambiguous when the current task is in another folder. Reuse an explicit
   answer already given for this folder and brain. A request to create a folder alone is
   not consent to capture its work. On No or cancellation, stop without writes. Never link
   without a yes. A submitted onboarding selection explicitly asking which projects' work
   to capture supplies this consent; reuse it without another yes per folder. Do not create
   the folder, a context, or a pointer before consent.
3. **Starting context.** Call `query` (contexts) with the chosen `brain`. Reuse a selection
   already given or infer relevant active contexts from the known work. If the purpose is
   unclear, use an empty list and resolve context when work begins. Do not require a mapping
   question or create a context named after each project. Notes route by content across the
   shared brain. Use `new_context` only for an explicitly requested or agreed distinct topic.
4. **Link.** Call `link_project` with the verified brain, selected absolute folder `path`,
   `title` (the person's name or folder name), optional user-specified `slug`, chosen context
   slugs as `contexts`, and the person's known `by` handle. Link Project has already verified
   that the folder exists; omit `create` here. New Project uses `create: true` to prevent
   accidentally attaching or overwriting an existing folder.
   If validation fails, preserve the folder and report the concrete conflict before retrying
   with corrected input. Never write the pointer or registry by hand.
5. **Open and finish.** Follow [opening the linked project](open.md): on macOS, run the
   supported `codex app` launcher for the selected folder through the shell with normal
   permissions. Complete that step instead of handing the command to the person. Always
   include the exact manual fallback when visibility is unverified. Say which project and
   brain were connected and which contexts are open. Do not submit a prompt or start work
   in another task.
   If this task is already in the selected working folder, pass `brain` and `project` in
   subsequent GTM OS tool calls. A task in the brain keeps its brain-wide scope.
   Exception: when linking existing projects selected during onboarding, keep the person
   in the onboarding chat and skip launching each project. The person starts a new chat in
   a selected project when ready to work there; provide opening instructions if it is invisible.

A project is a tag and a local pointer, never a new brain object. `link_project` appends its
marked block to the folder's AGENTS.md without replacing existing instructions. Its local
registry and open contexts live under the brain's `work/`; notes remain central and acquire
`project:<slug>` when recorded. Linking itself does not import project files or write memories.
Use the project's name in normal replies; show the path when needed to choose or open it.
