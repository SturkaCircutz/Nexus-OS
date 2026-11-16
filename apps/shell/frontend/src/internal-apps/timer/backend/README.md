# Timer Backend

Reserved for real countdown semantics (repeating timers, pomodoro cycles, wake
alarms via the engine). Until then the widget is self-contained: wall-clock
deadlines in the frontend, persisted to `localStorage`.

Nothing here may fake system state; when a backend exists it will expose honest
values over the shell's IPC contract (`modules/ipc`).
