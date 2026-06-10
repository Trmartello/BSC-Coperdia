export type IndicatorType = 'INPUT' | 'CALCULATED';
export type MeasureUnit = 'CURRENCY' | 'PERCENTAGE' | 'NUMBER' | 'DAYS' | 'INDEX';
export type Periodicity = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type IndicatorStatus = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NO_DATA';
export type UserRole = 'ADMIN' | 'CONTROLADORIA' | 'GESTOR' | 'DIRETORIA';

export interface Indicator {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  type: IndicatorType;
  unit: MeasureUnit;
  periodicity: Periodicity;
  responsible?: string;
  active: boolean;
  sortOrder: number;
  formula?: Formula;
  parents?: IndicatorRelation[];
  children?: IndicatorRelation[];
}

export interface Formula {
  id: string;
  indicatorId: string;
  expression: string;
  variables: Record<string, string>;
  description?: string;
}

export interface IndicatorRelation {
  id: string;
  parentId: string;
  childId: string;
  weight: number;
  parent?: Partial<Indicator>;
  child?: Partial<Indicator>;
}

export interface RealizedValue {
  id: string;
  indicatorId: string;
  period: string;
  value: number;
}

export interface ForecastValue {
  id: string;
  indicatorId: string;
  scenarioId?: string;
  period: string;
  value: number;
  isManual: boolean;
}

export interface Goal {
  id: string;
  indicatorId: string;
  period: string;
  value: number;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  isBaseline: boolean;
  period: string;
  createdAt: string;
  userId: string;
}

export interface ScenarioValue {
  id: string;
  scenarioId: string;
  indicatorId: string;
  period: string;
  value: number;
  delta: number;
  deltaPercent: number;
  status: IndicatorStatus;
  indicator: Indicator;
}

export interface IndicatorCard {
  indicator: Indicator;
  realized: number | null;
  forecast: number | null;
  goal: number | null;
  effective: number | null;
  deviationGoal: number | null;
  deviationForecast: number | null;
  status: IndicatorStatus;
}

export interface TreeNode extends Indicator {
  children: TreeNode[];
  circular?: boolean;
}

export interface ImpactChain {
  indicatorId: string;
  affectedIndicators: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}
