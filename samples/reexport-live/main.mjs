import { v, bump } from './mid.mjs';
let before = v;
let after = 0;
export function main() {
  after = bump();
  return before + after + v;
}
