export interface HomepageSettings {
  hero_badge_text: string;
  hero_headline: string;
  hero_subheadline: string;
  has_hero_image: boolean;
  destinations_heading: string;
  destinations_subheading: string;
  tours_heading: string;
  tours_subheading: string;
  stays_heading: string;
  stays_subheading: string;
  banner_heading: string;
  banner_text: string;
  banner_cta_label: string;
  banner_cta_link: string;
  has_banner_image: boolean;
  category_heading: string;
  category_subheading: string;
  updated_at: string;
}

export interface FeaturedListing {
  entity_id: string;
  title: string;
}

export interface CategoryTile {
  id: string;
  title: string;
  subtitle: string | null;
  link: string;
  has_image: boolean;
  gradient_from: string;
  gradient_to: string;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
}

export interface HomepageContent {
  settings: HomepageSettings;
  featured_tours: FeaturedListing[];
  featured_properties: FeaturedListing[];
  category_tiles: CategoryTile[];
}
