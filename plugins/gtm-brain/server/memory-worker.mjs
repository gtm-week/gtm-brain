import { parentPort } from 'node:worker_threads';
import { withMemoryIndex } from '../lib/memory-index.mjs';
import { keywordRecall } from '../lib/keyword-recall.mjs';
import { memoryIndexMaintenance } from '../lib/memory-maintenance.mjs';
import { answer, search } from '../lib/memory-search.mjs';
import { relationsAnswer } from '../lib/relation-log.mjs';
parentPort.on('message', ({ id, root, operation, args }) => {
  try {
    const result = operation === 'maintenance' ? memoryIndexMaintenance(root, args)
      : operation === 'recall' ? keywordRecall(root, args.query, args.project)
      : operation === 'answer' ? answer(root, args.search, args)
      : operation === 'search' ? search(root, args.search, args)
      : withMemoryIndex(root, index => operation === 'count' ? index.count() : operation === 'sql' ? index.sql(args.sql, args) : operation === 'entities' ? index.entities(args) : operation === 'relations' ? relationsAnswer(index, args) : index.query(args));
    parentPort.postMessage({ id, result });
  } catch (e) { parentPort.postMessage({ id, error: e.message }); }
});
