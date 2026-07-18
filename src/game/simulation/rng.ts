export class DeterministicRng {
  constructor(public state = 0x0a11ce02) {}

  nextUint(): number {
    let value = this.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  between(minimum: number, maximum: number): number {
    return minimum + (this.nextUint() % (maximum - minimum + 1));
  }
}
