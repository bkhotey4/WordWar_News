Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "."
WshShell.Run """C:\Program Files\nodejs\node.exe"" src/server.js", 0, False
WshShell.Run """C:\Program Files\nodejs\node.exe"" src/bot.js", 0, False
