db = db.getSiblingDB('test_case_db');

db.createCollection('projects');
db.createCollection('test_cases');
db.createCollection('execution_logs');

db.projects.createIndex({ slug: 1 }, { unique: true });
db.test_cases.createIndex({ id: 1, projectId: 1 }, { unique: true });
db.execution_logs.createIndex({ testCaseId: 1, projectId: 1, createdAt: -1 });

db.createUser({
  user: 'test_case_user',
  pwd: 'test_case_password',
  roles: [{ role: 'readWrite', db: 'test_case_db' }]
});
