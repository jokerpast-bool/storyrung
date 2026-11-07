import Link from "next/link";

import LevelTest from "@/components/level/LevelTest";
import { buildLevelTest } from "@/lib/services/level-test";
import { getDemoUser } from "@/lib/services/user";

export const dynamic = "force-dynamic";

export default async function LevelTestPage() {
  const user = await getDemoUser();
  const items = await buildLevelTest(4);

  return (
    <main>
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 30 }}>词汇量测评</h1>
          <p className="muted small" style={{ margin: 0 }}>
            当前：{user.level === "unknown" ? "未测评" : `${user.level === "cet6" ? "六级" : "四级"} / ${user.vocabSize} 词`}
          </p>
        </div>
        <Link href="/library" className="btn ghost">
          回书库
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="empty">题库还没生成，先跑一遍内容管线与 seed。</div>
      ) : (
        <div style={{ maxWidth: 620 }}>
          <LevelTest
            items={items.map((item) => ({
              id: item.id,
              lemma: item.lemma,
              phonetic: item.phonetic,
              pos: item.pos,
              band: item.band,
              bandLabel: item.bandLabel,
              options: item.options,
            }))}
          />
        </div>
      )}
    </main>
  );
}
