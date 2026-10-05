export type SkinId =
  | "fresh-cartoon"
  | "watercolor"
  | "tech-neon"
  | "mechanical-cartoon";

export type SkinOption = {
  id: SkinId;
  name: string;
  description: string;
};

export const SKIN_STORAGE_KEY = "pelton-toolbox-skin-v1";
export const DEFAULT_SKIN: SkinId = "tech-neon";

export const skinOptions: SkinOption[] = [
  {
    id: "fresh-cartoon",
    name: "清新卡通",
    description: "柔和灰蓝与轻量插画",
  },
  {
    id: "watercolor",
    name: "唯美水彩",
    description: "低饱和灰紫与水彩层次",
  },
  {
    id: "tech-neon",
    name: "科技霓虹",
    description: "深色界面与青紫高光",
  },
  {
    id: "mechanical-cartoon",
    name: "工程漫画",
    description: "沉静钢灰与机械线稿",
  },
];

export function isSkinId(value: string | null): value is SkinId {
  return skinOptions.some((option) => option.id === value);
}

export function readStoredSkin(): SkinId {
  try {
    const value = localStorage.getItem(SKIN_STORAGE_KEY);
    return isSkinId(value) ? value : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

export function applySkin(skin: SkinId) {
  document.documentElement.dataset.peltonSkin = skin;
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // The visual switch remains usable when browser storage is unavailable.
  }
}
