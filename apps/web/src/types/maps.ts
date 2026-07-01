export interface MapCategory {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface MapStructure {
  id: string;
  name: string;
  description: string | null;
  category: string;
  createdBy: string;
  createdAt: string;
  creator?: { id: string; name: string };
  _count?: { maps: number };
  maps?: IndicatorMap[];
}

export interface IndicatorMap {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  structureId: string | null;
  flowData: any | null;
  createdAt: string;
  category: MapCategory;
  _count?: { entries: number };
  entries?: MapEntry[];
}

export interface MapEntry {
  id: string;
  mapId: string;
  indicatorId: string;
  positionX: number;
  positionY: number;
  indicator: any; // full Indicator with values
}
