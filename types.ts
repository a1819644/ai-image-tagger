
export interface Metadata {
  name: string;
  description: string;
  altText: string;
  caption: string;
  tags: string[];
  website?: string;              // Company website URL
  tagCategories?: TagCategory[]; // Organized tag structure
}

export interface CompanyInfo {
  name: string;                   // Official company name
  website: string;                // Company website URL
  phone?: string;                 // Phone number (for NAP)
  address?: string;               // Physical address (for NAP)
}

export interface TagCategory {
  category: string;               // e.g., "Product", "Service", "Location"
  tags: string[];                 // Tags in this category
}

export interface GeoLocation {
  lat: number;
  lng: number;
  name?: string;
  address?: string;               // Optional full address for geocoding
}

export interface ProcessingOptions {
  generateMetadata: boolean;
  enhanceImage: boolean;
  embedExif: boolean;
  randomizeLocation: boolean;
  useManualMetadata: boolean;     // NEW: Override AI with manual input
}
