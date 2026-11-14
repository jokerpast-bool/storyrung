/**
 * 只刷新测评题库（不动书、章节、复习记录）。
 *
 *   node --import tsx scripts/reseed-level-items.ts
 *
 * 数据来源：../../data/dist/level-items.json（由 content-pipeline/level-items.mjs 生成）
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

interface RawLevelItem {
  lemma: string;
  band: number;
  definitionZh: string;
  pos?: string;
  freqRank: number;
}

const prisma = new PrismaClient();

async function main() {
  const path = join(process.cwd(), "..", "..", "data", "dist", "level-items.json");
  const items = JSON.parse(await readFile(path, "utf8")) as RawLevelItem[];
  if (!items.length) throw new Error(`题库为空：${path}`);

  await prisma.levelItem.deleteMany();
  await prisma.levelItem.createMany({
    data: items.map((item) => ({
      lemma: item.lemma,
      band: item.band,
      definitionZh: item.definitionZh,
      pos: item.pos ?? "",
      freqRank: item.freqRank,
    })),
  });

  const byBand = await prisma.levelItem.groupBy({ by: ["band"], _count: { _all: true } });
  console.log(`题库已刷新：${items.length} 条`);
  console.log(byBand.map((row) => `  第 ${row.band} 段 ${row._count._all}`).join("\n"));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
