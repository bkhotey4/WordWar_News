const { execSync } = require('child_process');

const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in (17580, 25712, 37088, 18916) } | ForEach-Object { [PSCustomObject]@{ Id = $_.ProcessId; Name = $_.Name; Cmd = $_.CommandLine } } | ConvertTo-Json"`;

try {
  console.log(execSync(psCmd, { encoding: 'utf8' }));
} catch (e) {
  console.error(e.message);
}
