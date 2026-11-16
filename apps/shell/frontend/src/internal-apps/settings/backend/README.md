# Settings Backend

Reserved for the preferences that need a process: agent voice/audio, engine
connection details, wallpaper assets. Theme is stored by the shell's theme
provider today; when settings persist, they move behind the shell's IPC contract
(`modules/ipc`) — nothing here fakes system state.
