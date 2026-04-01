import { useState, useEffect, useRef, useCallback } from "react";
import { loadPyodide, PyodideInterface } from "pyodide";

interface PyodideState {
  ready: boolean;
  loading: boolean;
  error: string | null;
}

interface RunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  amxdBytes: Uint8Array | null;
}

export function usePyodide() {
  const [state, setState] = useState<PyodideState>({
    ready: false,
    loading: true,
    error: null,
  });
  const pyodideRef = useRef<PyodideInterface | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/",
        });

        await pyodide.loadPackage("micropip");
        const micropip = pyodide.pyimport("micropip");
        await micropip.install("maxpylang");

        // Create output directory in virtual FS
        pyodide.FS.mkdir("/output");

        if (!cancelled) {
          pyodideRef.current = pyodide;
          setState({ ready: true, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            ready: false,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load Pyodide",
          });
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const runCode = useCallback(async (code: string): Promise<RunResult> => {
    const pyodide = pyodideRef.current;
    if (!pyodide) {
      return { success: false, stdout: "", stderr: "Pyodide not ready", amxdBytes: null };
    }

    // Clean output directory
    try {
      const files = pyodide.FS.readdir("/output") as string[];
      for (const f of files) {
        if (f !== "." && f !== "..") {
          pyodide.FS.unlink(`/output/${f}`);
        }
      }
    } catch {
      // Directory might not exist yet
      try { pyodide.FS.mkdir("/output"); } catch { /* already exists */ }
    }

    // Write the amxd helper module into the virtual FS so `from amxd import save_amxd` works.
    await pyodide.runPythonAsync(`
import os, shutil, importlib
spec = importlib.util.find_spec("maxpylang.amxd")
if spec and spec.origin:
    shutil.copy2(spec.origin, "/output/amxd.py")
`);

    // Capture stdout/stderr
    let stdout = "";
    let stderr = "";

    pyodide.setStdout({ batched: (text: string) => { stdout += text + "\n"; } });
    pyodide.setStderr({ batched: (text: string) => { stderr += text + "\n"; } });

    try {
      await pyodide.runPythonAsync(code);

      // Look for .amxd file in /output
      let amxdBytes: Uint8Array | null = null;
      try {
        const files = pyodide.FS.readdir("/output") as string[];
        const amxdFile = files.find((f: string) => f.endsWith(".amxd"));
        if (amxdFile) {
          amxdBytes = pyodide.FS.readFile(`/output/${amxdFile}`) as Uint8Array;
        }
      } catch {
        // No .amxd found
      }

      return { success: !!amxdBytes, stdout, stderr, amxdBytes };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, stdout, stderr: stderr + "\n" + errorMsg, amxdBytes: null };
    }
  }, []);

  return { ...state, runCode };
}
