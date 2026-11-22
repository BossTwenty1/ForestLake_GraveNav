import type { PublicBurialRecord } from "./supabase/types";

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const MEMORIAL_INSCRIPTIONS: Record<string, string> = {
  "tomas kuwento":
    "A beloved patriarch, storyteller, and grandfather whose quiet wisdom and steady faith guided generations. Forever resting in God's eternal peace.",
  "fernando kuwento":
    "A devoted son and dear friend whose warm laughter and generous heart brightened every gathering. Always cherished and never forgotten.",
  "katrina maharlika":
    "A beloved mother, teacher, and grandmother whose kindness and grace shaped the lives of all who knew her. Forever resting in God's eternal peace.",
  "amihan maharlika":
    "A gentle daughter and bright spirit remembered for her compassion, curiosity, and radiant smile. Held forever in loving memory.",
  "basilio bituin":
    "A steadfast husband, father, and craftsman who lived with humility and quiet strength. May his soul rest in everlasting peace.",
  "rafael bituin":
    "A cherished elder and mentor whose integrity, patience, and devotion to family remain a guiding light for generations to come.",
  "nicanor alaala":
    "A loving father and faithful friend remembered for his warm counsel, ready hand, and enduring care for his community.",
  "paolo alaala":
    "A devoted husband, grandfather, and man of deep faith whose gentle presence brought comfort to every home he entered.",
  "rosalie luntian":
    "A loving mother, sister, and friend whose warmth and tenderness filled our days with joy. Forever treasured in our hearts.",
  "rommel luntian":
    "A dedicated father and trusted colleague whose quiet perseverance and cheerful spirit left a lasting mark on everyone he met.",
  "rosa maligaya":
    "A sweet daughter and caring soul whose kindness bloomed wherever she went. Gone too soon, yet forever remembered with love.",
  "fidel maligaya":
    "A devoted father, brother, and loyal friend whose honesty and gentle humor brought peace to those around him.",
  "lino tahanan":
    "A beloved grandfather and pillar of the family whose sheltering love made every house a home. Resting now in eternal serenity.",
  "iñigo tahanan":
    "A kindhearted son and brother remembered for his hopeful spirit, loyalty, and boundless affection for his family.",
  "emilio dalisay":
    "A gentle husband, father, and elder remembered for his pure heart, quiet dignity, and lifelong devotion to his loved ones.",
  "leila dalisay":
    "A treasured matriarch and grandmother whose prayers, hospitality, and gentle grace blessed four generations. Forever in God's care.",
  "crisanto gunita":
    "A caring father and respected neighbor whose steady wisdom and generous deeds live on in the hearts of all who knew him.",
  "noel gunita":
    "A beloved husband, father, and grandfather whose joyful songs and warm embrace made every season feel like home.",
  "julius ligaya":
    "A devoted family man and kindhearted friend who shared laughter freely and stood faithfully beside those he loved.",
  "alma ligaya":
    "A loving mother and nurturing soul whose gentle encouragement and joyful faith comforted all who turned to her.",
  "fernando liwanag":
    "A loving brother and steadfast friend whose bright outlook and selfless care lit the path for those around him.",
  "amihan dangal":
    "A graceful young woman of quiet courage and deep kindness, forever remembered for the beauty she brought into our lives.",
  "rafael hiraya":
    "A beloved grandfather and dreamer whose hopeful vision and unwavering love continue to inspire his family every day.",
  "paolo salaysay":
    "A cherished father and keeper of family stories whose laughter and gentle wisdom remain woven into our lives.",
  "rommel payapa":
    "A peacemaker, loving husband, and dedicated father whose calm spirit brought harmony to every room he entered.",
  "fidel sinag":
    "A faithful father and tireless provider whose warmth and resilience shone like morning light for his family.",
  "iñigo halimbawa":
    "A sincere son and loyal companion who led by quiet example and treated every person with genuine respect.",
  "leila banaag":
    "A radiant daughter and treasured friend whose brief life left an unforgettable glow of kindness and hope.",
  "noel kuwento":
    "A beloved grandfather and lifelong educator whose gentle lessons and fond stories remain treasured in every memory.",
  "alma maharlika":
    "A devoted mother, grandmother, and community pillar whose compassionate service and grace will never be forgotten.",
  "lorena bituin":
    "A loving mother and loyal friend whose generous spirit and quiet courage guided her family through every season.",
  "miguel alaala":
    "A caring father, brother, and hardworking soul remembered for his steady heart and deep devotion to his loved ones.",
  "reynaldo luntian":
    "A bright and gentle son whose curiosity, warmth, and easy smile remain forever cherished by family and friends.",
  "marisol maligaya":
    "A beloved great-grandmother whose century of grace, warmth, and unwavering prayer blessed all who gathered around her.",
  "iris tahanan":
    "A tender mother and grandmother whose welcoming table and comforting words gave strength to all who knew her.",
  "isabel dalisay":
    "A graceful mother and faithful friend whose sincerity, kindness, and quiet faith touched countless lives.",
  "adela gunita":
    "A devoted mother and thoughtful soul whose warmth and gentle remembrance live on in the hearts of her family.",
  "elisa ligaya":
    "A joyful mother, sister, and friend whose bright laughter and compassionate heart brought light to every day.",
  "miko liwanag":
    "A loving son and vibrant spirit remembered for his creativity, kindness, and the warmth he shared with everyone.",
  "celia dangal":
    "A noble matriarch and loving grandmother whose dignity, patience, and deep faith guided her family across the decades.",
  "diana hiraya":
    "A devoted mother and mentor who encouraged every dream with tenderness, wisdom, and unfailing belief in others.",
  "nina salaysay":
    "A cherished mother and warm confidante whose gentle humor and thoughtful listening made everyone feel understood.",
  "mara payapa":
    "A serene and loving mother whose gentle grace and quiet devotion brought comfort and peace to her family.",
  "teresa sinag":
    "A caring sister, mother, and friend whose radiant kindness and steadfast hope continue to warm our memories.",
  "andres halimbawa":
    "A principled son and dear friend whose generous spirit and quiet strength remain an example to all who loved him.",
  "mila banaag":
    "A beloved grandmother and woman of deep prayer whose gentle smile and loving hands nurtured generations.",
  "vera kuwento":
    "A faithful mother and warmhearted friend whose honesty, kindness, and treasured memories remain forever with us.",
  "aida maharlika":
    "A gracious mother and dedicated caregiver whose selflessness and quiet elegance enriched every life she touched.",
  "lila bituin":
    "A tender mother and creative soul whose gentle presence shone brightly and remains forever in our hearts.",
  "clara alaala":
    "A loving daughter, sister, and friend remembered for her clear spirit, warm empathy, and unforgettable grace.",
  "tomas luntian":
    "A beloved grandfather and steward of the earth whose patience, hard work, and gentle wisdom blessed his family.",
  "katrina maligaya":
    "A cherished mother and grandmother whose cheerful spirit and generous heart made every gathering a celebration of love.",
  "basilio tahanan":
    "A devoted husband and father whose steady care and quiet sacrifice built a lasting legacy of love and security.",
  "nicanor dalisay":
    "A principled father and loyal neighbor remembered for his fair heart, gentle manner, and enduring integrity.",
  "rosalie gunita":
    "A loving daughter, wife, and friend whose sweet nature and heartfelt kindness live on in every cherished memory.",
  "rosa ligaya":
    "A warmhearted daughter and joyful soul whose laughter and compassion brightened the lives of all who knew her.",
  "lino liwanag":
    "A revered patriarch and grandfather whose calm guidance and faithful life illuminated the way for his entire family.",
  "emilio dangal":
    "A respected husband, father, and grandfather who walked with honor, humility, and steadfast devotion to his loved ones.",
  "crisanto hiraya":
    "A thoughtful father and supportive mentor whose encouragement and generous heart lifted everyone around him.",
  "julius salaysay":
    "A devoted husband and father remembered for his warm storytelling, gentle humor, and unwavering care for his family.",
  "fernando payapa":
    "A kindhearted son and gentle friend whose peaceful nature and sincere loyalty left lasting comfort in our hearts.",
  "amihan sinag":
    "A luminous young spirit remembered for her gentle courage, joyful kindness, and deep love for her family.",
  "rafael halimbawa":
    "A beloved grandfather and man of quiet virtue whose life of service and kindness remains our family's proudest example.",
  "paolo banaag":
    "A loving husband, father, and grandfather whose warm smile and hopeful faith brought light to every generation.",
  "rommel kuwento":
    "A dedicated father and loyal friend whose humor, warmth, and dependable love will always be remembered with gratitude.",
  "fidel maharlika":
    "A steadfast husband and caring father who met every day with quiet dedication, generosity, and love for his family.",
  "iñigo bituin":
    "A bright son and devoted brother whose gentle dreams and warm friendship remain forever shining in our memory.",
  "leila alaala":
    "A treasured matriarch and great-grandmother whose long life of prayer, wisdom, and tender love blessed all who knew her.",
  "noel luntian":
    "A beloved father and grandfather whose love for nature, calm spirit, and generous hands left the world gentler.",
  "alma maligaya":
    "A devoted mother and grandmother whose warm hospitality and joyful heart welcomed everyone as family.",
  "lorena tahanan":
    "A nurturing mother and steady anchor whose quiet devotion and unconditional love remain the heart of our home.",
  "miguel dalisay":
    "A kindhearted father, brother, and friend remembered for his honest work, warm smile, and selfless generosity.",
  "reynaldo gunita":
    "A cherished son and loyal friend whose vibrant spirit and thoughtful gestures remain deeply woven in our memories.",
  "marisol ligaya":
    "A beloved grandmother whose serene grace, gentle humor, and abundant love filled decades with warmth and blessing.",
  "iris liwanag":
    "A loving mother and guiding presence whose wisdom, kindness, and quiet faith continue to shine through her family.",
  "isabel dangal":
    "A gracious mother and respected mentor remembered for her quiet strength, compassion, and steadfast integrity.",
  "adela hiraya":
    "A loving mother and hopeful soul whose gentle encouragement and warmth inspired everyone fortunate to know her.",
  "elisa salaysay":
    "A devoted mother, sister, and friend whose thoughtful words and tender care brought joy to every family moment.",
  "miko payapa":
    "A gentle son and treasured friend remembered for his calm heart, quiet kindness, and sincere affection for others.",
  "celia sinag":
    "A cherished grandmother and woman of steadfast grace whose warmth and devotion illuminated the lives of her family.",
  "diana halimbawa":
    "A loving mother and faithful guide whose patience, generosity, and quiet example remain a blessing to us all.",
  "nina banaag":
    "A compassionate mother and dear friend whose gentle spirit and warm smile brought comfort in every season.",
  "mara kuwento":
    "A loving mother and warmhearted sister whose kindness, laughter, and cherished memories stay close to our hearts.",
  "teresa maharlika":
    "A graceful daughter, wife, and friend remembered for her generous spirit, quiet resilience, and deep love for family.",
  "andres bituin":
    "A beloved grandfather and patriarch whose enduring faith, gentle counsel, and steady love guided his family for decades.",
  "mila alaala":
    "A treasured mother and grandmother whose loving prayers, tender care, and fond memories remain forever in our hearts.",
  "vera luntian":
    "A devoted mother and gentle caretaker whose kindness, patience, and quiet grace nurtured everyone around her.",
  "aida maligaya":
    "A warmhearted mother and cheerful soul whose generosity and loving spirit filled every home with joy.",
  "lila tahanan":
    "A tender mother, sister, and friend whose sheltering kindness and bright warmth remain forever remembered.",
  "clara dalisay":
    "A gentle daughter and sincere friend remembered for her pure kindness, hopeful heart, and quiet grace.",
  "tomas gunita":
    "A cherished grandfather and keeper of family traditions whose wisdom, warmth, and devotion live on in every memory.",
  "katrina ligaya":
    "A beloved mother and grandmother whose joyful faith, gentle kindness, and loving presence blessed all who knew her.",
  "basilio liwanag":
    "A steadfast father and humble guide whose quiet strength and warm heart brought light to his family's path.",
  "nicanor dangal":
    "A devoted husband and father remembered for his honorable character, steady loyalty, and generous care for others.",
  "rosalie hiraya":
    "A loving daughter, sister, and dreamer whose gentle warmth and hopeful spirit remain treasured forever.",
  "rosa salaysay":
    "A sweet daughter and caring soul whose warmth, laughter, and quiet kindness left lasting memories with all who loved her.",
  "lino payapa":
    "A beloved grandfather and man of peace whose calm wisdom, humility, and deep love guided his family through the years.",
  "emilio sinag":
    "A cherished father and grandfather whose warm presence, steady faith, and generous spirit continue to shine in our lives.",
  "crisanto halimbawa":
    "A dedicated father and trusted friend whose integrity, patience, and quiet generosity remain an enduring example.",
  "julius banaag":
    "A loving father, brother, and friend whose hopeful heart and steady kindness brought light to everyone around him.",
};

const FALLBACK_INSCRIPTIONS = [
  "Forever loved, deeply missed, and remembered with gratitude. May their soul rest in God's eternal peace.",
  "A cherished life remembered for quiet kindness, enduring faith, and the love shared with family and friends.",
  "Held forever in loving memory, whose gentle warmth and grace continue to comfort all who knew them.",
  "In loving remembrance of a treasured soul, resting in serenity and carried always in our hearts.",
];

export function getMemorialInscription(
  record: Pick<PublicBurialRecord, "name" | "inscription">,
): string {
  const custom = record.inscription?.trim();
  if (custom) return custom;

  const key = normalizeName(record.name);
  if (key in MEMORIAL_INSCRIPTIONS) {
    return MEMORIAL_INSCRIPTIONS[key];
  }

  let hash = 0;
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_INSCRIPTIONS[hash % FALLBACK_INSCRIPTIONS.length];
}
