import { invoke } from '@tauri-apps/api/core'

import type { IPCCommand, IPCRequest, IPCResponse } from '@/types/ipc'

export function useIPC() {
  async function send(command: IPCCommand, args: Record<string, unknown>) {
    const request: IPCRequest = { command, args }
    return invoke<IPCResponse>('ipc_dispatch', { request })
  }
  return { send }
}
