import type { SetInput } from "@/lib/types";

export interface SampleSetLabels {
  ielts: { title: string; description: string };
  hsk: { title: string; description: string };
  travel: { title: string; description: string };
}

type Row = [term: string, definition: string, phonetic?: string];

const toCards = (rows: Row[]) =>
  rows.map(([term, definition, phonetic]) => ({ term, definition, ...(phonetic ? { phonetic } : {}) }));

const IELTS: Row[] = [
  ["abundant", "dồi dào, phong phú", "/əˈbʌndənt/"],
  ["accurate", "chính xác", "/ˈækjərət/"],
  ["benefit", "lợi ích", "/ˈbenɪfɪt/"],
  ["challenge", "thử thách", "/ˈtʃælɪndʒ/"],
  ["consequence", "hậu quả", "/ˈkɒnsɪkwəns/"],
  ["crucial", "cốt yếu, rất quan trọng", "/ˈkruːʃl/"],
  ["decline", "sự suy giảm", "/dɪˈklaɪn/"],
  ["efficient", "hiệu quả", "/ɪˈfɪʃnt/"],
  ["environment", "môi trường", "/ɪnˈvaɪrənmənt/"],
  ["significant", "đáng kể", "/sɪɡˈnɪfɪkənt/"],
  ["sustainable", "bền vững", "/səˈsteɪnəbl/"],
  ["tendency", "xu hướng", "/ˈtendənsi/"],
];

const HSK1: Row[] = [
  ["你好", "xin chào", "nǐ hǎo"],
  ["谢谢", "cảm ơn", "xièxie"],
  ["再见", "tạm biệt", "zàijiàn"],
  ["朋友", "bạn bè", "péngyou"],
  ["老师", "giáo viên", "lǎoshī"],
  ["学生", "học sinh", "xuésheng"],
  ["喜欢", "thích", "xǐhuan"],
  ["吃", "ăn", "chī"],
  ["喝", "uống", "hē"],
  ["水", "nước", "shuǐ"],
  ["中国", "Trung Quốc", "Zhōngguó"],
  ["学习", "học tập", "xuéxí"],
];

const TRAVEL: Row[] = [
  ["sân bay", "airport"],
  ["hộ chiếu", "passport"],
  ["khách sạn", "hotel"],
  ["đặt phòng", "book a room"],
  ["vé máy bay", "plane ticket"],
  ["hành lý", "luggage"],
  ["bản đồ", "map"],
  ["nhà ga", "train station"],
  ["hướng dẫn viên", "tour guide"],
  ["đổi tiền", "exchange money"],
];

export function buildSampleSets(labels: SampleSetLabels): SetInput[] {
  return [
    { ...labels.ielts, termLang: "en", definitionLang: "vi", source: "manual", cards: toCards(IELTS) },
    { ...labels.hsk, termLang: "zh", definitionLang: "vi", source: "manual", cards: toCards(HSK1) },
    { ...labels.travel, termLang: "vi", definitionLang: "en", source: "manual", cards: toCards(TRAVEL) },
  ];
}
