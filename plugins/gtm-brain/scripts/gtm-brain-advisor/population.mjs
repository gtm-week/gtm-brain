#!/usr/bin/env node
// The population of the brain: is it too full or too empty? (query with object population)
//   node population.mjs [<root>]            the numbers, each with its range, for the model to relay
//   node population.mjs [<root>] --json     the numbers as data
//   node population.mjs [<root>] --fresh    computed again, past the hourly cache
// Reads the brain (lib/population.mjs); writes only its cache, work/population.json.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isBrain as isBrainDir } from "../../lib/brain-paths.mjs";
const pop = await import(new URL("../../lib/population.mjs", import.meta.url));
const args = process.argv.slice(2); const root = args[0] && !args[0].startsWith("--") ? args.shift() : ".";
if (!isBrainDir(root)) { console.error("no brain here"); process.exit(1); }
const p = pop.population(root, { cache: !args.includes("--fresh") });
console.log(args.includes("--json") ? JSON.stringify({ ...p, ranges: pop.POPULATION_RANGES, out_of_range: pop.outOfRange(p) }, null, 1) : pop.populationText(p));
