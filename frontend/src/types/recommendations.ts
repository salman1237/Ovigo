export interface RecommendedItem {
  item_type: "tour" | "property" | "vehicle";
  id: string;
  title: string;
  price: string;
  slug: string | null;
}

export const RECOMMENDED_ITEM_LINK_PREFIX: Record<RecommendedItem["item_type"], string> = {
  tour: "/tours",
  property: "/stays",
  vehicle: "/rent-a-car",
};
