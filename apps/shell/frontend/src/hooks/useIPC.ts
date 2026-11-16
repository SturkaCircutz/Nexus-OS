import { invoke } from '@tauri-apps/api/core'

import type { IPCArgsMap, IPCCommand, IPCRequest, IPCResponse } from '@/types/ipc'

export function useIPC() {
  async function send<C extends IPCCommand>(command: C, args: IPCArgsMap[C]) {
    const request = { command, args } as IPCRequest<C>
    return invoke<IPCResponse>('ipc_dispatch', { request })
  }
  return { send }
}
