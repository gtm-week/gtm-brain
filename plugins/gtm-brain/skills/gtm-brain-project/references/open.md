# Open the linked project

After a successful `link_project`, open the selected working folder as the final step of
New Project or Link Project. Reuse the returned absolute project path. A failed link never
reaches this step. If the person asked to link without opening, respect that choice.

On macOS, run `codex app <absolute-project-path>` through the shell with normal permission
prompts. The linking tool prints a shell-quoted command; keep its quoting intact. Announce
that you are opening the project, then run it once with a bounded timeout. Do not ask an
extra preference question. If the current task is already in that folder, another open is
unnecessary. `GTM_BRAIN_NO_OPEN` and noninteractive test runs skip launching.

This is the supported desktop launcher, not Computer Use. Do not edit Codex's private state,
drive its interface, or dispatch a new-thread URL to register the project. A permission
denial is final for this attempt: do not retry through another launcher. If the command is
missing, fails, times out, or offers an installer, preserve the successful GTM Brain link and
give the fallback. Do not install an application as part of linking a project.

On Windows the CLI prints the workspace path instead of opening it. On other platforms,
or when desktop launching is unavailable, go straight to the fallback.

## Visibility safeguard

Link success and launcher exit code zero do not confirm that the project is visible in
the sidebar. Say "Connected <project>; asked Codex to open its folder" after a successful
launch request. Never claim sidebar visibility without explicit evidence from a supported
tool or the person. Do not inspect the UI just to confirm opening.

Until visibility is confirmed, always include these steps in the final reply in the person's
language, substituting the actual project name and absolute path. Use the menu labels for
their known app; show both variants only when the host version is unknown:

1. Open Codex. In the sidebar, choose **New project** (or **+** beside Projects). In the
   ChatGPT desktop app, open **Projects**, choose **Create** / **New project**, then add a
   local folder using **Add folder** / **Choose source folders**.
2. Select `<absolute-project-path>`, the linked working folder. On macOS, press
   **Cmd+Shift+G** in the folder picker, paste that exact path, press **Return**, then
   **Open**. If a project creation form remains, name it `<project-name>` and save it.
3. Select the project in the sidebar and start a **New task** / **New chat** there.

Introduce this with "If you don't see <project> in the sidebar:" after a launch request,
or "The folder is connected. To open it manually:" when launching was skipped or failed.
Do not repeat the linking workflow or capture-consent question. Keep the existing task in
its original folder; the person starts the next task in the new project.

Source: [OpenAI's `codex app` reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli#codex-app)
documents opening a workspace on macOS and printing its path on Windows. It supplies no
sidebar-visibility confirmation.
