/**
 * Words on screen come from `labels`, so a host can translate all of them.
 *
 * This reads every component of the viewer and fails on a word written straight
 * into the markup: text between tags, or a string in an attribute a screen
 * reader or a tooltip speaks (`aria-label`, `title`, `label`, ...). It does not
 * judge values built from other values (`label={tip}`), nor code, class names,
 * keys or numbers — only a string you can read in the source.
 *
 * When it fails: add the string to `ViewerLabels` (viewer/labels.ts), read it with
 * `useViewerLabels()`, and fill in `{marks}` with `fillLabel`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = path.join(root, 'src/viewer-react/components');

/** Attributes whose text reaches a person: shown, spoken or put in a tooltip. */
const SPOKEN = new Set([
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'aria-roledescription',
  'title',
  'label',
  'placeholder',
  'alt',
  'hint',
  'message',
  'confirmLabel',
  'cancelLabel',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
  });
}

/** Words, not symbols: three letters in a row. */
const hasWords = (text: string) => /\p{L}{3,}/u.test(text);

function hardCoded(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];
  const note = (node: ts.Node, text: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${path.relative(root, file)}:${line + 1}  ${text.replace(/\s+/g, ' ').trim()}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.getText())) note(node, node.getText());
    if (ts.isJsxAttribute(node) && node.initializer && SPOKEN.has(node.name.getText())) {
      const value = node.initializer;
      if (ts.isStringLiteral(value) && hasWords(value.text)) {
        note(value, `${node.name.getText()}="${value.text}"`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('labels cover the viewer', () => {
  it('has no word written straight into a component', () => {
    const files = walk(COMPONENTS);
    expect(files.length).toBeGreaterThan(20);
    expect(files.flatMap(hardCoded)).toEqual([]);
  });

  it('would notice one', () => {
    // The check itself: a text node and an attribute are both caught.
    const probe = path.join(root, 'scripts/.probe.tsx');
    const code = `export const A = () => <button aria-label="Close panel">Save changes</button>;`;
    const source = ts.createSourceFile(
      probe,
      code,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TSX,
    );
    const words: string[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isJsxText(n) && hasWords(n.getText())) words.push(n.getText());
      if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) {
        if (SPOKEN.has(n.name.getText()) && hasWords(n.initializer.text))
          words.push(n.initializer.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(source);
    expect(words).toEqual(['Close panel', 'Save changes']);
  });
});
