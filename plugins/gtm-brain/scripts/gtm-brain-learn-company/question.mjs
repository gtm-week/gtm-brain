// Native MCP forms for onboarding. Transient input, never a brain write or approval.
const nonempty = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

const OR_LABEL = 'Or type an answer';

export const inputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    question: { type: 'string', minLength: 1, maxLength: 500, description: 'One short question in the person\'s language.' },
    options: { type: 'array', minItems: 2, maxItems: 8, uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 100 },
      description: 'Concrete choices, recommended first. Always pass them for a yes/no or permission question. Omit only when the answer is a name, a link or other free text.' },
    multiple: { type: 'boolean', description: 'True for independent checkbox selections; otherwise radio choices.' },
    text_label: { type: 'string', minLength: 1, maxLength: 100,
      description: 'Optional label for a free-text field, in the person\'s language. With options, omit it: the host shows one field per page, so it adds a second step after the choices. Pass it only when a note is really needed, for example Add a note. Without options it names what to type, for example Company website; omit it to show the question alone.' },
  }, required: ['question'],
};

export function buildQuestion(args) {
  if (!args || !nonempty(args.question, 500)) throw Error('question must be a nonempty string of at most 500 characters');
  // brain and project route every other GTM Brain tool and the shared description asks for them: a
  // form needs neither, so they are ignored, never a refusal (FDE OS, 2026-10-01).
  const unknown = Object.keys(args).filter(key => !(key in inputSchema.properties) && key !== 'brain' && key !== 'project');
  if (unknown.length) throw Error(`unsupported question argument: ${unknown.join(', ')}`);
  if (args.multiple !== undefined && typeof args.multiple !== 'boolean') throw Error('multiple must be a boolean');
  // A blank text_label ("" or spaces) means "no note field", which is what omitting it means: treat it as omitted.
  if (typeof args.text_label === 'string' && !args.text_label.trim()) args = { ...args, text_label: undefined };
  if (args.text_label !== undefined && !nonempty(args.text_label, 100)) throw Error('invalid text_label');
  const options = args.options;
  if (options !== undefined && (!Array.isArray(options) || options.length < 2 || options.length > 8 ||
      options.some(o => !nonempty(o, 100)) || new Set(options.map(o => o.trim())).size !== options.length)) {
    throw Error('options must contain 2-8 distinct nonempty labels');
  }
  if (args.multiple && !options) throw Error('multiple requires options');
  const properties = {};
  if (options) properties.selection = args.multiple
    ? { type: 'array', title: args.question, items: { type: 'string', enum: options }, minItems: 0, maxItems: options.length }
    : { type: 'string', title: args.question, enum: options };
  // The host shows one field per page. A text field next to choices is a second step ("2 of 2"),
  // so a choice question carries one only when the caller names it. Without choices the host's
  // header already shows the question, so the field repeats nothing. The old default label is
  // dropped either way: the model used to copy it, and alone on its page it reads as a second question.
  const label = args.text_label !== OR_LABEL && args.text_label;
  if (!options || label) properties.text = { type: 'string', ...(label ? { title: label } : {}), maxLength: 1000 };
  // No defaults and no autoResolutionMs metadata. Only a submitted value is an answer.
  return { mode: 'form', message: args.question, requestedSchema: { type: 'object', properties, required: [] } };
}

export function readAnswer(args, result) {
  if (result?.action === 'cancel' || result?.action === 'decline') return { status: result.action === 'cancel' ? 'cancelled' : 'declined' };
  if (result?.action !== 'accept' || !result.content || typeof result.content !== 'object') throw Error('invalid form response');
  const { selection, text = '' } = result.content;
  if (typeof text !== 'string' || text.length > 1000) throw Error('invalid text answer');
  if (Object.keys(result.content).some(key => !['selection', 'text'].includes(key))) throw Error('unexpected answer field');
  let selections = [];
  if (selection !== undefined && !(selection === '' && !args.multiple)) {
    if (!args.options) throw Error('this question has no selectable options');
    if (args.multiple ? !Array.isArray(selection) : typeof selection !== 'string') throw Error('invalid selection type');
    selections = args.multiple ? selection : [selection];
    if (selections.some(s => !args.options.includes(s)) || new Set(selections).size !== selections.length) throw Error('invalid selection');
  }
  if (!selections.length && !text.trim()) return { status: 'unanswered' };
  return { status: 'answered', selections, text: text.trim() };
}
