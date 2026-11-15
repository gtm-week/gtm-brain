---
title: Projects
words: project projects folder linked link unlink pointer working tag
attach: link_project unlink_project
---
Work happens in the person's own folders. A folder linked to this brain (`/gtm-brain-project`) is
a **project**: a tag `project:<slug>` on the notes written from there and its own set of open
contexts, never its own memories or covers. Everything still lands here, in the one brain.

**A chat in a project works in that project (rule 1c).** When the opening lines start with
`PROJECT <slug>`, pass it as `project` in every GTM Brain call (`load_context`, `query`,
`remember`, `interact`, `new_context`, `fork_context`, `archive_context`): the loaded set is the
project's own, and every note from here is tagged with it. Say the project's name, never its
folder path. In the brain's own chat, omit `project`. `query` still searches the whole brain and
lists this project's hits first: a project fences nothing off.
