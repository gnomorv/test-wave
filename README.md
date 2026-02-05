# Test Case App

A test case management application with MongoDB Atlas backend.

## MongoDB Connection

| Setting | Value |
|---------|-------|
| **Database** | `test_case_db` |
| **Cluster** | Cluster0 |
| **User** | `juanarce_db_user` |
| **Host** | `cluster0.ro4f5il.mongodb.net` |

## Server Configuration

| Setting | Value |
|---------|-------|
| **Port** | 3001 |
| **Environment** | development |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/test-cases` | Get all test cases |
| GET | `/api/test-cases/:id` | Get single test case |
| POST | `/api/test-cases` | Create test case |
| PUT | `/api/test-cases/:id` | Update test case |
| DELETE | `/api/test-cases/:id` | Delete test case |
| GET | `/api/statistics` | Get dashboard statistics |
| POST | `/api/import-json` | Import data from JSON file |
| GET | `/api/health` | Server health check |

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file (copy from `.env.example`):
   ```
   MONGODB_URI=mongodb+srv://juanarce_db_user:<password>@cluster0.ro4f5il.mongodb.net/test_case_db?retryWrites=true&w=majority&appName=Cluster0
   PORT=3001
   NODE_ENV=development
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

4. Access the application at `http://localhost:3001`

## Data Migration

To import existing JSON data to MongoDB:
```bash
curl -X POST http://localhost:3001/api/import-json
```

## MongoDB Atlas Network Access

Ensure your IP address is whitelisted in MongoDB Atlas:
1. Go to MongoDB Atlas > Network Access
2. Click "Add IP Address"
3. Add your current IP or `0.0.0.0/0` for development
