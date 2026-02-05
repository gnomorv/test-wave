# Frontend Integration - JavaScript Snippets

Use these code snippets to update your HTML files to work with MongoDB backend.

## Global Configuration

Add this at the top of your script sections in HTML files:

```javascript
// API Configuration
const API_BASE_URL = 'http://localhost:3000';

// Utility function to handle API errors
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
```

---

## Dashboard Implementation

### Load Test Cases for Dashboard View

```javascript
async function loadTestCasesForDashboard() {
  try {
    const testCases = await apiCall('/api/test-cases');
    
    // Calculate statistics
    const stats = {
      total: testCases.length,
      passed: testCases.filter(t => t.status === 'Pass').length,
      failed: testCases.filter(t => t.status === 'Fail').length,
      blocked: testCases.filter(t => t.status === 'Blocked').length,
      inProgress: testCases.filter(t => t.status === 'In Progress').length,
      notTested: testCases.filter(t => t.status === 'Not Tested').length
    };
    
    // Update dashboard with stats
    document.getElementById('total-count').textContent = stats.total;
    document.getElementById('passed-count').textContent = stats.passed;
    document.getElementById('failed-count').textContent = stats.failed;
    document.getElementById('blocked-count').textContent = stats.blocked;
    document.getElementById('in-progress-count').textContent = stats.inProgress;
    document.getElementById('not-tested-count').textContent = stats.notTested;
    
    // Update charts if using Chart.js
    updateCharts(testCases);
    
    return testCases;
  } catch (error) {
    console.error('Failed to load test cases:', error);
    document.getElementById('error-message').textContent = 'Failed to load test cases';
  }
}

function updateCharts(testCases) {
  // Status Distribution
  const statusCounts = {};
  testCases.forEach(tc => {
    statusCounts[tc.status] = (statusCounts[tc.status] || 0) + 1;
  });
  
  const statusCtx = document.getElementById('statusChart')?.getContext('2d');
  if (statusCtx) {
    new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: [
            '#34a853', '#ea4335', '#fbbc04', '#ff69b4', '#bdc1c6'
          ]
        }]
      }
    });
  }
  
  // Feature Distribution
  const featureCounts = {};
  testCases.forEach(tc => {
    featureCounts[tc.feature] = (featureCounts[tc.feature] || 0) + 1;
  });
  
  const featureCtx = document.getElementById('featureChart')?.getContext('2d');
  if (featureCtx) {
    new Chart(featureCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(featureCounts),
        datasets: [{
          label: 'Test Cases by Feature',
          data: Object.values(featureCounts),
          backgroundColor: '#6AC8EF'
        }]
      }
    });
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', loadTestCasesForDashboard);
```

---

## Test Case Sheet Implementation

### Load and Display Test Cases Table

```javascript
async function loadTestCasesTable() {
  try {
    const testCases = await apiCall('/api/test-cases');
    
    const tableBody = document.getElementById('test-cases-table-body');
    tableBody.innerHTML = '';
    
    testCases.forEach(testCase => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="id-cell">${testCase.id}</td>
        <td class="title-cell">${testCase.title}</td>
        <td class="feature-cell">${testCase.feature}</td>
        <td class="priority-cell"><span class="priority-badge priority-${testCase.priority}">${testCase.priority}</span></td>
        <td class="status-cell"><span class="status-badge status-${testCase.status}">${testCase.status}</span></td>
        <td class="actions-cell">
          <button onclick="editTestCase('${testCase.id}')" class="btn-edit">Edit</button>
          <button onclick="deleteTestCase('${testCase.id}')" class="btn-delete">Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Failed to load table:', error);
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', loadTestCasesTable);
```

---

## Edit Test Case Modal

### Open and Save Changes

```javascript
let currentEditingId = null;

async function editTestCase(id) {
  try {
    const testCase = await apiCall(`/api/test-cases/${id}`);
    currentEditingId = id;
    
    // Populate modal form
    document.getElementById('modal-id').textContent = testCase.id;
    document.getElementById('modal-title').value = testCase.title;
    document.getElementById('modal-feature').value = testCase.feature;
    document.getElementById('modal-priority').value = testCase.priority;
    document.getElementById('modal-status').value = testCase.status;
    document.getElementById('modal-actual').value = testCase.actual;
    document.getElementById('modal-notes').value = testCase.notes;
    
    // Show modal
    document.getElementById('edit-modal').style.display = 'block';
  } catch (error) {
    console.error('Failed to load test case for editing:', error);
  }
}

async function saveTestCase() {
  try {
    const updates = {
      title: document.getElementById('modal-title').value,
      feature: document.getElementById('modal-feature').value,
      priority: document.getElementById('modal-priority').value,
      status: document.getElementById('modal-status').value,
      actual: document.getElementById('modal-actual').value,
      notes: document.getElementById('modal-notes').value
    };
    
    await apiCall(`/api/test-cases/${currentEditingId}`, 'PUT', updates);
    
    // Close modal and refresh table
    closeModal();
    loadTestCasesTable();
    alert('Test case updated successfully');
  } catch (error) {
    console.error('Failed to save test case:', error);
    alert('Error saving test case');
  }
}

function closeModal() {
  document.getElementById('edit-modal').style.display = 'none';
  currentEditingId = null;
}
```

