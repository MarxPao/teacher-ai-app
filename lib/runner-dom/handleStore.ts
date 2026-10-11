// lib/runner-dom/handleStore.ts
// Gerenciamento de handles efêmeros de elementos DOM em memória

export class ElementHandleStore {
  private handles = new Map<string, Element>()
  private elementToId = new WeakMap<Element, string>()
  private counter = 0

  public getOrCreateHandle(element: Element): string {
    const existing = this.elementToId.get(element)
    if (existing && this.handles.has(existing)) {
      return existing
    }

    this.counter++
    const id = `el-handle-${this.counter}`
    this.handles.set(id, element)
    this.elementToId.set(element, id)
    return id
  }

  public getElement(id: string): Element | undefined {
    return this.handles.get(id)
  }

  public clear(): void {
    this.handles.clear()
    this.counter = 0
  }
}
