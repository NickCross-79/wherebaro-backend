import * as mongoDB from "mongodb";
import * as dotenv from "dotenv";
import * as dns from 'dns';

// Configure DNS to use Google/Cloudflare DNS servers
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

export const collections: { items?: mongoDB.Collection; current?: mongoDB.Collection; reviews?: mongoDB.Collection; likes?: mongoDB.Collection } = {}

export async function connectToDatabase () {
    dotenv.config();

    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("Error reading environment variable");
    }

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

    collections.items = itemsCollection;
    collections.current = currentCollection;
    collections.reviews = reviewsCollection;
    collections.likes = likesCollection;

    await reviewsCollection.createIndex({ item_oid: 1, uid: 1 }, { unique: true });
    await likesCollection.createIndex({ item_oid: 1, uid: 1 }, { unique: true });
      
    console.log(`Successfully connected to database: ${db.databaseName} and collections: ${itemsCollection.collectionName}, ${currentCollection.collectionName}, ${reviewsCollection.collectionName}, ${likesCollection.collectionName}`);
}