const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');
require('dotenv').config({ path: process.env.NODE_ENV === 'development' ? '.env.local' : '.env' });

// Multer setup for file uploads (memory storage for Drive upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('./'));

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test-cases-db';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

// Project Schema
const projectSchema = new mongoose.Schema(
  {
    slug: { type: String, unique: true, required: true }, // URL-friendly ID
    name: { type: String, required: true },
    description: String,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'projects' }
);

const Project = mongoose.model('Project', projectSchema);

// Test Case Schema
const testCaseSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    projectId: { type: String, required: true, default: 'default' },
    title: String,
    feature: String,
    priority: String,
    preconditions: String,
    testData: String,
    steps: String,
    expected: String,
    actual: String,
    status: String,
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'test_cases' }
);

// Compound unique index: id must be unique within each project
testCaseSchema.index({ id: 1, projectId: 1 }, { unique: true });

// Create Model
const TestCase = mongoose.model('TestCase', testCaseSchema);

// Execution Log Schema
const executionLogSchema = new mongoose.Schema(
  {
    testCaseId: { type: String, required: true },
    projectId: { type: String, required: true },
    testerName: { type: String, required: true },
    result: { type: String, required: true },
    notes: String,
    executedAt: { type: Date, default: Date.now },
    evidence: [{
      fileName: String,
      driveFileId: String,
      driveUrl: String,
      mimeType: String,
      uploadedAt: { type: Date, default: Date.now }
    }],
    driveFolderId: String,
    docUrl: String,
    duration: Number,
    environment: String,
    createdAt: { type: Date, default: Date.now }
  },
  { collection: 'execution_logs' }
);

// Index for efficient queries
executionLogSchema.index({ testCaseId: 1, projectId: 1, executedAt: -1 });

const ExecutionLog = mongoose.model('ExecutionLog', executionLogSchema);

// ============ GOOGLE DRIVE HELPERS ============

// Initialize Google Drive API
function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyFile) return null;

  return new google.auth.GoogleAuth({
    keyFile: keyFile,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents'
    ]
  });
}

function getDriveClient() {
  const auth = getAuth();
  if (!auth) {
    console.warn('Google Drive not configured: GOOGLE_SERVICE_ACCOUNT_KEY not set');
    return null;
  }
  return google.drive({ version: 'v3', auth });
}

function getDocsClient() {
  const auth = getAuth();
  if (!auth) return null;
  return google.docs({ version: 'v1', auth });
}

// Get or create a folder in Drive (supports Shared Drives)
async function getOrCreateFolder(drive, parentId, folderName) {
  // Search for existing folder
  const response = await drive.files.list({
    q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  if (response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  // Create new folder
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };

  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id',
    supportsAllDrives: true
  });

  return folder.data.id;
}

// Upload file to Drive (supports Shared Drives)
async function uploadFileToDrive(drive, folderId, file) {
  const bufferStream = new stream.PassThrough();
  bufferStream.end(file.buffer);

  let filename = file.originalname;
  try {
    filename = Buffer.from(filename, 'latin1').toString('utf8');
  } catch (e) {
    filename = file.originalname;
  }

  const fileMetadata = {
    name: filename,
    parents: [folderId]
  };

  const media = {
    mimeType: file.mimetype,
    body: bufferStream
  };

  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, webViewLink',
    supportsAllDrives: true
  });

  // Make file viewable by anyone with the link
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    },
    supportsAllDrives: true
  });

  return {
    driveFileId: response.data.id,
    driveUrl: response.data.webViewLink
  };
}

// Create execution folder structure
async function createExecutionFolder(drive, projectId, testCaseId, result) {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');
  }

  // Create project folder
  const projectFolderId = await getOrCreateFolder(drive, rootFolderId, projectId);

  // Create test case folder
  const testCaseFolderId = await getOrCreateFolder(drive, projectFolderId, testCaseId);

  // Create execution folder with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  const executionFolderName = `${timestamp}_${testCaseId}_${result}`;
  const executionFolderId = await getOrCreateFolder(drive, testCaseFolderId, executionFolderName);

  return executionFolderId;
}

