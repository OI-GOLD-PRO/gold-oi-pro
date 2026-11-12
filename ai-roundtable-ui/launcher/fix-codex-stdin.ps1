$ErrorActionPreference = 'Stop'
$repo = Join-Path $env:USERPROFILE 'oi-gold-ai\ai-roundtable'
$python = Join-Path $repo '.venv\Scripts\python.exe'
$clients = Join-Path $repo 'clients.py'
if (-not (Test-Path -LiteralPath $python)) { throw 'Roundtable Python not found.' }
if (-not (Test-Path -LiteralPath $clients)) { throw 'clients.py not found.' }
$patch = Join-Path ([IO.Path]::GetTempPath()) ('oi-codex-fix-' + [guid]::NewGuid().ToString('N') + '.py')
$code = @'
import ast
import os
import shutil
import sys
import time
from pathlib import Path

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8-sig")
tree = ast.parse(source)
nodes = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "call_openai"]
if len(nodes) != 1:
    raise SystemExit("Unsupported clients.py: call_openai not found exactly once")
node = nodes[0]
lines = source.splitlines(keepends=True)
block = "".join(lines[node.lineno - 1:node.end_lineno])
old = '"--skip-git-repo-check", prompt]'
new = '"--skip-git-repo-check", "-"]'
if new in block and "out = await _run(cmd, stdin_text=prompt)" in block:
    print("Already fixed. Restart OI Gold AI server.")
    raise SystemExit(0)
if block.count(old) != 1 or block.count("out = await _run(cmd)") != 1:
    raise SystemExit("Unsupported clients.py: no changes made")
block = block.replace(old, new).replace("out = await _run(cmd)", "out = await _run(cmd, stdin_text=prompt)")
block = block.replace('Prompt is passed as a\n    positional arg rather than via stdin \u2014 codex exec has a known hang when\n    piped stdin has no writer.', 'Prompt is sent through stdin with an explicit writer and EOF, avoiding\n    Windows command-line length limits for OI and full debate transcripts.')
updated = "".join(lines[:node.lineno - 1]) + block + "".join(lines[node.end_lineno:])
compile(updated, str(path), "exec")
backup = path.with_name(path.name + ".before-stdin-" + str(time.time_ns()) + ".bak")
shutil.copy2(path, backup)
temp = path.with_name(path.name + ".oi-stdin.tmp")
temp.write_text(updated, encoding="utf-8")
os.replace(temp, path)
print("FIXED: Codex receives full prompts via stdin. Backup: " + str(backup))
print("Now restart OI Gold AI server using Stop web, then Open web.")

'@
try {
    [IO.File]::WriteAllText($patch, $code, [Text.UTF8Encoding]::new($false))
    & $python $patch $clients
    if ($LASTEXITCODE -ne 0) { throw 'Patch failed; please send the error shown above.' }
} finally {
    if (Test-Path -LiteralPath $patch) { Remove-Item -LiteralPath $patch }
}

