import * as mongoDB from "mongodb";
import * as dotenv from "dotenv";
import * as dns from 'dns';

// Configure DNS to use Google/Cloudflare DNS servers
//dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

export const collections: { items?: mongoDB.Collection; current?: mongoDB.Collection } = {}

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

    collections.items = itemsCollection;
    collections.current = currentCollection;
      
    console.log(`Successfully connected to database: ${db.databaseName} and collections: ${itemsCollection.collectionName}, ${currentCollection.collectionName}`);
}