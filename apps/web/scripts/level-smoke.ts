/**
 * 词汇量测评自检：验证「出题 → 判分 → 估词汇量」这条服务端链路。
 * 用法：node ../../node_modules/tsx/dist/cli.mjs scripts/level-smoke.ts
 */
import { prisma } from "../lib/db";
import { BUCKETS, estimateVocabSize, levelFromVocab } from "../lib/domain/level";
import { buildLevelTest, gradeLevelTest } from "../lib/services/level-test";

async function main() {
  const items = await buildLevelTest(4);
  console.log(`· 出题 ${items.length} 题（目标 ${BUCKETS.length} 段 × 4）`);

  for (const item of items.slice(0, 2)) {
    console.log(`  ${item.lemma} ${item.phonetic} [${item.bandLabel}]`);
    for (const option of item.options) console.log(`     ${option.id}. ${option.text}`);
  }

  // 逐题找出正确选项（用判分接口反查，避免测试复制一份正确答案）
  const correctAnswers: { itemId: string; chosen: string }[] = [];
  const wrongAnswers: { itemId: string; chosen: string }[] = [];
  for (const item of items) {
    let correctText = "";
    for (const option of item.options) {
      const graded = await gradeLevelTest([{ itemId: item.id, chosen: option.text }]);
      if (graded[0]?.correct) {
        correctText = option.text;
        break;
      }
    }
    if (!correctText) throw new Error(`题目 ${item.lemma} 没有判出正确选项`);
    correctAnswers.push({ itemId: item.id, chosen: correctText });
    const wrong = item.options.find((option) => option.text !== correctText);
    if (wrong) wrongAnswers.push({ itemId: item.id, chosen: wrong.text });
  }

  async function evaluate(answers: { itemId: string; chosen: string }[], label: string) {
    const graded = await gradeLevelTest(answers);
    const bands = BUCKETS.map((bucket) => ({ band: bucket.band, total: 0, correct: 0 }));
    for (const row of graded) {
      const band = bands.find((b) => b.band === row.item.band);
      if (!band) continue;
      band.total += 1;
      if (row.correct) band.correct += 1;
    }
    const vocab = estimateVocabSize(bands);
    const correctCount = graded.filter((row) => row.correct).length;
    console.log(
      `· ${label}：答对 ${correctCount}/${graded.length} → 词汇量 ${vocab} · 等级 ${levelFromVocab(vocab)}`,
    );
    return { vocab, correctCount };
  }

  const allRight = await evaluate(correctAnswers, "全部答对");
  const allWrong = await evaluate(wrongAnswers, "全部答错");

  const ok = allRight.vocab === 8000 && allWrong.vocab === 500;
  console.log(ok ? "✔ 出题/判分/估分链路正常" : "✘ 估分异常");
  if (!ok) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
