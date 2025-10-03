import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

// Name of the global variable that will be exposed in the browser (e.g., window.StreamyJsonParser)
const globalName = 'StreamyJsonParser';
const external = Object.keys(pkg.dependencies || {});

// Base configuration for the bundle
const config = {
  input: 'src/index.js',
  
  // Exclude external dependencies so they are not included in the bundle (if any)
  external: external,

  plugins: [
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**', // Exclude dependencies from transpilation
    }),
  ],

  output: [
    // 1. ESM output (for other Node/React/Vue projects)
    {
      file: pkg.module, // Defined in package.json (e.g., dist/index.esm.js)
      format: 'es',
    },
    
    // 2. NON-MINIFIED UMD output (useful for debugging)
    {
      file: pkg.main, // Defined in package.json (e.g., dist/index.js)
      format: 'umd',
      name: globalName,
    },

    // 3. MINIFIED UMD output for CDN (this is what you want for production)
    {
      file: pkg.browser, // New key in package.json (e.g., dist/streamy-json-parser.min.js)
      format: 'umd',
      name: globalName,
      sourcemap: true, // Generates a source map for debugging
      plugins: [terser()], // Applies Terser minification only to this bundle
    },
  ],
};

export default config;
