export class ExclusiveOperation {
  private active = false;

  public run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active) {
      return Promise.reject(
        new Error('撮影または再合成の処理がすでに進行中です。'),
      );
    }

    this.active = true;
    return Promise.resolve()
      .then(operation)
      .finally(() => {
        this.active = false;
      });
  }
}
