import { ObjectId } from "mongodb";

interface MarketDataPoint {
  datetime: string;
  volume: number;
  avg_price: number;
  mod_rank?: number;
  subtype?: string;
}

export default class Market {
  constructor(
    public item_oid: ObjectId,
    public data: MarketDataPoint[],
    public last_updated: Date
  ) {}
}
