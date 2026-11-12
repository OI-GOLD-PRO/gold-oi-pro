$ErrorActionPreference = 'Stop'
$repo = Join-Path $env:USERPROFILE 'oi-gold-ai\ai-roundtable'
$python = Join-Path $repo '.venv\Scripts\python.exe'
$clients = Join-Path $repo 'server.py'
if (-not (Test-Path -LiteralPath $python)) { throw 'Roundtable Python not found.' }
if (-not (Test-Path -LiteralPath $clients)) { throw 'server.py not found.' }
$patch = Join-Path ([IO.Path]::GetTempPath()) ('oi-history-fix-' + [guid]::NewGuid().ToString('N') + '.py')
$code = @'
HANDLER = '        elif action == "resume_oi_session":\n            if engine.state not in ("configuring", "done", "moderator_checkpoint") or (\n                engine._task and not engine._task.done()\n            ):\n                raise RuntimeError("\u0e23\u0e2d\u0e43\u0e2b\u0e49\u0e23\u0e2d\u0e1a\u0e17\u0e35\u0e48\u0e01\u0e33\u0e25\u0e31\u0e07\u0e17\u0e33\u0e2d\u0e22\u0e39\u0e48\u0e08\u0e1a\u0e01\u0e48\u0e2d\u0e19 \u0e41\u0e25\u0e49\u0e27\u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07")\n            session_id = data.get("id")\n            question = data.get("text", "").strip()\n            if not isinstance(session_id, str) or not session_id.endswith(".json") or not question:\n                raise ValueError("\u0e15\u0e49\u0e2d\u0e07\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e41\u0e25\u0e30\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e16\u0e32\u0e21")\n            saved = load_session(session_id)\n            if not saved:\n                raise ValueError("\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e1a\u0e17\u0e2a\u0e19\u0e17\u0e19\u0e32")\n            old = session_from_dict(saved)\n            from engine import Message, Participant\n            participants = [Participant(**p) for p in data["participants"]]\n            if len(participants) < 2:\n                raise ValueError("\u0e15\u0e49\u0e2d\u0e07\u0e21\u0e35\u0e19\u0e31\u0e01\u0e27\u0e34\u0e40\u0e04\u0e23\u0e32\u0e30\u0e2b\u0e4c\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e19\u0e49\u0e2d\u0e22\u0e2a\u0e2d\u0e07\u0e04\u0e19")\n            engine._save()\n            engine.__init__(broadcast)\n            engine.topic = old.topic\n            engine.participants = participants\n            engine.messages = old.messages\n            engine.round_num = max((m.round for m in old.messages), default=0)\n            engine.exchanges_per_round = old.exchanges_per_round\n            engine.reference_material = saved.get("reference_material", "")\n            engine.summary_model = old.summary_model\n            engine.verdict_model = old.verdict_model\n            engine.summary_instruction = old.summary_instruction\n            engine.verdict_instruction = old.verdict_instruction\n            engine.session_file = (TRANSCRIPTS_DIR / session_id).resolve()\n            verdict = next((m.content for m in reversed(old.messages) if m.kind == "verdict"), "")\n            if verdict:\n                question = "\u0e2a\u0e23\u0e38\u0e1b\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22\u0e04\u0e23\u0e31\u0e49\u0e07\u0e01\u0e48\u0e2d\u0e19 (\u0e1a\u0e23\u0e34\u0e1a\u0e17\u0e40\u0e14\u0e34\u0e21):\\n" + verdict + "\\n\\n" + question\n            engine.messages.append(Message("Moderator", question, "moderator", engine.round_num + 1))\n            engine.state = "in_round"\n            engine._save()\n            await broadcast(_oi_init_payload())\n            engine._task = asyncio.create_task(engine._run_round())\n'
from pathlib import Path
import sys, shutil, os, time

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8-sig")
if 'action == "resume_oi_session"' in source:
    print("ALREADY FIXED: Restart OI Gold AI.")
    raise SystemExit(0)
start = '    await ws.send_text(json.dumps({\n        "type": "init",'
end = '    }, ensure_ascii=False))'
anchor = '@app.websocket("/ws")'
marker = '        elif action == "get_session":'
if any(source.count(s) != 1 for s in (start, anchor, marker)):
    raise SystemExit("Unsupported server.py: no changes made")
i = source.index(start)
j = source.index(end, i)
payload = '{\n        "type": "init",' + source[i+len(start):j] + '    }'
updated = source[:i] + '    await ws.send_text(json.dumps(_oi_init_payload(), ensure_ascii=False))' + source[j+len(end):]
updated = updated.replace(anchor, 'def _oi_init_payload():\n    return '+payload+'\n\n\n'+anchor)
updated = updated.replace(marker, HANDLER + marker)
compile(updated, str(path), "exec")
shutil.copy2(path, path.with_name(path.name + ".before-history-" + str(time.time_ns()) + ".bak"))
temp = path.with_name(path.name + ".history.tmp")
temp.write_text(updated, encoding="utf-8")
os.replace(temp, path)
print("FIXED: History can now be resumed. Restart OI Gold AI.")
'@
try {
    [IO.File]::WriteAllText($patch, $code, [Text.UTF8Encoding]::new($false))
    & $python $patch $clients
    if ($LASTEXITCODE -ne 0) { throw 'Patch failed; please send the error shown above.' }
} finally {
    if (Test-Path -LiteralPath $patch) { Remove-Item -LiteralPath $patch }
}

