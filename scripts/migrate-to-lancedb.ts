import { Database } from "bun:sqlite"; // Required for reading legacy v0.1.0 database
import * as lancedb from "@lancedb/lancedb";
import { existsSync, statSync } from "fs";
// import * as sqliteVec from "sqlite-vec"; // Uncomment if running migration and install sqlite-vec
import { config } from "../src/config/index.js";
import { TABLE_NAME, memorySchema } from "../src/db/schema.js";

// Simple deserializer to avoid depending on the old package if we remove it
function deserializeVector(buffer: Uint8Array): number[] {
  return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
}

async function migrate() {
  const oldDbPath = config.dbPath; // e.g. ~/.local/share/vector-memory-mcp/memories.db (previously mcp-memory)
  const newDbPath = oldDbPath + ".lancedb";

  console.log(`Migrating from: ${oldDbPath}`);
  console.log(`Target: ${newDbPath}`);

  if (!existsSync(oldDbPath)) {
    console.error(`Error: Source database file does not exist at ${oldDbPath}`);
    return;
  }

  const stats = statSync(oldDbPath);
  console.log(`Source file size: ${stats.size} bytes`);

  let sqlite;
  try {
    sqlite = new Database(oldDbPath); 
    // sqliteVec.load(sqlite); // Uncomment if running migration
  } catch (e) {
    console.error("Failed to open legacy database:", e);
    return;
  }

  // Check if tables exist
  try {
    sqlite.query("SELECT count(*) FROM memories").get();
  } catch (e) {
    console.error("Memories table not found in legacy DB. Is this a valid v0.1.0 database?", e);
    return;
  }

  console.log("Reading data...");
  const rows = sqlite.query(`
    SELECT m.id, m.content, m.metadata, m.created_at, m.updated_at, m.superseded_by, v.embedding 
    FROM memories m 
    LEFT JOIN vec_memories v ON m.id = v.id
  `).all() as any[];

  console.log(`Found ${rows.length} memories to migrate.`);

  if (rows.length === 0) {
    console.log("No rows to migrate.");
    return;
  }

  // Transform data
  const data = rows.map(row => {
    let vector: number[];
    if (row.embedding) {
       vector = deserializeVector(row.embedding);
    } else {
       // Fallback for missing embeddings (shouldn't happen in valid DB)
       console.warn(`Warning: Memory ${row.id} missing embedding. using zero vector.`);
       vector = new Array(384).fill(0);
    }

    return {
      id: row.id,
      vector,
      content: row.content,
      metadata: row.metadata, // Already JSON string
      created_at: new Date(row.created_at).getTime(), // Convert ISO string to ms timestamp
      updated_at: new Date(row.updated_at).getTime(),
      superseded_by: row.superseded_by
    };
  });

  // Connect to new DB
  const db = await lancedb.connect(newDbPath);

  // Create table
  // Note: We use overwrite: true to ensure a clean slate for the migration target
  await db.createTable(TABLE_NAME, data, { schema: memorySchema, mode: 'overwrite' });

  console.log(`Successfully migrated ${data.length} records to ${newDbPath}`);
  console.log(`\nTo finalize, update your config to point to the new DB, or rename the folder:`);
  console.log(`mv "${newDbPath}" "${oldDbPath}"`); 
  // Note: LanceDB creates a DIRECTORY, while Legacy DB was a FILE. 
  // This might require some path adjustments in the user's setup if they expect a file.
}

migrate().catch(console.error);
