const { execSync } = require('child_process');

try {
  const cmd = `powershell -NoProfile -Command "$errors = $null; $tokens = $null; $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'bot_watchdog.ps1'), [ref]$tokens, [ref]$errors); if ($errors.Count -eq 0) { Write-Host 'POWERSHELL SYNTAX VALID' } else { $errors | ForEach-Object { Write-Host $_.Message } }"`;
  const out = execSync(cmd, { encoding: 'utf8' });
  console.log(out.trim());
} catch (e) {
  console.error(e.message);
}
