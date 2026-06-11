# MongoDB DNS SRV Fix Report

## 1. Root Cause
When connecting to a MongoDB Atlas cluster via a `mongodb+srv://` connection string, Mongoose (and the underlying MongoDB Node.js driver) attempts to perform a DNS SRV query (`querySrv`) to discover the individual hostnames of the replica set.
In certain network environments (such as behind specific firewalls, VPNs, or with misconfigured ISP/local DNS resolvers), the local DNS server fails to resolve these SRV records, throwing an `ECONNREFUSED` error during the `querySrv` system call. This prevents the server from initializing and connecting to MongoDB Atlas.

---

## 2. Files Changed

### Backend Database Module
* [db.ts](file:///d:/Git-Projects/SocialFlow/server/src/database/db.ts)
  * Imported the native Node.js `dns` module.
  * Added fallback retry logic within `connectDb()` to handle DNS SRV query failures specifically.
  * Ensures that **only** MongoDB Atlas is used (no local mock databases, `MongoMemoryServer`, or JSON file fallbacks are reintroduced).

### Backend Authentication / OAuth Module
* [zenuxs-oauth.service.ts](file:///d:/Git-Projects/SocialFlow/server/src/features/auth/zenuxs-oauth.service.ts)
  * Updated the `redirectUri` from the Vite frontend URL (`FRONTEND_URL`) to the Express backend URL (`http://localhost:${env.PORT}` or `BACKEND_URL`).
  * Resolves the `"invalid_request" / "Invalid redirect_uri"` error when redirecting to/from the Zenuxs Auth provider, since the OAuth server expects the backend Express server callback route to handle token exchanges.

### Backend API Test Suite
* [apiTest.ts](file:///d:/Git-Projects/SocialFlow/server/src/tests/apiTest.ts)
  * Added the `connectDb()` call at startup to establish a connection before running tests.
  * Fixed assertion logic where Mongoose `ObjectId` objects were compared using strict equality (`===`), which failed because they are separate objects in memory. Switched to comparing their string representations via `.toString()`.
  * Added `process.exit(0)` at the end of the successful test run to terminate the Node process cleanly.

---

## 3. DNS Fallback Implementation
The fallback logic catches the initial database connection failure and checks if the error code is `ECONNREFUSED` and the syscall is `querySrv`. If so, it overrides the local DNS servers with public DNS servers (Google and Cloudflare) and retries the connection:

```typescript
async function connectDb() {
  try {
    console.log(`🔌 Connecting to MongoDB Atlas: ${MONGO_URI.replace(/\/\/.*@/, '//***:***@')}`);
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      retryWrites: true,
      dbName: process.env.MONGO_DB_NAME || undefined
    });
    console.log('✅ MongoDB Atlas connected.');
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' && error.syscall === 'querySrv') {
      console.warn("⚠️ DNS SRV resolution failed. Retrying with Google/Cloudflare public DNS servers...");
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        await mongoose.connect(MONGO_URI, {
          serverSelectionTimeoutMS: 8000,
          retryWrites: true,
          dbName: process.env.MONGO_DB_NAME || undefined
        });
        console.log('✅ MongoDB Atlas connected.');
        return;
      } catch (retryError: any) {
        console.error("❌ Database connection failed after retrying with public DNS:");
        console.error(retryError.message);
        throw retryError;
      }
    } else {
      console.error('❌ MongoDB Atlas connection failed:', error.message);
      throw new Error(`MongoDB Atlas connection failed: ${error.message}`);
    }
  }
}
```

---

## 4. Verification Results

### Automated Test Suite Execution
Running `npm run test:api` successfully invokes the DNS fallback, overrides the DNS configuration, connects to Atlas, and performs all test assertions successfully:

```
🧪 Starting SocialFlow Backend Test Suite...
🔌 Connecting to MongoDB Atlas: mongodb+srv://***:***@cluster0.zz3netc.mongodb.net/?appName=Cluster0
⚠️ DNS SRV resolution failed. Retrying with Google/Cloudflare public DNS servers...
✅ MongoDB Atlas connected.

--- Test 1: Database CRUD & Operators ---
 ✅ PASS: User should be created with an auto-generated _id
 ✅ PASS: User fields should match input
 ✅ PASS: findOne should retrieve the document by email
 ✅ PASS: updateOne with $set should modify fields

--- Test 2: Query Operators ($lte, $in) ---
 ✅ PASS: $lte operator should filter date fields correctly
 ✅ PASS: querying a primitive should match if array field contains it

--- Test 3: Token Operations & Cryptography ---
 ✅ PASS: bcrypt hashes should match the correct password
 ✅ PASS: generateAccessToken should return a token string
 ✅ PASS: generateRefreshToken should return a token string
 ✅ PASS: verifyRefreshToken should decode and return payload

🎉 Tests completed. Passed: 10, Failed: 0
```

1. **Atlas connection succeeds:** Verified in console output.
2. **Server starts normally:** Verified in Express startup & tests.
3. **No fallback database is used:** Mongoose is directly writing and reading from MongoDB Atlas (`mongodb+srv://...`).
4. **Authentication data persists in Atlas:** Verified by successfully writing a user to the database, retrieving it, updating it, and then cleaning up, all interacting directly with Mongoose schemas mapped to the Atlas cluster.
