import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Load the production token modules for isolated screen tests. No copied palette
// constants: visual expectations must exercise the same values as the app.
export function loadVisualTokenModules({ dark = false } = {}) {
  const cache = new Map();
  const react = { createContext: value => ({ value }), useContext: context => context.value };
  const rn = { Platform: { select: value => value.default }, useColorScheme: () => dark ? 'dark' : 'light' };
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    const source = readFileSync(new URL(`../../src/${name}.ts`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports: module.exports, module, require(specifier) {
      if (specifier === 'react') return react;
      if (specifier === 'react-native') return rn;
      if (specifier === './theme') return load('theme');
      throw new Error(`Unexpected token dependency: ${specifier}`);
    } }, { filename: `src/${name}.ts` });
    cache.set(name, module.exports); return module.exports;
  }
  return { theme: load('theme'), appearance: load('appearance'), typography: load('typography') };
}
