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
      description: 'Optional label for the free-text field, in the person\'s language. With options it sits under them, for a note or another answer. Without options it names what to type, for example Company website; omit it to show the question alone.' },
  }, required: ['question'],
};

export function buildQuestion(args) {
  if (!args || !nonempty(args.question, 500)) throw Error('question must be a nonempty string of at most 500 characters');
  if (Object.keys(args).some(key => !(key in inputSchema.properties))) throw Error('unsupported question argument');
  if (args.multiple !== undefined && typeof args.multiple !== 'boolean') throw Error('multiple must be a boolean');
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
  // Without choices the host's header already shows the question, so the field repeats nothing and
  // never says "or": an "Or type an answer" box with nothing above it reads as a second question.
  const label = options ? args.text_label || OR_LABEL : args.text_label !== OR_LABEL && args.text_label;
  properties.text = { type: 'string', ...(label ? { title: label } : {}), maxLength: 1000 };
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
