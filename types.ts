
export interface Metadata {
  name: string;
  description: string;
  altText: string;
  caption: string;
  tags: string[];
}

export interface GeoLocation {
  lat: number;
  lng: number;
  name?: string;
}

export interface ProcessingOptions {
  generateMetadata: boolean;
  enhanceImage: boolean;
  embedExif: boolean;
  randomizeLocation: boolean;
}
