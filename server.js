const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

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

// Import test cases from JSON file (one-time migration)
app.post('/api/import-json', async (req, res) => {
  try {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('./dlc-all-test-cases.json', 'utf8'));
    
    // Clear existing data
    await TestCase.deleteMany({});
    
    // Insert new data
    const result = await TestCase.insertMany(data);
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
