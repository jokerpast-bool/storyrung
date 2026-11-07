/**
 * 重置 demo 用户：清空词汇状态 / 进度 / 复习卡 / 作答记录，等级回到未测评。
 * 用途：演示前把站点恢复到"新用户"状态。只影响 demo 用户，不碰内容表。
 *
 * 用法：node ../../node_modules/tsx/dist/cli.mjs scripts/reset-demo.ts
 */
import { prisma } from "../lib/db";
import { DEMO_USER_EMAIL } from "../lib/services/user";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
  if (!user) {
    console.log("· 没有 demo 用户，无需重置");
    return;
  }
  await prisma.attempt.deleteMany({ where: { userId: user.id } });
  await prisma.userVocabState.deleteMany({ where: { userId: user.id } });
  await prisma.chapterProgress.deleteMany({ where: { userId: user.id } });
  await prisma.reviewCard.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({
    where: { id: user.id },
    data: { level: "unknown", vocabSize: 0, levelConfidence: 0 },
  });
  console.log("· 已重置 demo 用户：等级未测评、进度清零、复习队列清空");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
