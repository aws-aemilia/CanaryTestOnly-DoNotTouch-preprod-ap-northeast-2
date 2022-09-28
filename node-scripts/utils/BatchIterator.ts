export class BatchIterator<T> {
  private index = 0;

  constructor(private arr: T[], private batchSize: number) {}

  [Symbol.iterator]() {
    return this;
  }
  public next() {
    const arrayBatch = this.arr.slice(this.index, this.index + this.batchSize);

    this.index += this.batchSize;

    return arrayBatch.length > 0
      ? { value: arrayBatch, done: false }
      : { value: [], done: true };
  }
}
