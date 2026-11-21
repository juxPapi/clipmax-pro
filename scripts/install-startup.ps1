$ErrorActionPreference = 'SilentlyContinue'
$startup = [Environment]::GetFolderPath('Startup')
$target = 'C:\Users\Philomena Osei Bonsu\Documents\faceless\Launch-Clipmax-Pro.bat'
$shortcut = Join-Path $startup 'Clipmax Pro.lnk'
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcut)
$sc.TargetPath = $target
$sc.WorkingDirectory = 'C:\Users\Philomena Osei Bonsu\Documents\faceless'
$sc.WindowStyle = 7
$sc.Description = 'Launch Clipmax Pro (local clipper studio)'
$sc.Save()
Write-Output "Startup shortcut: $shortcut"
Test-Path $shortcut
