/**
 * 画像棚の配置・ページング検証（DB非破壊）
 * 実行: node scripts/verify-image-shelf-paging.mjs
 */

const PAGE_SIZE = 20;
const BAYS = [
  { bay: 0, size: 110, sitY: 152, xs: [122, 280, 439, 597, 755] },
  { bay: 1, size: 110, sitY: 286, xs: [122, 280, 439, 597, 755] },
  { bay: 2, size: 110, sitY: 432, xs: [95, 231, 367, 504, 640] },
  { bay: 3, size: 110, sitY: 592, xs: [228, 366, 504, 642, 780] },
];

const SPINE_RIGHT = 212;
const VINYL_LEFT = 770;

function pageCount(n) {
  if (n <= 0) return 1;
  return Math.ceil(n / PAGE_SIZE);
}

function clampPage(page, n) {
  const max = Math.max(0, pageCount(n) - 1);
  return Math.max(0, Math.min(page, max));
}

function slotsForPage(pageIndex) {
  const slots = [];
  let local = 0;
  for (const layout of BAYS) {
    layout.xs.forEach((x, slot) => {
      const globalIndex = pageIndex * PAGE_SIZE + local;
      local += 1;
      slots.push({
        pageIndex,
        bay: layout.bay,
        slot,
        globalIndex,
        x,
        y: layout.sitY - layout.size,
        width: layout.size,
        height: layout.size,
      });
    });
  }
  return slots;
}

function place(count) {
  const pages = pageCount(count);
  const result = [];
  for (let p = 0; p < pages; p++) {
    const start = p * PAGE_SIZE;
    const pageItems = Array.from(
      { length: Math.min(PAGE_SIZE, Math.max(0, count - start)) },
      (_, i) => start + i
    );
    const slots = slotsForPage(p);
    const placed = slots
      .map((s, i) => {
        const itemIndex = pageItems[i];
        if (itemIndex === undefined) return null;
        return { itemIndex, ...s };
      })
      .filter(Boolean);
    result.push({ page: p + 1, placed });
  }
  return result;
}

const cases = [0, 1, 5, 6, 20, 21, 40, 41];
let failed = 0;

console.log("=== 固定装飾との非重複 ===");
const allSlots = slotsForPage(0);
const bay3slot0 = allSlots.find((s) => s.bay === 3 && s.slot === 0);
const bay2slot4 = allSlots.find((s) => s.bay === 2 && s.slot === 4);
const spineGap = bay3slot0.x - SPINE_RIGHT;
const vinylGap = VINYL_LEFT - (bay2slot4.x + bay2slot4.width);
console.log(
  `4段目左端 x=${bay3slot0.x} vs 背表紙右端 ${SPINE_RIGHT} → gap ${spineGap}px`
);
console.log(
  `3段目右端 right=${bay2slot4.x + bay2slot4.width} vs レコード左 ${VINYL_LEFT} → gap ${vinylGap}px`
);
console.log(`1ページ枠数: ${allSlots.length}`);
if (allSlots.length !== 20 || spineGap < 1 || vinylGap < 1) {
  console.error("FAIL: 配置衝突または枠数不正");
  failed += 1;
} else {
  console.log("OK: 20枠・固定装飾と非重複");
}

console.log("\n=== 件数別配置 ===");
for (const n of cases) {
  const pages = place(n);
  const pc = pageCount(n);
  const notes = [];

  if (n === 0) {
    notes.push(pages[0].placed.length === 0 ? "固定装飾のみ" : "ERR");
  }
  if (n === 1) {
    const p = pages[0].placed[0];
    notes.push(
      p?.bay === 0 && p?.slot === 0 ? "1件目=左上" : `ERR ${JSON.stringify(p)}`
    );
  }
  if (n === 5) {
    notes.push(
      pages[0].placed.length === 5 &&
        pages[0].placed.every((p) => p.bay === 0)
        ? "1段目5件"
        : "ERR"
    );
  }
  if (n === 6) {
    const sixth = pages[0].placed[5];
    notes.push(
      sixth?.bay === 1 && sixth?.slot === 0 ? "6件目=2段目左" : "ERR"
    );
  }
  if (n === 20) {
    notes.push(
      pc === 1 && pages[0].placed.length === 20 ? "1ページ20件" : "ERR"
    );
  }
  if (n === 21) {
    const first = pages[1]?.placed[0];
    notes.push(
      pc === 2 && first?.bay === 0 && first?.slot === 0 && first?.itemIndex === 20
        ? "21件目=2ページ左上"
        : "ERR"
    );
  }
  if (n === 40) {
    notes.push(
      pc === 2 && pages[1].placed.length === 20 ? "2ページ満杯" : "ERR"
    );
  }
  if (n === 41) {
    const first = pages[2]?.placed[0];
    notes.push(
      pc === 3 && first?.bay === 0 && first?.slot === 0 && first?.itemIndex === 40
        ? "41件目=3ページ左上"
        : "ERR"
    );
  }

  const ok = notes.every((t) => !t.startsWith("ERR"));
  if (!ok) failed += 1;
  console.log(
    `${ok ? "OK" : "FAIL"} n=${n} pages=${pc} → ${notes.join(", ")}`
  );
}

console.log("\n=== 削除後ページ補正 ===");
const afterDelete = clampPage(2, 20); // was page3 of 41, now 20 items
console.log(
  `41件でpage2表示中→20件に削除: clamp → ${afterDelete} (expect 0)`
);
if (afterDelete !== 0) failed += 1;

console.log(failed === 0 ? "\nALL PASSED" : `\nFAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
