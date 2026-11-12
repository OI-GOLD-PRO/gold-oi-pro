from pathlib import Path
import base64
import gzip
import json
import struct
import subprocess

src = Path(__file__).resolve().parent
output = Path('/mnt/data/OI-Gold-AI.exe')
script = (src / 'launcher.ps1').read_bytes()
compressed = base64.b64encode(gzip.compress(script, mtime=0)).decode()
bootstrap = (
    "$ErrorActionPreference='Stop';"
    f"$bytes=[Convert]::FromBase64String('{compressed}');"
    "$stream=[IO.MemoryStream]::new($bytes);"
    "$gzip=[IO.Compression.GZipStream]::new($stream,[IO.Compression.CompressionMode]::Decompress);"
    "$reader=[IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8);"
    "& ([scriptblock]::Create($reader.ReadToEnd()))"
)
encoded = bootstrap
assert len(encoded) < 32000
(src / 'payload.h').write_text('static const wchar encoded_script[] = L' + json.dumps(encoded) + ';\n')

def run(*args):
    subprocess.run(args, cwd=src, check=True)

run('gcc', '-c', '-mabi=ms', '-fshort-wchar', '-mno-red-zone', '-ffreestanding',
    '-fno-stack-protector', '-fno-asynchronous-unwind-tables', '-fno-ident', '-Os', 'stub.c', '-o', 'stub.o')
run('ld', '-mi386pep', '--subsystem', 'windows', '--entry', 'start', '--no-insert-timestamp',
    '--image-base', '0x140000000', '-o', 'stub.exe', 'stub.o')
data = bytearray((src / 'stub.exe').read_bytes())
symbols = subprocess.check_output(['nm', 'stub.exe'], cwd=src, text=True)
locations = {p[2]: int(p[0], 16) - 0x140000000 for l in symbols.splitlines()
             if len(p := l.split()) == 3 and p[2] in ('win', 'import_space')}
pe = struct.unpack_from('<I', data, 0x3c)[0]
optional = pe + 24
section = optional + struct.unpack_from('<H', data, pe + 20)[0]
sections = struct.unpack_from('<H', data, pe + 6)[0]
for i in range(sections):
    header = section + 40*i
    if data[header:header+8] == b'.imports':
        _, section_rva, _, section_raw = struct.unpack_from('<IIII', data, header + 8)
        break
else:
    raise ValueError('Missing imports section')

def offset(rva):
    return rva - section_rva + section_raw

base = locations['import_space']
iat = locations['win']
payload = bytearray(60)
def add(blob, alignment=1):
    payload.extend(bytes(-len(payload) % alignment))
    rva = base + len(payload)
    payload.extend(blob)
    return rva

for index, (dll, names, slot) in enumerate([
    ('KERNEL32.dll', ('GetSystemDirectoryW','CreateProcessW','WaitForSingleObject',
                     'GetExitCodeProcess','CloseHandle','ExitProcess'), iat),
    ('USER32.dll', ('MessageBoxW',), iat + 56),
]):
    dll_rva = add(dll.encode() + b'\0')
    names_rva = [add(b'\0\0' + name.encode() + b'\0', 2) for name in names]
    thunks = struct.pack('<' + 'Q' * (len(names_rva) + 1), *names_rva, 0)
    original = add(thunks, 8)
    struct.pack_into('<IIIII', payload, index*20, original, 0, 0, dll_rva, slot)
    data[offset(slot):offset(slot)+len(thunks)] = thunks

data[offset(base):offset(base)+len(payload)] = payload
struct.pack_into('<II', data, optional + 112 + 8, base, len(payload))
struct.pack_into('<II', data, optional + 112 + 8*12, iat, 72)
output.write_bytes(data)
