/**
 * Rewrite file paths in generated code to use the Pyodide virtual FS output directory.
 */
export function rewriteSavePaths(code: string): string {
  code = code.replace(
    /\.save\(\s*(['"])([^'"]*\.maxpat)\1/g,
    '.save("/output/device.maxpat"'
  );

  code = code.replace(
    /\.save\(\s*(['"])([^'"]*\.amxd)\1/g,
    '.save("/output/device.amxd"'
  );

  code = code.replace(
    /save_amxd\(([^,]+),\s*(['"])([^'"]*\.amxd)\2/g,
    'save_amxd($1, "/output/device.amxd"'
  );

  code = code.replace(
    /open\(\s*(['"])([^'"]*\.maxpat)\1\s*,\s*(['"])w\3\)/g,
    'open("/output/device.maxpat", "w")'
  );

  return code;
}
