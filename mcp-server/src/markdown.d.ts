// Resolved at build time by esbuild's text loader (--loader:.md=text).
// In dev (tsx) the same loader needs to be configured separately if `.md`
// imports are ever exercised before bundling — currently SKILL.md is only
// imported by index.ts which is always bundled before being shipped.
declare module '*.md' {
  const content: string;
  export default content;
}
