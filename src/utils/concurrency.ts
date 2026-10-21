export class Semaphore {
  private _permits: number;
  private _queue: Array<() => void> = [];

  constructor(permits: number) {
    if (permits <= 0) {
      throw new Error('Permits must be strictly positive');
    }
    this._permits = permits;
  }

  async acquire(): Promise<void> {
    if (this._permits > 0) {
      this._permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._queue.push(resolve);
    });
  }

  release(): void {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      if (next) {
        next();
      }
    } else {
      this._permits++;
    }
  }

  /**
   * Helper to wrap a function call with the semaphore
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
