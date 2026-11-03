import { parse } from '@babel/parser';

const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);
const VALUES = new Set([
  'ObjectExpression',
  'ArrayExpression',
  'StringLiteral',
  'NumericLiteral',
  'BooleanLiteral',
  'NullLiteral',
]);

const unwrap = (node) => (WRAPPERS.has(node?.type) ? unwrap(node.expression) : node);

/* Walks every node with its parent and grandparent. */
const walk = (node, visit, parent, grandparent) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent, grandparent);
  for (const [key, child] of Object.entries(node)) {
    if (key === 'loc' || key === 'extra') continue;
    for (const c of Array.isArray(child) ? child : [child]) walk(c, visit, node, parent);
  }
};

/* Replaces identifiers that point at a const object, array or literal with its source, until none are left. */
export const inlineConstants = (code, maxPasses = 20) => {
  for (let pass = 0; pass < maxPasses; pass++) {
    let ast;
    try {
      ast = parse(code, { sourceType: 'module', plugins: ['typescript'], errorRecovery: true });
    } catch {
      return code;
    }

    const constants = new Map();
    walk(ast.program, (node) => {
      const init = unwrap(node.init);
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && VALUES.has(init?.type)) {
        constants.set(node.id.name, code.slice(init.start, init.end));
      }
    });

    const edits = [];
    walk(ast.program, (node, parent, grandparent) => {
      if (node.type !== 'Identifier' || !constants.has(node.name)) return;
      const value = constants.get(node.name);
      if (parent.type === 'ObjectProperty' && parent.value === node && grandparent.type === 'ObjectExpression') {
        edits.push([node.start, node.end, parent.shorthand ? `${node.name}: ${value}` : value]);
      } else if (
        (parent.type === 'SpreadElement' && grandparent.type !== 'ObjectPattern') ||
        parent.type === 'ArrayExpression'
      ) {
        edits.push([node.start, node.end, value]);
      }
    });
    if (!edits.length) return code;

    for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
      code = code.slice(0, start) + text + code.slice(end);
    }
  }
  return code;
};
