# Gallery Backend

Nothing to run: the gallery reads the app registry (frontend contract) and talks
to the desk through the shell's window-manager store. If apps later gain metadata
(images, descriptions, agent actions) a backend may serve it over the shell's IPC
contract (`modules/ipc`) — until then the registry is the single source of truth
and no state is faked here.