---

## Delete Test Case

```javascript
async function deleteTestCase(id) {
  if (!confirm('Are you sure you want to delete this test case?')) {
    return;
  }
  
  try {
    await apiCall(`/api/test-cases/${id}`, 'DELETE');
    loadTestCasesTable();
    alert('Test case deleted successfully');
  } catch (error) {
    console.error('Failed to delete test case:', error);
    alert('Error deleting test case');
  }
}
```

---

## Search and Filter

```javascript
async function filterTestCases(filterType, filterValue) {
  try {
    const allTestCases = await apiCall('/api/test-cases');
    
    const filtered = allTestCases.filter(tc => {
      switch (filterType) {
        case 'status':
          return tc.status === filterValue;
        case 'priority':
          return tc.priority === filterValue;
        case 'feature':
          return tc.feature === filterValue;
        case 'search':
          return tc.title.toLowerCase().includes(filterValue.toLowerCase()) ||
                 tc.id.toLowerCase().includes(filterValue.toLowerCase());
        default:
          return true;
      }
    });
    
    displayFilteredResults(filtered);
  } catch (error) {
    console.error('Failed to filter test cases:', error);
  }
}

function displayFilteredResults(testCases) {
  const tableBody = document.getElementById('test-cases-table-body');
  tableBody.innerHTML = '';
  
  testCases.forEach(testCase => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${testCase.id}</td>
      <td>${testCase.title}</td>
      <td>${testCase.feature}</td>
      <td><span class="priority-badge">${testCase.priority}</span></td>
      <td><span class="status-badge">${testCase.status}</span></td>
      <td>
        <button onclick="editTestCase('${testCase.id}')">Edit</button>
        <button onclick="deleteTestCase('${testCase.id}')">Delete</button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}
```

---

## Create New Test Case

```javascript
async function createNewTestCase() {
  const newTestCase = {
    id: document.getElementById('new-id').value,
    title: document.getElementById('new-title').value,
    feature: document.getElementById('new-feature').value,
    priority: document.getElementById('new-priority').value,
    preconditions: document.getElementById('new-preconditions').value,
    testData: document.getElementById('new-testdata').value,
    steps: document.getElementById('new-steps').value,
    expected: document.getElementById('new-expected').value,
    actual: '',
    status: 'Not Tested',
    notes: ''
  };
  
  try {
    await apiCall('/api/test-cases', 'POST', newTestCase);
    loadTestCasesTable();
    alert('Test case created successfully');
    clearNewTestCaseForm();
  } catch (error) {
    console.error('Failed to create test case:', error);
    alert('Error creating test case');
  }
}

function clearNewTestCaseForm() {
  document.getElementById('new-id').value = '';
  document.getElementById('new-title').value = '';
  document.getElementById('new-feature').value = '';
  // ... clear other fields
}
```

---

## Import Test Cases from JSON

```javascript
async function importTestCasesFromJSON() {
  if (!confirm('This will import all test cases from the JSON file. Continue?')) {
    return;
  }
  
  try {
    const response = await apiCall('/api/import-json', 'POST');
    alert(`Successfully imported ${response.count} test cases`);
    loadTestCasesTable();
    loadTestCasesForDashboard();
  } catch (error) {
    console.error('Failed to import:', error);
    alert('Error importing test cases');
  }
}
```

---

## Implementation Checklist

- [ ] Add `API_BASE_URL` configuration and `apiCall()` function
- [ ] Replace `fetch('./dlc-all-test-cases.json')` with `apiCall('/api/test-cases')`
- [ ] Implement `loadTestCasesTable()` in test_case_sheet.html
- [ ] Implement `loadTestCasesForDashboard()` in test_case_dashboard.html
- [ ] Add edit/delete/create functionality
- [ ] Update all data loading on page initialization
- [ ] Test CRUD operations with MongoDB backend
- [ ] Verify charts update with live data

