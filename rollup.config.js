import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';
import pkg from './package.json';

const globalName = 'StreamyJsonParser';

const config = {
  input: 'src/index.js',
  
  // Exclude external dependencies so they are not included in the bundle (if any)
  external: Object.keys(pkg.dependencies || {}),

  plugins: [
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**', // Exclude dependencies from transpilation
    }),
  ],

  output: [

    // ESM output (for other Node/React/Vue projects)
    {
      file: pkg.module, // Defined in package.json (e.g., dist/index.esm.js)
      format: 'es',
      exports: 'default'
    },
    
    // Non-minified UMD output (useful for debugging)
    {
      file: pkg.main, // Defined in package.json (e.g., dist/index.js)
      format: 'umd',
      name: globalName
    },

    // Minified UMD output for CDN
    {
      file: pkg.browser,
      format: 'umd',
      name: globalName,
      sourcemap: true, // Generates a source map for debugging
      plugins: [terser()], // Applies Terser minification only to this bundle
    },
  ],
};

export default config;
