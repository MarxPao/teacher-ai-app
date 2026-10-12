import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopBridge {
  invoke(method: string, params?: Record<string, unknown>): Promise<any>
}

const bridge: DesktopBridge = {
  invoke: async (method: string, params: Record<string, unknown> = {}) => {
    return await ipcRenderer.invoke('teacher:call', { method, params })
  },
}

contextBridge.exposeInMainWorld('teacherDesktop', bridge)
contextBridge.exposeInMainWorld('teacherAi', {
  send: (method: string, params: Record<string, unknown> = {}) => bridge.invoke(method, params),
  invoke: (method: string, params: Record<string, unknown> = {}) => bridge.invoke(method, params),
})
