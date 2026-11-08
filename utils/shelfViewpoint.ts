export type BoardFaces = {
  front: number;
  under: number;
  deck: number;
};

/** 棚の中央を目の高さにし、上ほど下面、下ほど上面が見える量を返す。 */
export function boardFaces(index: number, boardCount: number): BoardFaces {
  const center = (boardCount - 1) / 2;
  const t = center <= 0 ? (index === 0 ? 1 : -1) : (center - index) / center;

  if (index === 0) {
    return { front: 16, under: 32, deck: 0 };
  }

  const front = 14;
  if (t > 0.18) {
    return { front, under: Math.max(8, Math.round(20 * Math.pow(t, 0.8))), deck: 0 };
  }
  if (t < -0.18) {
    return {
      front,
      under: 0,
      deck: Math.max(6, Math.round(32 * Math.pow(-t, 1.25))),
    };
  }
  return { front, under: 0, deck: 0 };
}
