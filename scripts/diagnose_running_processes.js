const { execSync } = require('child_process');

const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*powershell*' } | ForEach-Object { [PSCustomObject]@{ Id = $_.ProcessId; ParentId = $_.ParentProcessId; Cmd = $_.CommandLine } } | ConvertTo-Json"`;

try {
  const result = execSync(psCmd, { encoding: 'utf8' });
  const list = JSON.parse(result);
  console.log(JSON.stringify(list, null, 2));
} catch (e) {
  console.error(e.message);
}
