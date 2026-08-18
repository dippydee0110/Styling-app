import { Slot } from "./types";

/**
 * Fixed regions (in a 300x500 viewBox) used both to draw the mock model SVG
 * and to position clickable hotspot overlays in ModelCanvas, so the two stay
 * in sync without any image analysis.
 */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: "rect" | "ellipse";
  label: string;
}

export const VIEWBOX = { width: 300, height: 500 };

export const SLOT_REGIONS: Record<Slot, Region> = {
  headwear: { x: 110, y: 18, width: 80, height: 46, shape: "ellipse", label: "Headwear" },
  jewelry: { x: 122, y: 118, width: 56, height: 22, shape: "rect", label: "Jewelry" },
  scarf: { x: 108, y: 128, width: 84, height: 34, shape: "rect", label: "Scarf" },
  outerwear: { x: 78, y: 150, width: 144, height: 160, shape: "rect", label: "Outerwear" },
  top: { x: 96, y: 158, width: 108, height: 140, shape: "rect", label: "Top" },
  dress: { x: 96, y: 158, width: 108, height: 260, shape: "rect", label: "Dress" },
  belt: { x: 96, y: 296, width: 108, height: 16, shape: "rect", label: "Belt" },
  bottom: { x: 100, y: 312, width: 100, height: 118, shape: "rect", label: "Bottom" },
  bag: { x: 214, y: 260, width: 58, height: 70, shape: "rect", label: "Bag" },
  shoes: { x: 96, y: 430, width: 108, height: 30, shape: "rect", label: "Shoes" },
};

export function regionToPercent(region: Region) {
  return {
    left: `${(region.x / VIEWBOX.width) * 100}%`,
    top: `${(region.y / VIEWBOX.height) * 100}%`,
    width: `${(region.width / VIEWBOX.width) * 100}%`,
    height: `${(region.height / VIEWBOX.height) * 100}%`,
  };
}
