/**
 * A component's props, read from its own source at build time: the `Props` type in its
 * frontmatter (with each field's JSDoc) and the defaults where it destructures
 * `Astro.props`. The table cannot drift from the component.
 */
import ts from "typescript";

export interface PropRow {
  name: string;
  type: string;
  required: boolean;
  fallback?: string;
  description?: string;
}

const sources = import.meta.glob<string>("/src/{components,sections}/**/*.astro", {
  query: "?raw",
  import: "default",
  eager: true,
});

const jsDoc = (node: ts.Node) =>
  ts
    .getJSDocCommentsAndTags(node)
    .map((doc) => (typeof doc.comment === "string" ? doc.comment : ""))
    .join(" ")
    .trim() || undefined;

/** `component` is a path under src without the extension: "components/ui/Button". */
export function readProps(component: string): { rows: PropRow[]; extends: string[] } {
  const raw = sources[`/src/${component}.astro`];
  if (raw === undefined) throw new Error(`No component at src/${component}.astro`);
  const code = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const file = ts.createSourceFile("props.ts", code, ts.ScriptTarget.Latest, true);

  const types = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();
  const defaults = new Map<string, string>();
  file.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) types.set(node.name.text, node);
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (!ts.isObjectBindingPattern(decl.name) || !decl.initializer?.getText(file).startsWith("Astro.props")) continue;
      for (const el of decl.name.elements) {
        if (el.initializer) defaults.set((el.propertyName ?? el.name).getText(file), el.initializer.getText(file));
      }
    }
  });

  const rows: PropRow[] = [];
  const unresolved: string[] = [];
  const add = (members: readonly ts.TypeElement[]) => {
    for (const m of members) {
      if (!ts.isPropertySignature(m) || !m.name) continue;
      const name = m.name.getText(file);
      rows.push({
        name,
        type: m.type?.getText(file).replace(/\s+/g, " ") ?? "unknown",
        required: !m.questionToken,
        fallback: defaults.get(name),
        description: jsDoc(m),
      });
    }
  };
  const open = (node: ts.TypeNode): void => {
    if (ts.isIntersectionTypeNode(node)) node.types.forEach(open);
    else if (ts.isTypeLiteralNode(node)) add(node.members);
    else unresolved.push(node.getText(file).replace(/\s+/g, " "));
  };
  const props = types.get("Props");
  if (props && ts.isInterfaceDeclaration(props)) add(props.members);
  else if (props) open(props.type);
  return { rows, extends: unresolved };
}
