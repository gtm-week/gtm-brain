# Files

A file in the chat (a path, a dropped PDF or image, "save this deck", "add this to the design
system", "this is the Acme logo") is everyday work, not a skill to invoke: land it beside its
owner, attach it when the owner is a person, company or product, and record what it says as
sourced notes. A file already in a project folder stays there.

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

## Step 1: the file

A path in the message is the file. A dropped image reaches Codex as pixels with no path, and
"here is the deck" with nothing attached reaches it as words: in both cases ask once with
`question` (free text) for the file's location, saying that dragging the file from Finder
into the chat pastes its path. Do not search the disk for it.

## Step 2: land it

Name the owner when it is clear from the request: a document by slug or path (`--document
design-system`, `--document brand/design-system`), an entity by name (`--entity "Positive
Surfer"`). The file then lands beside its owner: the document's files folder
(`brand/design-system/`, or the document's own folder when it lives there alone), or
`brain/entities/<id>/` next to the entity file. A file with no owner is refused: nothing lands
in the brain unasked. When the owner is not obvious, ask once with `question` offering the two
or three most likely documents or entities, then run, through the shell:

```
node "$PLUGIN_ROOT/skills/gtm-os-add-file/add-file.mjs" <brain> --file "<path>" [--document <ref> | --entity "<name>"]
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
gtm-os-sync rule: what happened, never what should happen next. Skip a file that is only an
image unless asked to describe it. Without `text`, say so in one line; the attachment stands.

## Step 5: say what happened

Three lines: where the file landed (relative path, copied or referenced, beside which owner),
what it is attached to (entity, role, status) when it is an entity file, what was recorded
(how many notes, which context). No next step.

## Hard rules

- Never move, rename or delete the person's original file; a copy lands in the brain.
- Never overwrite a file in the brain; a different file with the same name gets a suffix.
- The extraction under `work/` is derived and disposable; the notes cite the file, not it.
