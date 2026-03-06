import { MongoClient, Db, Collection } from "mongodb";
import {
  Follow,
  Market,
  StablecoinAsset,
  Strategy
} from "../domain/types.js";
import { createId } from "../utils/id.js";
import { DataStore } from "./dataStore.js";
import {
  createSeedMarkets,
  createSeedStablecoins,
  createSeedStrategies
} from "./seedData.js";

interface StoreCollections {
  markets: Collection<Market>;
  strategies: Collection<Strategy>;
  follows: Collection<Follow>;
  stablecoins: Collection<StablecoinAsset>;
}

const nowIso = (): string => new Date().toISOString();

const sortByCreatedAtDesc = { createdAt: -1 } as const;

export class MongoStore implements DataStore {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private db: Db | null;

  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
    this.dbName = dbName;
    this.db = null;
  }

  public async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.dbName);

    const collections = this.getCollections();

    await Promise.all([
      collections.markets.createIndex({ id: 1 }, { unique: true }),
      collections.strategies.createIndex({ id: 1 }, { unique: true }),
      collections.follows.createIndex({ id: 1 }, { unique: true }),
      collections.follows.createIndex({ userId: 1, strategyId: 1 }, { unique: true }),
      collections.stablecoins.createIndex({ symbol: 1 }, { unique: true })
    ]);

    await this.seedIfEmpty();
  }

  public async close(): Promise<void> {
    await this.client.close();
    this.db = null;
  }

  public async listMarkets(): Promise<Market[]> {
    return this.getCollections().markets.find({}, { projection: { _id: 0 } }).toArray();
  }

  public async listStablecoins(): Promise<StablecoinAsset[]> {
    return this.getCollections().stablecoins.find({}, { projection: { _id: 0 } }).toArray();
  }

  public async getMarketById(marketId: string): Promise<Market | undefined> {
    return this.getCollections().markets.findOne(
      { id: marketId },
      { projection: { _id: 0 } }
    ) as Promise<Market | undefined>;
  }

  public async listStrategies(): Promise<Strategy[]> {
    return this.getCollections()
      .strategies
      .find({}, { projection: { _id: 0 } })
      .sort(sortByCreatedAtDesc)
      .toArray();
  }

  public async getStrategyById(strategyId: string): Promise<Strategy | undefined> {
    return this.getCollections().strategies.findOne(
      { id: strategyId },
      { projection: { _id: 0 } }
    ) as Promise<Strategy | undefined>;
  }

  public async createStrategy(
    strategy: Omit<Strategy, "id" | "createdAt" | "followerCount">
  ): Promise<Strategy> {
    const created: Strategy = {
      ...strategy,
      id: createId(),
      followerCount: 0,
      createdAt: nowIso()
    };

    await this.getCollections().strategies.insertOne(created);
    return created;
  }

  public async listFollowsByUser(userId: string): Promise<Follow[]> {
    return this.getCollections()
      .follows
      .find({ userId }, { projection: { _id: 0 } })
      .sort(sortByCreatedAtDesc)
      .toArray();
  }

  public async getFollowByUserAndStrategy(
    userId: string,
    strategyId: string
  ): Promise<Follow | undefined> {
    return this.getCollections().follows.findOne(
      { userId, strategyId },
      { projection: { _id: 0 } }
    ) as Promise<Follow | undefined>;
  }

  public async createFollow(follow: Omit<Follow, "id" | "createdAt" | "status">): Promise<Follow> {
    const created: Follow = {
      ...follow,
      id: createId(),
      status: "active",
      createdAt: nowIso()
    };

    const collections = this.getCollections();

    await collections.follows.insertOne(created);
    await collections.strategies.updateOne(
      { id: follow.strategyId },
      { $inc: { followerCount: 1 } }
    );

    return created;
  }

  private getCollections(): StoreCollections {
    if (!this.db) {
      throw new Error("MongoStore is not connected.");
    }

    return {
      markets: this.db.collection<Market>("markets"),
      strategies: this.db.collection<Strategy>("strategies"),
      follows: this.db.collection<Follow>("follows"),
      stablecoins: this.db.collection<StablecoinAsset>("stablecoins")
    };
  }

  private async seedIfEmpty(): Promise<void> {
    const collections = this.getCollections();

    const [marketCount, strategyCount, stablecoinCount] = await Promise.all([
      collections.markets.countDocuments(),
      collections.strategies.countDocuments(),
      collections.stablecoins.countDocuments()
    ]);

    if (marketCount === 0) {
      await collections.markets.insertMany(createSeedMarkets());
    }

    if (strategyCount === 0) {
      await collections.strategies.insertMany(createSeedStrategies());
    }

    if (stablecoinCount === 0) {
      await collections.stablecoins.insertMany(createSeedStablecoins());
    }
  }
}
