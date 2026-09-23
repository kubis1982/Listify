export type UnitId = string;

export interface Unit {
  id: UnitId;
  symbol: string;
  isDefault?: boolean;
}
