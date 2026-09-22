// Web Worker エントリ：メインスレッドを固めずに次の一手を探索する
import { configureMercenaries } from "../core/abilities.js";
import { findBestMove } from "./search.js";

self.onmessage = (e) => {
  const { state, mercenaryDefs, options } = e.data;
  configureMercenaries(mercenaryDefs);
  const move = findBestMove(state, options);
  self.postMessage({ move });
};
