# Files

A file in the chat (a path, a dropped PDF or image, "save this deck", "add this to the design
system", "this is the Acme logo") is everyday work, not a skill to invoke: land it beside its
owner, attach it when the owner is a person, company or product, and record what it says as
sourced notes. A file already in a project folder stays there.

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

## Step 1: the file

A path in the message is the file. A dropped image reaches Codex as pixels with no path, and
"here is the deck" with nothing attached reaches it as words: in both cases ask once
(free text) for the file's location, saying that dragging the file from Finder
into the chat pastes its path. Do not search the disk for it.

## Step 2: land it

Name the owner when it is clear from the request: a document by slug or path (`--document
design-system`, `--document brand/design-system`), an entity by name (`--entity "Positive
Surfer"`). The file then lands beside its owner: for a document, its own folder (the first file
moves the document into a folder of its name, `design-system.md` becoming
`design-system/design-system.md`; the JSON says so under `moved`), or `brain/entities/<id>/`
next to the entity file. A file with no owner is refused: nothing lands
in the brain unasked. When the owner is not obvious, ask once offering the two
or three most likely documents or entities, then run, through the shell:

```
node "$PLUGIN_ROOT/skills/gtm-brain-add-file/add-file.mjs" <brain> --file "<path>" [--document <ref> | --entity "<name>"]
```

It prints one JSON object. `path` is where the file now lives, relative to `base` (`brain`, or
`project` with the project slug); `copied` says whether it was copied or referenced where it
already was; `owner` names the document or entity it landed beside; `kind` is image, pdf,
document or other; `text` is the extracted text file when there is one; `note` explains
anything unusual (already in the brain, no text extractor). It refuses folders, missing files,
a file with no owner, an unknown document or entity (register one with `add_name` first) and
anything over 25 MB, with the reason: pass that reason on in one line and stop.

## Step 3: attach it (entity files)

A file for a document needs no further record: the folder is the record, and `save` keeps it.
A file for a person, company or product is attached through `remember` with `asset`, following
the attachment rules in [remember](remember.md#attach-files-to-an-entity). The role follows the
kind: document (a PDF or deck), screenshot, product-photo, portrait, primary-logo. Status is
draft unless the person said it is approved. Pass `path` exactly as the script printed it, and
`project` when `base` is project.

## Step 4: learn from it

When `text` is present, read it and record what a colleague would want to know (decisions,
numbers, dates, who is involved) as sourced notes in the fitting context: `sources`
`[{ kind: "file", ref: "<path>" }]`, people named, nothing pasted in full. Follow the
gtm-brain-sync rule: what happened, never what should happen next. Skip a file that is only an
image unless asked to describe it. Without `text`, say so in one line; the attachment stands.

## Step 5: say what happened

Three lines: where the file landed (relative path, copied or referenced, beside which owner),
what it is attached to (entity, role, status) when it is an entity file, what was recorded
(how many notes, which context). No next step.

## Hard rules

- Never move, rename or delete the person's original file; a file from outside lands in the brain as a copy.
- Never overwrite a file in the brain; a different file with the same name gets a suffix.
- The extraction under `work/` is derived and disposable; the notes cite the file, not it.

## From the brain rules: attachments

A file the person hands over goes through gtm-brain-use-brain's references/files.md: it lands beside
its owner (a document's files folder, or `brain/entities/<id>/` for a person, company or product;
a file with no owner is refused, so ask what it belongs to; a project file stays in its project
folder), an entity file is attached, and its content is noted. Under the hood attachments are
`remember` with its optional `asset` field. Each attachment belongs
to an existing entity and one memory; one file can have several entity relationships. Use a
readable label, role and draft/approved/retired status. File paths remain references: no upload
or folder scan; a file in `work/` is copied beside its owner when attached. Read the remember
workflow reference before attaching or replacing.
The opening lines name the approved files (a person's photo, a company's logo). Use exactly those
for a graphic, page or deck, never a copy in a task folder or a package's own asset list; ask if
several approved files match or only drafts exist. When the person says use another photo or logo,
that is the new approved file for the same role: attach it in the same turn, and it replaces the
old one in every chat. "Where is this set" is answered with the person's or company's page on the
dashboard and how to change it, in one line.
Resolve relative paths against the recorded brain or linked project, never this chat's cwd.
Retire with a new memory that supersedes the current attachment in its context.
Never delete the source file. Missing files are repaired through Codex. The dashboard is a
read-only view of these fields, with previews, file links and collapsed attachment history.