// Create Google Doc report for execution
async function createExecutionDoc(docs, drive, driveFolderId, testCase, executionLog) {
  try {
    console.log(`[Docs] Creating document for test case: ${testCase.id} in folder: ${driveFolderId}`);

    // 1. Create an empty Google Doc directly in the execution folder via Drive API
    const driveResponse = await drive.files.create({
      requestBody: {
        name: `Test Report — ${testCase.id}: ${testCase.title}`,
        mimeType: 'application/vnd.google-apps.document',
        parents: [driveFolderId]
      },
      supportsAllDrives: true,
      fields: 'id, webViewLink'
    });
    const docId = driveResponse.data.id;
    console.log(`[Docs] Document created with ID: ${docId}`);

    // 2. Make the doc publicly readable
    await drive.permissions.create({
      fileId: docId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      },
      supportsAllDrives: true
    });

    // 3. Strip HTML tags from user-provided content
    const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, '').trim();
    const cleanTitle = stripHtml(testCase.title);
    const cleanExpected = stripHtml(testCase.expected) || '(none)';
    const cleanNotes = stripHtml(executionLog.notes) || '(none)';

    // 4. Build structured sections with tracked indices for styling
    const sections = [];
    let cursor = 1;
    const addSection = (text, type) => {
      sections.push({ text, type, start: cursor, end: cursor + text.length });
      cursor += text.length;
    };

    addSection(`Test Report: ${testCase.id}\n`, 'heading1');
    addSection(`${cleanTitle}\n\n`, 'subtitle');
    addSection(`Test Case Details\n`, 'heading2');
    addSection(`Project: `, 'label');
    addSection(`${executionLog.projectId}\n`, 'value');
    addSection(`Test Case ID: `, 'label');
    addSection(`${testCase.id}\n`, 'value');
    addSection(`Expected Result:\n`, 'label');
    addSection(`${cleanExpected}\n\n`, 'value');
    addSection(`Execution Result\n`, 'heading2');
    addSection(`Result: `, 'label');
    addSection(`${executionLog.result}\n`, 'value');
    addSection(`Tester: `, 'label');
    addSection(`${executionLog.testerName}\n`, 'value');
    addSection(`Executed: `, 'label');
    const executedDate = executionLog.executedAt.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    addSection(`${executedDate}\n`, 'value');
    addSection(`Notes:\n`, 'label');
    addSection(`${cleanNotes}\n\n`, 'value');
    addSection(`Evidence\n`, 'heading2');

    const fullText = sections.map(s => s.text).join('');

    // 5. Insert all text in one batchUpdate
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: fullText } }]
      }
    });

    // 6. Apply styling: headings + bold labels
    const styleRequests = [];
    for (const s of sections) {
      if (s.type === 'heading1') {
        styleRequests.push({
          updateParagraphStyle: {
            range: { startIndex: s.start, endIndex: s.end },
            paragraphStyle: { namedStyleType: 'HEADING_1' },
            fields: 'namedStyleType'
          }
        });
      } else if (s.type === 'subtitle') {
        styleRequests.push({
          updateParagraphStyle: {
            range: { startIndex: s.start, endIndex: s.end },
            paragraphStyle: { namedStyleType: 'SUBTITLE' },
            fields: 'namedStyleType'
          }
        });
      } else if (s.type === 'heading2') {
        styleRequests.push({
          updateParagraphStyle: {
            range: { startIndex: s.start, endIndex: s.end },
            paragraphStyle: { namedStyleType: 'HEADING_2' },
            fields: 'namedStyleType'
          }
        });
      } else if (s.type === 'label') {
        styleRequests.push({
          updateTextStyle: {
            range: { startIndex: s.start, endIndex: s.end },
            textStyle: { bold: true },
            fields: 'bold'
          }
        });
      }
    }

    if (styleRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: styleRequests }
      });
    }

    const textContent = fullText;

    // 6. Insert images if evidence exists
    if (executionLog.evidence && executionLog.evidence.length > 0) {
      // Insert before the last character (trailing newline) of our text block
      const insertIndex = textContent.length;

      const imageRequests = [];
      // Insert images in reverse order so they appear in correct order in the doc
      for (let i = executionLog.evidence.length - 1; i >= 0; i--) {
        const item = executionLog.evidence[i];
        if (item.driveFileId) {
          const imageUrl = `https://drive.google.com/uc?export=view&id=${item.driveFileId}`;
          imageRequests.push({
            insertInlineImage: {
              location: { index: insertIndex },
              uri: imageUrl,
              objectSize: {
                height: { magnitude: 300, unit: 'PT' },
                width: { magnitude: 400, unit: 'PT' }
              }
            }
          });
          // Add a newline after each image except the last
          if (i > 0) {
            imageRequests.push({
              insertText: {
                location: { index: insertIndex },
                text: '\n'
              }
            });
          }
        }
      }

      if (imageRequests.length > 0) {
        try {
          await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: {
              requests: imageRequests
            }
          });
          console.log(`[Docs] Inserted ${executionLog.evidence.length} images`);
        } catch (imgErr) {
          console.error('[Docs] Image insertion failed:', imgErr.message);
        }
      }
    }

    return `https://docs.google.com/document/d/${docId}/edit`;
  } catch (err) {
    console.error('Error creating execution doc:', err.message);
    throw err;
  }
}

