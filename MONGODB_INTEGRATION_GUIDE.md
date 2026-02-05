# MongoDB Integration Guide for Test Case App

## Overview
This guide walks you through integrating MongoDB to replace the local JSON file storage in your test case app.

---

## Step 1: MongoDB Atlas Setup

### Create MongoDB Atlas Cluster
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up or log in to your account
3. Create a new project: "Test Case App"
4. Create a cluster (M0 Free tier recommended for development)
5. Choose your cloud provider and region

### Network Access & IP Whitelist
1. Go to **Network Access** in Atlas
2. Click **Add IP Address**
3. Add: `190.171.112.166/32` (your provided IP)
4. Click **Confirm**

### Create Database User
1. Go to **Database Access**
2. Click **Add Database User**
3. **Username:** `juanarce_db_user` (as provided)
4. **Password:** Generate a strong password and save it securely
5. **Database User Privileges:** Select "Built-in Role: Atlas Admin"
6. Click **Add User**

### Get Connection String
1. Click **Connect** button on your cluster
2. Select "Connect your application"
3. Choose **Node.js** as the driver
4. Copy the connection string
5. Format: `mongodb+srv://juanarce_db_user:<PASSWORD>@<CLUSTER>.mongodb.net/test-cases-db?retryWrites=true&w=majority&authSource=admin`

---

## Step 2: Local Setup

### Install Dependencies
```bash
cd "/Users/juanarce/Downloads/Test Wave"
npm install
```

### Configure Environment Variables
1. Rename `.env.example` to `.env`
2. Update `MONGODB_URI` with your connection string
3. Replace `<PASSWORD>` with your database user password
4. Replace `<CLUSTER>` with your cluster name

Example:
```
MONGODB_URI=mongodb+srv://juanarce_db_user:MyPassword123@cluster0.abcde.mongodb.net/test-cases-db?retryWrites=true&w=majority&authSource=admin
PORT=3000
NODE_ENV=development
```

---

## Step 3: Start the Server

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000`

---

## Step 4: Migrate Data

### One-Time Import from JSON
Make a POST request to import your existing test cases:

```bash
curl -X POST http://localhost:3000/api/import-json
```

Or add a button to your dashboard:
```javascript
async function importTestCases() {
  const response = await fetch('http://localhost:3000/api/import-json', {
    method: 'POST'
  });
  const data = await response.json();
  alert(`Imported ${data.count} test cases`);
}
```

---

## Step 5: Update Frontend

### Update HTML Files
Replace all references to the local JSON file with API calls:

#### Example: Get All Test Cases
**Before:**
```javascript
fetch('./dlc-all-test-cases.json')
  .then(r => r.json())
  .then(data => { /* process */ })
```

**After:**
```javascript
fetch('http://localhost:3000/api/test-cases')
  .then(r => r.json())
  .then(data => { /* process */ })
```

---

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/test-cases` | Get all test cases |
| GET | `/api/test-cases/:id` | Get specific test case |
| POST | `/api/test-cases` | Create new test case |
| PUT | `/api/test-cases/:id` | Update test case |
| DELETE | `/api/test-cases/:id` | Delete test case |
| GET | `/api/statistics` | Get dashboard statistics |
| POST | `/api/import-json` | Import from JSON file |
| GET | `/api/health` | Server health check |

---

## Example API Usage

### Get All Test Cases
```bash
curl http://localhost:3000/api/test-cases
```

### Get Specific Test Case
```bash
curl http://localhost:3000/api/test-cases/TC_1_001
```

### Update Test Case Status
```bash
curl -X PUT http://localhost:3000/api/test-cases/TC_1_001 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Pass",
    "actual": "Application submitted successfully"
  }'
```

### Get Statistics
```bash
curl http://localhost:3000/api/statistics
```

---

## Frontend Integration Examples

### Load Test Cases in Dashboard
```javascript
async function loadTestCases() {
  const response = await fetch('http://localhost:3000/api/test-cases');
  const testCases = await response.json();
  // Process and display test cases
}
```

### Update Test Case
```javascript
async function updateTestCase(id, updates) {
  const response = await fetch(`http://localhost:3000/api/test-cases/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return response.json();
}
```

### Save New Test Case
```javascript
async function saveTestCase(testCaseData) {
  const response = await fetch('http://localhost:3000/api/test-cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testCaseData)
  });
  return response.json();
}
```

---

## Troubleshooting

### Connection Issues
- Verify IP whitelist includes `190.171.112.166/32`
- Check username/password are correct
- Ensure .env file has correct MONGODB_URI
- Test connection: `curl http://localhost:3000/api/health`

### Authentication Errors
- Confirm database user was created with "Admin" privileges
- Verify password doesn't contain special characters that need escaping
- If password has special chars, URL-encode them (e.g., `@` → `%40`)

### CORS Issues
- CORS is already enabled in server.js for all origins
- If needed, restrict to specific domains:
  ```javascript
  app.use(cors({
    origin: ['http://localhost:3000', 'https://yourdomain.com']
  }));
  ```

---

## Security Best Practices

1. **Never commit .env file** - Add to .gitignore
2. **Use strong passwords** for database user
3. **Whitelist only necessary IPs** - Update as needed
4. **Rotate credentials regularly** in production
5. **Use environment-specific configs** for dev/prod
6. **Enable database backups** in MongoDB Atlas
7. **Monitor access logs** in MongoDB Atlas

---

## Next Steps

1. Install dependencies: `npm install`
2. Set up MongoDB Atlas account and cluster
3. Configure .env with your connection string
4. Start server: `npm run dev`
5. Import existing test cases: `curl -X POST http://localhost:3000/api/import-json`
6. Update HTML files to use API endpoints
7. Test in browser - no changes needed to UI/UX!

