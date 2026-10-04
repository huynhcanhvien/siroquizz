import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const rows = [
  ["帮助", "giúp đỡ"],
  ["报纸", "báo"],
  ["宾馆", "khách sạn"],
  ["唱歌", "hát"],
  ["穿", "mặc"],
  ["错", "sai"],
  ["打篮球", "chơi bóng rổ"],
  ["但是", "nhưng"],
  ["到", "đến"],
  ["弟弟", "em trai"],
  ["第一", "thứ nhất"],
  ["懂", "hiểu"],
  ["对", "đúng"],
  ["房间", "phòng"],
  ["非常", "rất"],
  ["服务员", "nhân viên phục vụ"],
  ["高", "cao"],
  ["告诉", "nói cho biết"],
  ["哥哥", "anh trai"],
  ["给", "cho"],
];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" }),
  page = await browser.newPage();
await page.setContent(
  `<meta charset="utf-8"><style>section{break-after:page;font:24px Arial,sans-serif;padding:24px}section:last-child{break-after:auto}td{padding:15px;border:1px solid #888}table{border-collapse:collapse}</style>${Array.from(
    { length: 10 },
    (_, i) =>
      `<section><table>${rows
        .slice(i * 2, i * 2 + 2)
        .map(([term, definition]) => `<tr><td>${term}</td><td>${definition}</td></tr>`)
        .join("")}</table></section>`,
  ).join("")}`,
);
await page.pdf({ path: "evals/ai-generation/hsk2-10-pages.pdf", format: "A4" });
await browser.close();
const manifest = JSON.parse(await readFile("evals/ai-generation/manifest.json", "utf8"));
if (!manifest.some((f: { id: string }) => f.id === "hsk2-10-pages"))
  manifest.push({
    id: "hsk2-10-pages",
    file: "hsk2-10-pages.pdf",
    mime: "application/pdf",
    prompt:
      "Extract exactly 20 HSK2 words with accurate pinyin and the given Vietnamese meanings. Preserve the Vietnamese meanings.",
    termLang: "zh",
    count: 20,
    expected: rows,
  });
await writeFile("evals/ai-generation/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
