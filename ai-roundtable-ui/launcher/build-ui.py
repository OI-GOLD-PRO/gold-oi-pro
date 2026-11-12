from pathlib import Path
import re,json,hashlib,base64
root=Path(__file__).resolve().parent
out=root.parent if root.parent.name=='ai-roundtable-ui' else root.parent/'ai-roundtable-ui';out.mkdir(exist_ok=True)
parts=['// OI Gold AI browser extensions. AGPL-3.0-or-later.\n// Source: OI-GOLD-PRO/gold-oi-pro/ai-roundtable-ui\n']
for name in ('mobile.html','oi-data.html'):
    html=(root/name).read_text()
    for tag,body in re.findall(r'<(style|script)>(.*?)</\1>',html,re.S):
        if tag=='style':parts.append('{const css=document.createElement("style");css.textContent='+json.dumps(body,ensure_ascii=False)+';document.head.append(css);}\n')
        else:parts.append(body+'\n')
code='\n'.join(parts)
digest=hashlib.sha256(code.encode()).hexdigest()
manifest={'schema':1,'version':'1.0.0','file':'ui-'+digest+'.js','sha256':digest}
(out/manifest['file']).write_text(code)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
fallback=json.dumps({**manifest,'code':code},ensure_ascii=False).replace('<','\\u003c')
loader=(root/'update-loader.js').read_text().replace('__FALLBACK_JSON__',fallback)
(root/'update-loader-built.js').write_text(loader)
markup='<!-- OI Gold central updater v1 -->\n<script>\n'+loader+'\n</script>\n<!-- OI Gold central updater end -->\n'
(root/'update-loader.html').write_text(markup)
p=root/'launcher.ps1';s=p.read_text()
start=s.index('    $page = [IO.File]::ReadAllText($pagePath)',s.index('# Use secure WebSockets'))
# The first read follows the pagePath assignment; retain HTTPS replacement above it.
start=s.index('    $page = [IO.File]::ReadAllText($pagePath)',s.index("$newSocket ="))
stop=s.index("    $ready = Join-Path $repo",start)
block='''    $page = [IO.File]::ReadAllText($pagePath)
    if (-not $page.Contains('<!-- OI Gold central updater v1 -->')) {
        $updateBackup = $pagePath + '.before-central-updater'
        if (-not (Test-Path -LiteralPath $updateBackup)) { [IO.File]::Copy($pagePath, $updateBackup) }
        # Remove earlier embedded extensions before adding their centrally managed version.
        $page = [regex]::Replace($page, '(?s)<!-- OI Gold mobile layout v1 -->.*?</script>\\s*', '')
        $page = [regex]::Replace($page, '(?s)<!-- OI Gold data connector v1 -->.*?<!-- OI Gold data connector end -->\\s*', '')
        $updateMarkup = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('PAYLOAD'))
        $page = $page.Replace('</body>', $updateMarkup + '</body>')
        $tempPage = $pagePath + '.oi-update.tmp'
        [IO.File]::WriteAllText($tempPage, $page, [Text.UTF8Encoding]::new($false))
        [IO.File]::Replace($tempPage, $pagePath, $null)
    }
'''.replace('PAYLOAD',base64.b64encode(markup.encode()).decode())
s=s[:start]+block+s[stop:]
s=s.replace('function Start-Roundtable([bool]$openBrowser) {\n    if', 'function Start-Roundtable([bool]$openBrowser) {\n    Install-IfNeeded\n    if')
s=s.replace('    } else {\n        Install-IfNeeded\n', '    } else {\n')
p.write_text(s)
print(manifest['file'])
