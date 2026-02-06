import * as mongoDB from "mongodb";
import * as dotenv from "dotenv";
import * as dns from 'dns';

// Configure DNS to use Google/Cloudflare DNS servers
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

export const collections: { 
  items?: mongoDB.Collection; 
  current?: mongoDB.Collection; 
  reviews?: mongoDB.Collection; 
  likes?: mongoDB.Collection;
  pushTokens?: mongoDB.Collection;
  unknownItems?: mongoDB.Collection;
} = {}

let isConnected = false;

export async function connectToDatabase () {
    if (isConnected) return;

    dotenv.config();

    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("Error reading environment variable");
    }

    console.log('[DB] Connecting to MongoDB...');

    const client = new mongoDB.MongoClient(uri, {
    serverApi: {
        version: mongoDB.ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
    });

    await client.connect();
        
    const db: mongoDB.Db = client.db("wherebaro");
  
    const itemsCollection: mongoDB.Collection = db.collection("items");
    const currentCollection: mongoDB.Collection = db.collection("current");
    const reviewsCollection: mongoDB.Collection = db.collection("reviews");
    const likesCollection: mongoDB.Collection = db.collection("likes");
    const pushTokensCollection: mongoDB.Collection = db.collection("pushTokens");
    const unknownItemsCollection: mongoDB.Collection = db.collection("unknownItems");

    collections.items = itemsCollection;
    collections.current = currentCollection;
    collections.reviews = reviewsCollection;
    collections.likes = likesCollection;
    collections.pushTokens = pushTokensCollection;
    collections.unknownItems = unknownItemsCollection;

    await reviewsCollection.createIndex({ item_oid: 1, uid: 1 }, { unique: true });
    await likesCollection.createIndex({ item_oid: 1, uid: 1 }, { unique: true });
    await pushTokensCollection.createIndex({ token: 1 }, { unique: true });
    await pushTokensCollection.createIndex({ isActive: 1 });

    await unknownItemsCollection.createIndex({ uniqueName: 1 }, { unique: true });

    isConnected = true;
    console.log(`[DB] Connected to database: ${db.databaseName} (collections: items, current, reviews, likes, pushTokens, unknownItems)`);
}