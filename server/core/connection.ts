import { Database } from "bun:sqlite";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "fs";
import { dirname } from "path";
import { removeVec0Tables, runMigrations } from "./migrations";

/** How long a starting process will wait for a concurrent vec0 cleanup to finish. */
const CLEANUP_LOCK_WAIT_MS = 15_000;
const CLEANUP_LOCK_POLL_MS = 250;

/**
 * Check (read-only) whether the database still contains legacy vec0 virtual
 * table entries. The destructive cleanup must only run when this is true —
 * it rewrites sqlite_master via the sqlite3 CLI, which is unsafe while other
 * connections hold the database open.
 */
function hasVec0Tables(dbPath: string): boolean {
  let db: Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE sql LIKE '%vec0%' LIMIT 1")
      .get();
    return row != null;
  } catch {
    // Unreadable / empty file — let the normal open path surface real errors
    return false;
  } finally {
    db?.close();
  }
}

function lockPid(lockPath: string): number | null {
  try {
    const pid = parseInt(readFileSync(lockPath, "utf8"), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the vec0 cleanup under an exclusive advisory lock so that N processes
 * starting against the same database never run the sqlite_master rewrite
 * concurrently. Losers wait for the winner, then re-probe (the winner's
 * cleanup makes the probe false).
 */
function guardedVec0Cleanup(dbPath: string): void {
  const lockPath = `${dbPath}.vec0-cleanup.lock`;
  const deadline = Date.now() + CLEANUP_LOCK_WAIT_MS;

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeSync(fd, String(process.pid));
        // Re-probe under the lock — another process may have cleaned up
        // between our first probe and lock acquisition.
        if (hasVec0Tables(dbPath)) {
          removeVec0Tables(dbPath);
        }
      } finally {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          // already gone — fine
        }
      }
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Lock held — if the holder died, clear the stale lock and retry.
      const pid = lockPid(lockPath);
      if (pid !== null && !isProcessAlive(pid)) {
        try {
          unlinkSync(lockPath);
        } catch {
          // raced with another process clearing it — fine
        }
        continue;
      }

      if (Date.now() > deadline) {
        throw new Error(
          `vec0 cleanup lock held too long (${lockPath}) — remove it manually if no other server is starting`,
        );
      }
      Bun.sleepSync(CLEANUP_LOCK_POLL_MS);
    }
  }
}

/**
 * Open (or create) a SQLite database at the given path
 * and run schema migrations.
 *
 * Safe for multiple concurrent processes sharing one database file:
 * the legacy vec0 cleanup only runs when a read-only probe finds vec0
 * entries (never for healthy databases) and is serialized by an exclusive
 * lock; migrations are user_version-gated inside an immediate transaction.
 */
export function connectToDatabase(dbPath: string): Database {
  mkdirSync(dirname(dbPath), { recursive: true });

  // Remove orphaned vec0 virtual table entries before bun:sqlite opens the
  // database. bun:sqlite cannot modify sqlite_master, so this uses the
  // sqlite3 CLI — gated behind a read-only probe and an exclusive lock.
  if (existsSync(dbPath) && hasVec0Tables(dbPath)) {
    guardedVec0Cleanup(dbPath);
  }

  const db = new Database(dbPath);

  // busy_timeout FIRST: it is per-connection and needs no lock, while the
  // WAL switch takes an exclusive lock — without the timeout, concurrent
  // processes opening a fresh db race it and fail with SQLITE_BUSY.
  db.exec("PRAGMA busy_timeout=5000");
  // WAL mode for concurrent read performance
  db.exec("PRAGMA journal_mode=WAL");

  // Ensure schema is up to date
  runMigrations(db);

  return db;
}
