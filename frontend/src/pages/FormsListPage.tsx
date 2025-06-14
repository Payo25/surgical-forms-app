import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = '/api';
const API_URL = `${API_BASE_URL}/forms`;

const FormsListPage: React.FC = () => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const userRole = localStorage.getItem('role') || 'Registered Surgical Assistant';
  const [currentPage, setCurrentPage] = useState(1);
  const formsPerPage = 15;

  useEffect(() => {
    fetch(API_URL)
      .then(res => res.json())
      .then(data => {
        const userId = localStorage.getItem('userId');
        let filtered = data;
        if (userRole === 'Registered Surgical Assistant' && userId) {
          filtered = data.filter((form: any) => form.createdByUserId === parseInt(userId));
        }
        setForms(filtered);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load forms.');
        setLoading(false);
      });
  }, [userRole]);

  // Download CSV handler
  const handleDownloadCSV = () => {
    if (!forms.length) return;
    // List all fields except image fields
    const headers = [
      'ID',
      'Patient Name',
      'Date of Birth',
      'Insurance Company',
      'Health Center Name',
      'Surgery Date',
      'Time In',
      'Time Out',
      "Doctor's Name",
      'Procedure',
      'Case Type',
      'Status',
      'Created By',
      'Created At',
      'Last Modified'
    ];
    const csvRows = [headers.join(',')];
    forms.forEach(form => {
      const row = [
        '"' + (form.id || '') + '"',
        '"' + (form.patientName || '') + '"',
        '"' + (new Date(form.dob).toLocaleString() || '') + '"',
        '"' + (form.insuranceCompany || '') + '"',
        '"' + (form.healthCenterName || '') + '"',
        '"' + (form.date || '') + '"', // Surgery date
        '"' + (form.timeIn || '') + '"',
        '"' + (form.timeOut || '') + '"',
        '"' + (form.doctorName || '') + '"',
        '"' + (form.procedure || '') + '"',
        '"' + (form.caseType || '') + '"',
        '"' + (form.status || '') + '"',
        '"' + (form.createdByFullName || form.createdBy || '') + '"',
        '"' + (form.createdAt ? new Date(form.createdAt).toLocaleString() : '') + '"',
        '"' + (form.lastModified ? new Date(form.lastModified).toLocaleString() : '') + '"'
      ];
      csvRows.push(row.join(','));
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `surgical-forms-report-${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pagination logic
  const indexOfLastForm = currentPage * formsPerPage;
  const indexOfFirstForm = indexOfLastForm - formsPerPage;
  const currentForms = forms.slice(indexOfFirstForm, indexOfLastForm);
  const totalPages = Math.ceil(forms.length / formsPerPage);

  return (
    <div
      role="main"
      aria-label="Surgical Forms List Section"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="responsive-card" style={{ maxWidth: 1000, width: '100%' }}>
        <a
          href="/dashboard"
          style={{
            display: 'inline-block',
            marginBottom: 24,
            padding: '12px 0',
            background: 'linear-gradient(90deg, #667eea 0%, #5a67d8 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(90,103,216,0.08)',
            transition: 'background 0.2s',
            width: '100%'
          }}
          tabIndex={0}
          aria-label="Back to Dashboard"
        >
          ← Back to Dashboard
        </a>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <img src={process.env.PUBLIC_URL + '/logo.jpg'} alt="App Logo" className="page-logo" />
        </div>
        <h2 style={{ color: '#2d3a4b', marginBottom: 16 }} tabIndex={0}>Surgical Forms</h2>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: '#e74c3c' }} role="alert">{error}</p>}
        {!loading && !error && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }} aria-label="Surgical Forms List">
              <thead>
                <tr style={{ background: '#f6f8fa' }}>
                  <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Patient</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Procedure</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Case Type</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Created By</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Date</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Status</th>
                  <th style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentForms.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 16, color: '#888' }}>No forms found.</td>
                  </tr>
                )}
                {currentForms.map(form => (
                  <tr key={form.id}>
                    <td style={{ padding: 8 }}>{form.patientName}</td>
                    <td style={{ padding: 8 }}>{form.procedure}</td>
                    <td style={{ padding: 8 }}>{form.caseType}</td>
                    <td style={{ padding: 8 }}>{form.createdByFullName || form.createdBy}</td>
                    <td style={{ padding: 8 }}>{form.date ? new Date(form.date).toLocaleDateString() : ''}</td>
                    <td style={{ padding: 8 }}>
                      {userRole === 'Business Assistant' ? (
                        <button
                          onClick={async () => {
                            const newStatus = form.status === 'processed' ? 'pending' : 'processed';
                            await fetch(`${API_URL}/${form.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: newStatus })
                            });
                            setForms(forms => forms.map(f => f.id === form.id ? { ...f, status: newStatus } : f));
                          }}
                          style={{
                            padding: '6px 16px',
                            borderRadius: 6,
                            background: form.status === 'processed'
                              ? 'linear-gradient(90deg, #bfc9d9 0%, #888 100%)'
                              : 'linear-gradient(90deg, #e74c3c 0%, #e67e22 100%)',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(231,76,60,0.08)',
                            transition: 'background 0.2s',
                          }}
                          tabIndex={0}
                          aria-label={`Toggle status for ${form.patientName}`}
                        >
                          {form.status === 'processed' ? 'Processed' : 'Pending'}
                        </button>
                      ) : (
                        form.status
                      )}
                    </td>
                    <td style={{ padding: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => navigate(`/forms/${form.id}`)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: 'linear-gradient(90deg, #43cea2 0%, #185a9d 100%)',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(67,206,162,0.08)',
                          transition: 'background 0.2s',
                          marginRight: 8
                        }}
                        tabIndex={0}
                        aria-label={`View form for ${form.patientName}`}
                      >
                        👁
                      </button>
                      {(userRole === 'Registered Surgical Assistant' || userRole === 'Business Assistant') && (
                        <button
                          onClick={() => navigate(`/forms/${form.id}/edit`)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: 'linear-gradient(90deg, #667eea 0%, #5a67d8 100%)',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(90,103,216,0.08)',
                            transition: 'background 0.2s',
                            marginRight: 8
                          }}
                          tabIndex={0}
                          aria-label={`Edit form for ${form.patientName}`}
                        >
                          ✏  
                        </button>
                      )}
                      {(userRole === 'Registered Surgical Assistant' || userRole === 'Business Assistant') && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Are you sure you want to delete the form for ${form.patientName}?`)) return;
                            try {
                              const res = await fetch(`${API_URL}/${form.id}`, { method: 'DELETE' });
                              if (res.ok) {
                                setForms(forms => forms.filter(f => f.id !== form.id));
                              } else {
                                alert('Failed to delete form.');
                              }
                            } catch {
                              alert('Failed to delete form.');
                            }
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: 'linear-gradient(90deg, #e74c3c 0%, #e67e22 100%)',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(231,76,60,0.08)',
                            transition: 'background 0.2s',
                            marginRight: 8
                          }}
                          tabIndex={0}
                          aria-label={`Delete form for ${form.patientName}`}
                        >
                          ❌
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, gap: 8 }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #bfc9d9', background: '#f6f8fa', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ alignSelf: 'center' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #bfc9d9', background: '#f6f8fa', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </>
        )}
        {!loading && !error && userRole === 'Business Assistant' && (
          <div style={{ margin: '16px 0', textAlign: 'right' }}>
            <button
              onClick={handleDownloadCSV}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                background: 'linear-gradient(90deg, #667eea 0%, #5a67d8 100%)',
                color: '#fff',
                border: 'none',
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer'
              }}
              tabIndex={0}
              aria-label="Download Report as CSV"
            >
              Download CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormsListPage;