// Routes

// ============ PROJECT ROUTES ============

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ name: 1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project
app.get('/api/projects/:slug', async (req, res) => {
  try {
    const project = await Project.findOne({ slug: req.params.slug });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new project
app.post('/api/projects', async (req, res) => {
  try {
    const project = new Project(req.body);
    await project.save();
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete project and its test cases
app.delete('/api/projects/:slug', async (req, res) => {
  try {
    const project = await Project.findOneAndDelete({ slug: req.params.slug });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    // Delete all test cases for this project
    await TestCase.deleteMany({ projectId: req.params.slug });
    res.json({ message: 'Project and test cases deleted', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ TEST CASE ROUTES ============

// Get all test cases (optionally filtered by project)
app.get('/api/test-cases', async (req, res) => {
  try {
    const filter = req.query.projectId ? { projectId: req.query.projectId } : {};
    const testCases = await TestCase.find(filter).sort({ id: 1 });
    res.json(testCases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single test case by ID
app.get('/api/test-cases/:id', async (req, res) => {
  try {
    const filter = { id: req.params.id };
    if (req.query.projectId) filter.projectId = req.query.projectId;
    const testCase = await TestCase.findOne(filter);
    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }
    res.json(testCase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new test case
app.post('/api/test-cases', async (req, res) => {
  try {
    // Ensure projectId is set
    if (!req.body.projectId) req.body.projectId = 'default';
    const testCase = new TestCase(req.body);
    await testCase.save();
    res.status(201).json(testCase);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update test case
app.put('/api/test-cases/:id', async (req, res) => {
  try {
    const filter = { id: req.params.id };
    if (req.query.projectId) filter.projectId = req.query.projectId;
    const testCase = await TestCase.findOneAndUpdate(
      filter,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }
    res.json(testCase);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete test case
app.delete('/api/test-cases/:id', async (req, res) => {
  try {
    const filter = { id: req.params.id };
    if (req.query.projectId) filter.projectId = req.query.projectId;
    const testCase = await TestCase.findOneAndDelete(filter);
    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }
    res.json({ message: 'Test case deleted', testCase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get test case statistics
app.get('/api/statistics', async (req, res) => {
  try {
    const stats = await TestCase.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);
    
    const byFeature = await TestCase.aggregate([
      {
        $group: {
          _id: '$feature',
          count: { $sum: 1 },
        },
      },
    ]);
    
    const byPriority = await TestCase.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      byStatus: stats,
      byFeature: byFeature,
      byPriority: byPriority,
      total: await TestCase.countDocuments(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ EXECUTION LOG ROUTES ============

// Create execution log with file upload
app.post('/api/executions', upload.array('evidence', 10), async (req, res) => {
  try {
    const { testCaseId, projectId, testerName, result, notes, duration, environment } = req.body;

    if (!testCaseId || !projectId || !testerName || !result) {
      return res.status(400).json({ error: 'testCaseId, projectId, testerName, and result are required' });
    }

    // Fetch TestCase for report generation
    const testCase = await TestCase.findOne({ id: testCaseId, projectId });

    let evidence = [];
    let driveFolderId = null;

    // Handle file uploads to Google Drive
    const drive = getDriveClient();
    if (req.files && req.files.length > 0 && drive) {
      try {
        // Create folder structure in Drive
        driveFolderId = await createExecutionFolder(drive, projectId, testCaseId, result);

        // Upload each file
        for (const file of req.files) {
          const uploadResult = await uploadFileToDrive(drive, driveFolderId, file);
          evidence.push({
            fileName: file.originalname,
            driveFileId: uploadResult.driveFileId,
            driveUrl: uploadResult.driveUrl,
            mimeType: file.mimetype,
            uploadedAt: new Date()
          });
        }
      } catch (driveError) {
        console.error('Google Drive upload error:', driveError.message);
        // Continue without evidence if Drive fails
      }
    }

    const executionLog = new ExecutionLog({
      testCaseId,
      projectId,
      testerName,
      result,
      notes,
      evidence,
      driveFolderId,
      duration: duration ? parseInt(duration) : undefined,
      environment
    });

    await executionLog.save();

    // Optionally update the test case status
    await TestCase.findOneAndUpdate(
      { id: testCaseId, projectId },
      { status: result, updatedAt: Date.now() }
    );

    res.status(201).json(executionLog);

    // Non-blocking: create Google Doc report
    (async () => {
      try {
        const docs = getDocsClient();
        const driveForDocs = getDriveClient();
        if (docs && driveForDocs && driveFolderId && testCase) {
          const docUrl = await createExecutionDoc(docs, driveForDocs, driveFolderId, testCase, executionLog);
          await ExecutionLog.findByIdAndUpdate(executionLog._id, { docUrl });
          console.log(`Google Doc created: ${docUrl}`);
        }
      } catch (docError) {
        console.error('Google Doc creation failed (non-blocking):', docError.message);
      }
    })();
  } catch (err) {
    console.error('Execution log error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Get execution history
app.get('/api/executions', async (req, res) => {
  try {
    const { testCaseId, projectId, limit = 20, skip = 0 } = req.query;

    const filter = {};
    if (testCaseId) filter.testCaseId = testCaseId;
    if (projectId) filter.projectId = projectId;

    const executions = await ExecutionLog.find(filter)
      .sort({ executedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await ExecutionLog.countDocuments(filter);

    res.json({ executions, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single execution log
app.get('/api/executions/:id', async (req, res) => {
  try {
    const execution = await ExecutionLog.findById(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: 'Execution log not found' });
    }
    res.json(execution);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete execution log
app.delete('/api/executions/:id', async (req, res) => {
  try {
    const execution = await ExecutionLog.findByIdAndDelete(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: 'Execution log not found' });
    }
    res.json({ message: 'Execution log deleted', execution });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check Google Drive configuration status
app.get('/api/drive-status', (req, res) => {
  const drive = getDriveClient();
  const configured = drive !== null && process.env.GOOGLE_DRIVE_FOLDER_ID;
  res.json({
    configured,
    message: configured
      ? 'Google Drive is configured'
      : 'Google Drive not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_DRIVE_FOLDER_ID in .env'
  });
});

// Import test cases from JSON file (one-time migration)
app.post('/api/import-json', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'dlc-all-test-cases.json'), 'utf8'));

    // Add projectId to each test case if not present
    const testCasesWithProject = data.map(tc => ({
      ...tc,
      projectId: tc.projectId || 'default'
    }));

    // Clear existing data for the default project only
    await TestCase.deleteMany({ projectId: 'default' });

    // Insert new data
    const result = await TestCase.insertMany(testCasesWithProject);
    res.json({ message: `Imported ${result.length} test cases`, count: result.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Migrate test cases to a project
app.post('/api/migrate-to-project', async (req, res) => {
  try {
    const { targetProject } = req.body;
    if (!targetProject) {
      return res.status(400).json({ error: 'targetProject is required' });
    }
    const result = await TestCase.updateMany(
      { $or: [{ projectId: { $exists: false } }, { projectId: 'default' }] },
      { $set: { projectId: targetProject } }
    );
    res.json({ message: `Migrated ${result.modifiedCount} test cases to ${targetProject}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root redirect to landing page
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// Start Server
const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
