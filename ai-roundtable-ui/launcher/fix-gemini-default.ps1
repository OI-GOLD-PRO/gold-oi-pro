$ErrorActionPreference = 'Stop'
$repo = Join-Path $env:USERPROFILE 'oi-gold-ai\ai-roundtable'
$python = Join-Path $repo '.venv\Scripts\python.exe'
$clients = Join-Path $repo 'clients.py'
if (-not (Test-Path -LiteralPath $python)) { throw 'Roundtable Python not found.' }
if (-not (Test-Path -LiteralPath $clients)) { throw 'clients.py not found.' }
$patch = Join-Path ([IO.Path]::GetTempPath()) ('oi-gemini-fix-' + [guid]::NewGuid().ToString('N') + '.py')
$code = @'
import ast
import os
import shutil
import sys
import time
from pathlib import Path

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8-sig")
old = 'cmd = [AGY_BIN, "-p", prompt, "--model", model, "--sandbox", "--dangerously-skip-permissions"]'
new = """local_agy = Path(os.environ.get("LOCALAPPDATA", "")) / "agy" / "bin" / "agy.exe"
    executable = str(local_agy) if os.name == "nt" and local_agy.is_file() else AGY_BIN
    # Use the signed-in CLI default model. Analysis requires text only.
    cmd = [executable, "-p", "Reply in text only. Do not use tools.\\n\\n" + prompt]"""
tree = ast.parse(source)
nodes = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "call_gemini"]
if len(nodes) != 1:
    raise SystemExit("Unsupported clients.py: Gemini function missing")
lines = source.splitlines(keepends=True)
node = nodes[0]
block = "".join(lines[node.lineno-1:node.end_lineno])
if new in block:
    print("ALREADY FIXED: Restart OI Gold AI.")
    raise SystemExit(0)
if block.count(old) != 1:
    raise SystemExit("Unsupported clients.py: no changes made")
lines[node.lineno-1:node.end_lineno] = [block.replace(old, new)]
updated = "".join(lines)
compile(updated, str(path), "exec")
backup = path.with_name(path.name + ".before-gemini-" + str(time.time_ns()) + ".bak")
shutil.copy2(path, backup)
temp = path.with_name(path.name + ".gemini.tmp")
temp.write_text(updated, encoding="utf-8")
os.replace(temp, path)
print("FIXED: Gemini uses the signed-in Antigravity default model.")
print("Restart OI Gold AI and check Gemini again.")
'@
try {
    [IO.File]::WriteAllText($patch, $code, [Text.UTF8Encoding]::new($false))
    & $python $patch $clients
    if ($LASTEXITCODE -ne 0) { throw 'Patch failed; please send the error shown above.' }
} finally {
    if (Test-Path -LiteralPath $patch) { Remove-Item -LiteralPath $patch }
}

