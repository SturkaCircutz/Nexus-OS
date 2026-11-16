# Calculator Backend

Reserved for shared compute (unit conversion, currency rates via the engine).
Arithmetic is frontend-only by design — a calculator that phones home for 2+2 is
lying about latency. Any later service speaks the shell's IPC contract
(`modules/ipc`).
