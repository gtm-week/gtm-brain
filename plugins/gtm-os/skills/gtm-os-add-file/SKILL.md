---
name: gtm-os-add-file
description: |
  Put a PDF, an image, a deck or any other file into the brain: land it in the brain's files
  folder (or reference it where it already is), attach it to the person, company or product it
  belongs to, and record what it says as sourced notes. Triggers: "/gtm-os-add-file", "add this
  file", "put this PDF in the brain", "attach this", "upload", "save this deck", a file path or
  a dropped file in the chat.
allowed-tools: [Bash, Read]
---

# GTM OS: Add a file

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

> For humans: drop a file in, say who it belongs to, and it is in the brain: kept in the
> brain's files folder, attached to that person or company, and what it says is written down
> with the file as the source. A file already in a project folder stays there.

## Step 1: the file

A path in the message is the file. A dropped image reaches Codex as pixels with no path, and
"here is the deck" with nothing attached reaches it as words: in both cases ask once with
`question` (free text) for the file's location, saying that dragging the file from Finder
into the chat pastes its path. Do not search the disk for it.

## Step 2: land it

Run, through the shell:

```
node "$PLUGIN_ROOT/skills/gtm-os-add-file/add-file.mjs" <brain> --file "<path>"
```

It prints one JSON object. `path` is where the file now lives, relative to `base` (`brain`, or
`project` with the project slug); `copied` says whether it was copied into `files/<yyyy-mm>/`
or referenced where it already was; `kind` is image, pdf, document or other; `text` is the
extracted text file when there is one; `note` explains anything unusual (already in the brain,
no text extractor). It refuses folders, missing files and anything over 25 MB, with the reason:
pass that reason on in one line and stop.

## Step 3: attach it

Attach through `remember` with `asset`, following the attachment rules in
[remember](../gtm-os-use-brain/references/remember.md#attach-files-to-an-entity). Decide the
entity from the request or the file name; when it is not obvious, ask once with `question`
offering the two or three most likely entities. A new entity is registered with `add_name`
first. The role follows the kind: document (a PDF or deck), screenshot, product-photo, portrait,
primary-logo. Status is draft unless the person said it is approved. Pass `path` exactly as
the script printed it, and `project` when `base` is project.

## Step 4: learn from it

When `text` is present, read it and record what a colleague would want to know (decisions,
numbers, dates, who is involved) as sourced notes in the fitting context: `sources`
`[{ kind: "file", ref: "<path>" }]`, people named, nothing pasted in full. Follow the
gtm-os-sync rule: what happened, never what should happen next. Skip a file that is only an
image unless asked to describe it. Without `text`, say so in one line; the attachment stands.

## Step 5: say what happened

Three lines: where the file landed (relative path, copied or referenced), what it is attached
to (entity, role, status), what was recorded (how many notes, which context). No next step.

## Hard rules

- Never move, rename or delete the person's original file; a copy lands in the brain.
- Never overwrite a file in `files/`; a different file with the same name gets a suffix.
- The extraction under `work/` is derived and disposable; the notes cite the file, not it.
