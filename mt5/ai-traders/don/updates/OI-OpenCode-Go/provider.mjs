import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const file = join(homedir(), '.oi-gold-ai-trader', 'opencode-go.json');
const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : null;
const go = config !== null;
let key = process.env.DEEPSEEK_API_KEY;
if (go) {
  if (!config.model || !config.secret) throw Error('Invalid OpenCode Go settings');
  const command = "$ErrorActionPreference='Stop'; $s=ConvertTo-SecureString ([Console]::In.ReadToEnd()); [Console]::Write([Net.NetworkCredential]::new('', $s).Password)";
  key = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',command], {input:config.secret,encoding:'utf8'}).trim();
  if (!key) throw Error('Empty OpenCode Go key');
}
export const ai = {
  key,
  model: go ? config.model : process.env.DEEPSEEK_MODEL || 'deepseek-flash',
  url: go ? 'https://opencode.ai/inference/go/openai/v1/chat/completions' : 'https://api.deepseek.com/chat/completions',
  name: go ? 'OpenCode Go' : 'DeepSeek'
};
console.log('AI provider: ' + ai.name + ' / ' + ai.model);
