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
replacement = 'async def call_gemini(prompt: str, model: str = "gemini-3.6-flash-high") -> str:\n    """Use the authenticated Antigravity CLI default model."""\n    local_agy = Path(os.environ.get("LOCALAPPDATA", "")) / "agy" / "bin" / "agy.exe"\n    executable = str(local_agy) if os.name == "nt" and local_agy.is_file() else AGY_BIN\n    prompt = "Reply in text only. Do not use tools.\\n\\n" + prompt\n    if len(prompt) <= 12000:\n        out = await _run([executable, "-p", prompt])\n        text = out.strip()\n        if text:\n            return text\n        raise ModelCallError("agy returned empty output")\n\n    # Send the full prompt through stdin to avoid Windows argv limits.\n    event = {"event": "user", "message": {"content": prompt}}\n    command = [executable, "--input-format", "stream-json", "--output-format", "stream-json"]\n    out = await _run(command, stdin_text=json.dumps(event) + "\\n")\n    for line in reversed(out.splitlines()):\n        try:\n            event = json.loads(line)\n        except json.JSONDecodeError:\n            continue\n        if not isinstance(event, dict) or event.get("event") != "result":\n            continue\n        result = event.get("result")\n        if isinstance(result, dict) and result.get("status") == "SUCCESS":\n            response = result.get("response")\n            if isinstance(response, str) and response.strip():\n                return response.strip()\n        status = result.get("status", "UNKNOWN") if isinstance(result, dict) else "UNKNOWN"\n        raise ModelCallError(f"agy stream did not return an answer (status: {status})")\n    raise ModelCallError("agy stream returned no result")'
tree = ast.parse(source)
nodes = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "call_gemini"]
if len(nodes) != 1:
    raise SystemExit("Unsupported clients.py: Gemini function missing")
node = nodes[0]
lines = source.splitlines(keepends=True)
block = "".join(lines[node.lineno-1:node.end_lineno])
if block.rstrip() == replacement:
    print("ALREADY FIXED: Restart OI Gold AI.")
    raise SystemExit(0)
if 'await _run(cmd)' not in block or 'AGY_BIN' not in block:
    raise SystemExit("Unsupported clients.py: no changes made")
lines[node.lineno-1:node.end_lineno] = [replacement + "\n"]
updated = "".join(lines)
compile(updated, str(path), "exec")
backup = path.with_name(path.name + ".before-gemini-" + str(time.time_ns()) + ".bak")
shutil.copy2(path, backup)
temp = path.with_name(path.name + ".gemini.tmp")
temp.write_text(updated, encoding="utf-8")
os.replace(temp, path)
print("FIXED: Gemini uses stdin for long prompts.")
print("Restart OI Gold AI and check Gemini again.")
'@
try {
    [IO.File]::WriteAllText($patch, $code, [Text.UTF8Encoding]::new($false))
    & $python $patch $clients
    if ($LASTEXITCODE -ne 0) { throw 'Patch failed; please send the error shown above.' }
} finally {
    if (Test-Path -LiteralPath $patch) { Remove-Item -LiteralPath $patch }
}

