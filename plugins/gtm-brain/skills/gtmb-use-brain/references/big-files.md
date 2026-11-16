# Big files: recordings and anything over 25 MB

Git never keeps a recording (audio or video, any size) or a file over 25 MB. The file lives on the
shared drive or in a folder on this computer, and the note that says what it is keeps a pointer to
it. This walk-through runs whenever one turns up: a path in the chat, the refusal from
`add-file.mjs`, or the "Too big for git" or "Recordings stay out of git" line from `save` and the
chat start. Onboarding asks the setting once ([discovery](../../gtmb-start/references/discovery.md),
Step 1); this page is what happens with each file after that.

Keep authored brain content in English. Preserve names, source quotes and the exact approval token `APPROVE`.

## Step 1: read the setting

With `big_files: local` the command below copies the file at once. When the person did not ask
for this file to be kept (it was named by `save` or the chat start, whose line says when the brain
keeps big files on this computer), offer first, naming the file and its size: Yes, move it / No,
leave it. On no, stop; the file stays where it is, unsaved.

```
node "$PLUGIN_ROOT/skills/gtm-brain-add-file/add-file.mjs" <brain> --file "<path>" --big
```

It prints one JSON object: `mode` (`google-drive` or `local`, from `big_files` in `brain/admin.md`),
`name`, `bytes`, `recording`, and `choice`. With `mode: local` it has already copied the file (Step 2b).

When `choice.asked` is false (a brain made before the question existed, or onboarding skipped it),
ask the onboarding question once now, as [questions](../../gtmb-start/references/questions.md)
says, with its one line of why: "Git cannot keep recordings or files over 25 MB, so they need one
home and the brain keeps a link to it." Choices, recommended first: "Google Drive, shared with the
team", "This computer only". Save the answer as the note `Big files: google-drive.` or
`Big files: local.` in `company` (`gtm` in a brain without it; tag `big-files`, source
`user:<handle>`), then never ask again. Local needs `big_files: local` in the workplace info:
propose that change through `approve_change` now and, once the person's APPROVE applied it, run
this step again; until it is applied, leave the file where it is and never place it on Drive.

## Step 2a: google-drive

The Drive connector is the path; never the Drive website and never Computer Use.

1. Check that Google Drive is connected in this chat (its tools are listed; the connect check says
   so). Not connected, or a call fails: say so in one line with the exact error, offer to connect
   it (`gtmb-configure`, "connect my tools"), and ask for the file's Drive link instead
   (free text: "paste the file's Drive link"). A link goes to item 4. No link: the file stays on
   this computer only; say once that teammates will not get it, and stop.
2. One named folder holds every big file: `drive_folder` in the JSON (`big_files_drive_folder:` in
   the workplace info, else "<company> GTM Brain files"). Search for it by exact name, the smallest
   read. Missing: create it when the connector offers folder creation, after one yes/no question
   (Yes, create it / No, skip it); otherwise ask the person to create it.
3. Find before you place: a recording a meeting tool already saved to Drive is searched for by name
   first, and reused when found. Otherwise place it: through the connector only when it offers an
   upload that takes the file from this computer, after one yes/no question naming the file, its
   size and the folder (Yes, upload it / No, keep it here). Never pass the file's bytes through a
   tool call. Without such an upload, ask the person to drag the file into that folder in Drive and
   say when it is there; then search the folder for its name.
4. From the connector's result take the file's link exactly as returned, and the Drive account the
   connector reads (the signed-in address, when it reports one). Build the pointer:

   ```
   node "$PLUGIN_ROOT/skills/gtm-brain-add-file/add-file.mjs" <brain> --drive "<link or file id>" --account "<drive account>"
   ```

   It prints `pointer`: `{kind: "google-drive", account, ref, url}`. A link that is not a Drive
   link is refused with the reason; pass it on in one line.

## Step 2b: local

`--big` copied the file to the big-files folder outside git (`path`), compared the copy with the
original byte for byte and printed `pointer`: `{kind: "file", ref: "<absolute path>"}`. That folder
is not shared: say once that teammates will not get the file.

## Step 3: the note

Save one note through `remember` in the context the file belongs to: what it is (the meeting, its
date, who was there, or what the file shows), with the pointer as a source next to any other
source it came from. Never paste a transcript or the file's content; findings from a transcript
are their own sourced notes, as [remember](remember.md) says. A file with no context to belong to:
ask once which context, offering the two or three likely ones.

## Step 4: the original

The original is only ever deleted after a verified copy or upload and the person's yes, and only
when it sits inside the brain folder, where it would otherwise wait unsaved forever: ask once
(Yes, delete it / No, keep it). A file elsewhere on the computer (Downloads, a project folder)
stays where it is. Then say in two lines where the file lives and which note points to it.

## Hard rules

- Never commit the bytes: no `git add`, no `save` of the file, no copy into the brain or `work/`.
- Pointers come from `add-file.mjs` (`lib/pointers.mjs` `bigFilePointer`), never typed by hand.
- Connectors first; an empty result is a result. Never Computer Use for Drive.
- One question pending at a time; no upload, folder creation or deletion without its yes.
