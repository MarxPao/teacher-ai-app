/**
 * Abstração de relógio para injeção de dependência em testes determinísticos.
 */
export interface Clock {
  now(): number
  toISOString(): string
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now()
  }

  toISOString(): string {
    return new Date().toISOString()
  }
}

export class FixedClock implements Clock {
  private currentTimestamp: number

  constructor(initialTimestamp: number) {
    this.currentTimestamp = initialTimestamp
  }

  set(timestamp: number): void {
    this.currentTimestamp = timestamp
  }

  advance(ms: number): void {
    this.currentTimestamp += ms
  }

  now(): number {
    return this.currentTimestamp
  }

  toISOString(): string {
    return new Date(this.currentTimestamp).toISOString()
  }
}

export const defaultClock: Clock = new SystemClock()
