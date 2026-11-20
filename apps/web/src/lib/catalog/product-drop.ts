/** Index to insert at after the dragged row has been removed. */
export function productDropIndex(from: number, to: number) {
  return from < to ? to - 1 : to;
}
